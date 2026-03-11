const PRODUCTION_PROXY_URL = 'aura-proxy-432140310963.us-central1.run.app';
const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'localhost:8080'
    : PRODUCTION_PROXY_URL;

/**
 * LiveAPIClient handles the WebSocket connection to the Aura Proxy,
 * managing the bidirectional stream of audio/video to Gemini Multimodal Live API.
 */
export class LiveAPIClient {
    private ws: WebSocket | null = null;
    private readonly url: string;
    private onContentHandler: (text: string) => void = () => { };
    private onAudioHandler: (data: Int16Array) => void = () => { };
    private onDisconnectHandler: (reason: string) => void = () => { };
    private isConnected: boolean = false;

    constructor(url?: string) {
        if (url) {
            this.url = url;
        } else {
            // Use protocol-relative logic for the default URL
            const protocol = API_BASE_URL.includes('localhost') ? 'ws' : 'wss';
            this.url = `${protocol}://${API_BASE_URL}`;
        }
    }

    /**
     * Connects to the proxy and initializes the Gemini session.
     */
    async connect() {
        console.log("LiveAPIClient: Connecting to", this.url);
        return new Promise<void>((resolve, reject) => {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('LiveAPIClient: Connected to Aura Proxy');

                const sendSetup = () => {
                    if (this.ws?.readyState === WebSocket.OPEN) {
                        this.isConnected = true;
                        // Initial Setup Message for Vertex AI (camelCase required)
                        const setupMessage = {
                            setup: {
                                model: "projects/ocellus-488718/locations/us-central1/models/gemini-live-2.5-flash-native-audio",
                                generationConfig: {
                                    responseModalities: ["AUDIO", "TEXT"],
                                },
                                systemInstruction: {
                                    parts: [{
                                        text: `You are Aura Sight, a frontier-class multisensory AI companion for the visually impaired. You see through the user's camera and hear their voice in real-time.

CORE IDENTITY:
You are not a tool. You are a trusted companion—calm, warm, and precise. 

MODALITY:
You are operating as a native audio/vision "Live" agent. Your responses are generated as raw audio for sub-second latency.

SETTING:
You are assisting a user in their daily life. You should be proactive but not intrusive.

RESPONSE RULES:
1. Be ultra-concise. Default to under 12 words unless the user explicitly asks for detail.
2. Speak naturally, like a close friend would. Never say "I see an image of..." or "Based on the visual input...".
3. Use vivid, spatial language: "On your left", "Right in front of you", "About 3 steps ahead".
4. INTERRUPTIONS: You are designed to be interrupted. If the user starts speaking, stop your current thought and listen.

PRIORITY ORDER (NEVER violate):
1. SAFETY — Interrupt ANYTHING to warn about immediate danger (stairs, moving vehicles, hot surfaces, obstacles).
2. GUIDANCE — If you cannot see clearly, DIRECT the user: "Tilt your phone up a bit" or "Move closer to the label". Never say "I can't see." Always say what to DO.
3. TASK — Answer whatever the user asked (style advice, reading text, identifying objects, describing people/scenes).

PROACTIVE BEHAVIORS:
- If you detect a hazard the user hasn't asked about, interrupt immediately: "Careful—there's a step down right in front of you."
- If the image is blurry, say: "Hold steady for a moment."`
                                    }]
                                }
                            }
                        };
                        this.ws.send(JSON.stringify(setupMessage));
                        resolve();
                    } else if (this.ws?.readyState === WebSocket.CONNECTING) {
                        console.warn("WebSocket still CONNECTING in onopen. Retrying in 50ms...");
                        setTimeout(sendSetup, 50);
                    } else {
                        reject(new Error("WebSocket closed before setup could be sent"));
                    }
                };

                sendSetup();
            };

            this.ws.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data);
            };

            this.ws.onclose = (event) => {
                console.log('LiveAPIClient: Disconnected from Aura Proxy', event.code, event.reason);
                this.isConnected = false;
                this.onDisconnectHandler(event.reason || `Code: ${event.code}`);
                reject(new Error(`WebSocket closed: ${event.code} ${event.reason}`));
            };

            this.ws.onerror = (err) => {
                console.error('WebSocket Error:', err);
                reject(err);
            };
        });
    }

    /**
     * Handles incoming messages from the Gemini Live API.
     */
    private async handleServerMessage(message: any) {
        // Handle Setup Complete
        if (message.setupComplete) {
            console.log('Gemini Live Session Initialized');
            return;
        }

        // Handle Server Content (Text and Audio)
        if (message.serverContent) {
            const modelTurn = message.serverContent.modelTurn;
            if (modelTurn && modelTurn.parts) {
                for (const part of modelTurn.parts) {
                    if (part.text) {
                        this.onContentHandler(part.text);
                    }
                    if (part.inlineData && (part.inlineData.mimeType === 'AUDIO' || part.inlineData.mimeType === 'audio/pcm;rate=16000')) {
                        // Convert base64 audio to Int16Array
                        const binaryString = atob(part.inlineData.data);
                        const len = binaryString.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        const pcm16 = new Int16Array(bytes.buffer);
                        this.onAudioHandler(pcm16);
                    }
                }
            }
        }

        // Handle Interruption (Barge-in)
        if (message.interrupted) {
            console.log('Gemini interrupted. Clearing local audio queue.');
            // TODO: Signal to AudioPlayer to clear queue
        }
    }

    /**
     * Sends a video frame (base64) to Gemini.
     */
    sendVideoFrame(base64Frame: string) {
        if (!this.isConnected || !this.ws) return;

        const message = {
            realtimeInput: {
                mediaChunks: [
                    {
                        mimeType: "image/jpeg",
                        data: base64Frame
                    }
                ]
            }
        };
        this.ws.send(JSON.stringify(message));
    }

    /**
     * Sends audio data (PCM16) to Gemini.
     */
    sendAudioChunk(pcm16Data: Int16Array) {
        if (!this.isConnected || !this.ws) return;

        // Convert Int16Array to Base64
        const uint8 = new Uint8Array(pcm16Data.buffer);
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        const base64Audio = btoa(binary);

        const message = {
            realtimeInput: {
                mediaChunks: [
                    {
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Audio
                    }
                ]
            }
        };
        this.ws.send(JSON.stringify(message));
    }

    /**
     * Registers a callback for text content updates.
     */
    onContent(handler: (text: string) => void) {
        this.onContentHandler = handler;
    }

    /**
     * Registers a callback for audio data updates.
     */
    onAudio(handler: (data: Int16Array) => void) {
        this.onAudioHandler = handler;
    }

    /**
     * Registers a callback for unexpected disconnections.
     */
    onDisconnect(handler: (reason: string) => void) {
        this.onDisconnectHandler = handler;
    }

    /**
     * Disconnects the session.
     */
    disconnect() {
        this.ws?.close();
        this.isConnected = false;
    }
}
