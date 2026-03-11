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

    // Proxy messages from Google back to the Client
    googleWs.on('message', (data) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });

    // Proxy messages from the Client to Google
    ws.on('message', (data) => {
        if (googleWs.readyState === WebSocket.OPEN) {
            googleWs.send(data);
        }
    });

    googleWs.on('open', () => {
        console.log('Successfully bridged to Google Multimodal Live API');
    });

    googleWs.on('close', (code, reason) => {
        console.log(`Google connection closed: ${code} - ${reason}`);
        ws.close(code, reason);
    });

    ws.on('close', () => {
        console.log('Client session ended. Terminating Google bridge.');
        googleWs.close();
    });

    googleWs.on('error', (err) => {
        console.error('Google WebSocket error:', err);
        ws.send(JSON.stringify({ error: 'Upstream connection error' }));
    });

    ws.on('error', (err) => {
        console.error('Client WebSocket error:', err);
        googleWs.close();
    });
});
