import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { GoogleAuth } from 'google-auth-library';

dotenv.config();

const app = express();
app.use(cors());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'Aura Proxy is breathing', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 8080;
const PROXY_API_KEY = process.env.PROXY_API_KEY || '';
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

    // ── Proxy Authentication ──
    // If PROXY_API_KEY is set, validate the client's key from URL params
    if (PROXY_API_KEY) {
        try {
            const url = new URL(req.url || '/', `http://${req.headers.host}`);
            const clientKey = url.searchParams.get('key');
            if (clientKey !== PROXY_API_KEY) {
                console.warn('Client rejected: invalid API key');
                ws.close(4001, 'Unauthorized');
                return;
            }
        } catch (e) {
            console.warn('Client rejected: could not parse URL');
            ws.close(4001, 'Unauthorized');
            return;
        }
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

    // Proxy messages from the Client to Google
    ws.on('message', (data, isBinary) => {
        if (googleWs.readyState === WebSocket.OPEN) {
            googleWs.send(data, { binary: isBinary });
        }
    });

    googleWs.on('open', () => {
        console.log('Successfully bridged to Google Multimodal Live API');

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
