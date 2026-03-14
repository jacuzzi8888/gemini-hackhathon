import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleAuth } from 'google-auth-library';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'Aura Proxy is breathing', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 8080;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('WARNING: Supabase credentials entirely missing. Proxy auth will fail.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let secretClient = null;

/**
 * Retrieves an OAuth2 Access Token for Vertex AI.
 * Uses Service Account credentials from the environment.
 */
async function getAccessToken() {
    try {
        const auth = new GoogleAuth({
            scopes: 'https://www.googleapis.com/auth/cloud-platform',
        });
        const client = await auth.getClient();
        const token = await client.getAccessToken();
        return token.token;
    } catch (err) {
        console.error("Failed to retrieve Access Token:", err);
        return null;
    }
}

const server = app.listen(PORT, () => {
    console.log(`Aura Proxy listening on port ${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', async (ws, req) => {
    console.log('New client connection request to Aura Proxy');

    // ── Proxy Authentication (Supabase Asymmetric JWT) ──
    // The client sends the JWT via the subprotocol header (e.g., ["token", "eyJhbG..."])
    const authHeader = req.headers['sec-websocket-protocol'];
    let clientJwt = null;

    if (authHeader) {
        // The header can be a comma-separated string if multiple protocols are sent 
        // e.g., 'jwt, eyJhbGci...'
        const protocols = authHeader.split(',').map(p => p.trim());
        if (protocols.length === 2 && protocols[0] === 'jwt') {
            clientJwt = protocols[1];
        } else if (protocols.length === 1 && protocols[0].length > 20) {
            // Fallback if client just sent the token as the only protocol
            clientJwt = protocols[0];
        }
    }

    if (!clientJwt) {
        console.warn('Client rejected: No JWT found in sec-websocket-protocol');
        ws.close(4001, 'Unauthorized: Missing JWT');
        return;
    }

    // Verify the JWT locally with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(clientJwt);
    
    if (authError || !user) {
        console.warn('Client rejected: Invalid JWT', authError?.message);
        ws.close(4001, 'Unauthorized: Invalid Token');
        return;
    }
    
    console.log(`Authenticated user: ${user.id}`);

    // ── Context Injection (Phase 5) ──
    let userContextStr = "";
    try {
        // Fetch Preferences
        const { data: prefs } = await supabase
            .from('accessibility_preferences')
            .select('speech_rate, high_contrast_mode, allergies')
            .eq('user_id', user.id)
            .single();

        // Fetch AI Memory (last 10 context points for token economy)
        const { data: memories } = await supabase
            .from('ai_memory')
            .select('memory_type, content')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10);

        userContextStr += "\n-- PREFERENCES --\n";
        if (prefs) {
            userContextStr += `Speech Rate Preference: ${prefs.speech_rate}\n`;
            if (prefs.allergies && prefs.allergies.length > 0) {
                userContextStr += `CRITICAL ALLERGIES: ${prefs.allergies.join(', ')}\n`;
            }
        } else {
            userContextStr += "No explicit preferences set.\n";
        }

        userContextStr += "\n-- LONG-TERM MEMORY --\n";
        if (memories && memories.length > 0) {
            memories.forEach(m => {
                userContextStr += `[${m.memory_type.toUpperCase()}]: ${m.content}\n`;
            });
        } else {
            userContextStr += "No previous context.\n";
        }
    } catch (e) {
        console.error("Failed to fetch Context/Memory from Supabase:", e);
    }

    const accessToken = await getAccessToken();

    if (!accessToken) {
        console.error('CRITICAL: Access Token is missing. Proxy cannot function.');
        ws.close(1011, 'Internal Server Error: Auth Failed');
        return;
    }

    // Vertex AI Multimodal Live API WebSocket endpoint
    const project = process.env.GOOGLE_CLOUD_PROJECT || 'ocellus-488718';
    const location = 'us-central1';
    const googleUrl = `wss://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

    const googleWs = new WebSocket(googleUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    // ── Application-Level Heartbeat ──
    // Browser WebSocket API cannot send native pings.
    // We send server-side pings to keep the connection alive through load balancers.
    let heartbeatInterval = null;

    // Proxy messages from Google back to the Client
    googleWs.on('message', (data, isBinary) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data, { binary: isBinary });
        }
    });

    let hasSentSetup = false;

    // Proxy messages from the Client to Google
    ws.on('message', (data, isBinary) => {
        if (googleWs.readyState === WebSocket.OPEN) {
            if (!hasSentSetup && !isBinary) {
                try {
                    const msgStr = data.toString();
                    const msgJson = JSON.parse(msgStr);
                    
                    if (msgJson.setup && msgJson.setup.systemInstruction) {
                        // Inject our secure Supabase context into the prompt
                        console.log('Injecting Supabase Context into Gemini Setup...');
                        msgJson.setup.systemInstruction.parts[0].text += `\n\n${userContextStr}`;
                        googleWs.send(JSON.stringify(msgJson), { binary: false });
                        hasSentSetup = true;
                        return; // Successfully intercepted and injected
                    }
                } catch (e) {
                    // Not JSON or failed to parse, pass through normally
                    console.error('Error parsing client message for setup interception:', e);
                }
            }
            
            // Default pass-through behavior
            googleWs.send(data, { binary: isBinary });
        }
    });

    googleWs.on('open', () => {
        console.log('Successfully bridged to Google Multimodal Live API');

        // We can optionally intercept the initial `setup` message from the client 
        // to inject our secure context, but since the frontend sends its own setup, 
        // a more robust approach (for the hackathon) is having the proxy securely 
        // *construct* the setup, or inject the instructions here. 
        // Wait, the client sends its own `setup`. We must intercept it.

        // Start heartbeat: ping every 30 seconds to keep connection alive
        heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            }
            if (googleWs.readyState === WebSocket.OPEN) {
                googleWs.ping();
            }
        }, 30000);
    });

    googleWs.on('close', (code, reason) => {
        console.log(`Google connection closed: ${code} - ${reason}`);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        ws.close(code, reason);
    });

    ws.on('close', () => {
        console.log('Client session ended. Terminating Google bridge.');
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        googleWs.close();
    });

    googleWs.on('error', (err) => {
        console.error('Google WebSocket error:', err);
        ws.send(JSON.stringify({ error: 'Upstream connection error', code: 'UPSTREAM_ERROR' }));
    });

    ws.on('error', (err) => {
        console.error('Client WebSocket error:', err);
        googleWs.close();
    });

    // Handle pong responses (for connection health monitoring)
    ws.on('pong', () => {
        // Client is alive
    });
});
