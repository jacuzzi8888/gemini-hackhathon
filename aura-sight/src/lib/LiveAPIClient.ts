const PRODUCTION_PROXY_URL = 'aura-proxy-432140310963.us-central1.run.app';
const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'localhost:8080'
    : PRODUCTION_PROXY_URL;

/**
 * LiveAPIClient handles the WebSocket connection to the Aura Proxy,
 * managing the bidirectional stream of audio/video to Gemini Multimodal Live API.
 *
 * Features (2026 standard):
 * - Context window compression for unlimited session duration
 * - Session resumption with transparent token management
 * - GoAway pre-termination handling
 * - Proper interruption signaling
 * - Exponential backoff reconnection with jitter
 */
export class LiveAPIClient {
    private ws: WebSocket | null = null;
    private readonly url: string;
    private onContentHandler: (text: string) => void = () => { };
    private onAudioHandler: (data: Int16Array) => void = () => { };
    private onDisconnectHandler: (reason: string) => void = () => { };
    private onInterruptedHandler: () => void = () => { };
    private onGoAwayHandler: (timeLeft: number) => void = () => { };
    private onReconnectingHandler: (attempt: number) => void = () => { };
    private onReconnectedHandler: () => void = () => { };
    private isConnected: boolean = false;

    // Reconnection state
    private reconnectAttempts: number = 0;
    private readonly maxReconnectAttempts: number = 15;
    private readonly baseDelay: number = 1000;
    private readonly maxDelay: number = 30000;
    private shouldReconnect: boolean = true;

    // Session resumption
    private resumptionToken: string | null = null;

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
                        this.reconnectAttempts = 0; // Reset on successful connection

                        // Initial Setup Message for Vertex AI (camelCase required)
                        const setupMessage: any = {
                            setup: {
                                model: "projects/ocellus-488718/locations/us-central1/publishers/google/models/gemini-live-2.5-flash-native-audio",
                                generationConfig: {
                                    responseModalities: ["AUDIO"],
                                },
                                // Enable context window compression for unlimited session duration
                                // Without this: audio-only = 15 min max, audio+video = 2 min max
                                contextWindowCompression: {
                                    slidingWindow: {},
                                    triggerTokens: 25600,
                                },
                                // Enable session resumption for reconnection resilience
                                sessionResumption: {
                                    transparent: true,
                                    ...(this.resumptionToken ? { handle: this.resumptionToken } : {}),
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
                let text: string;
                if (event.data instanceof Blob) {
                    text = await event.data.text();
                } else {
                    text = event.data;
                }
                // DEBUG: Log every raw message from server
                console.log('[DEBUG] Raw server message:', text.substring(0, 500));
                const data = JSON.parse(text);
                this.handleServerMessage(data);
            };

            this.ws.onclose = (event) => {
                console.log('LiveAPIClient: Disconnected from Aura Proxy', event.code, event.reason);
                this.isConnected = false;

                // Attempt auto-reconnect for non-intentional disconnections
                if (this.shouldReconnect && event.code !== 1000) {
                    this.attemptReconnect();
                } else {
                    this.onDisconnectHandler(event.reason || `Code: ${event.code}`);
                }
            };

            this.ws.onerror = (err) => {
                console.error('WebSocket Error:', err);
                // Don't reject if we're reconnecting — onclose will handle it
                if (this.reconnectAttempts === 0) {
                    reject(err);
                }
            };
        });
    }

    /**
     * Attempts to reconnect with exponential backoff and jitter.
     */
    private async attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('LiveAPIClient: Max reconnection attempts reached');
            this.onDisconnectHandler('Max reconnection attempts reached');
            return;
        }

        const delay = Math.min(
            this.maxDelay,
            this.baseDelay * Math.pow(2, this.reconnectAttempts)
        ) + Math.random() * this.baseDelay; // Jitter

        this.reconnectAttempts++;
        console.log(`LiveAPIClient: Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.onReconnectingHandler(this.reconnectAttempts);

        await new Promise(r => setTimeout(r, delay));

        try {
            await this.connect();
            console.log('LiveAPIClient: Reconnection successful');
            this.onReconnectedHandler();
        } catch (err) {
            console.error('LiveAPIClient: Reconnection failed:', err);
            // onclose will fire again and trigger another attemptReconnect
        }
    }

    /**
     * Handles incoming messages from the Gemini Live API.
     */
    private async handleServerMessage(message: any) {
        // Handle Setup Complete (Resilient to casing)
        if (message.setupComplete || message.setup_complete) {
            console.log('Gemini Live Session Initialized');
            return;
        }

        // Handle GoAway — pre-termination warning
        const goAway = message.goAway || message.go_away;
        if (goAway) {
            const timeLeft = goAway.timeLeft || goAway.time_left || 0;
            console.warn('Gemini GoAway received. Time left:', timeLeft);
            this.onGoAwayHandler(timeLeft);
            return;
        }

        // Handle Session Resumption Token updates
        const sessionUpdate = message.sessionResumptionUpdate || message.session_resumption_update;
        if (sessionUpdate) {
            const token = sessionUpdate.token || sessionUpdate.handle;
            if (token) {
                this.resumptionToken = token;
                console.log('LiveAPIClient: Session resumption token updated');
            }
            return;
        }

        // Handle Server Content (Resilient to casing)
        const serverContent = message.serverContent || message.server_content;
        if (serverContent) {
            // Handle interruption — user started speaking while AI was responding
            if (serverContent.interrupted) {
                console.log('Gemini interrupted. Clearing local audio queue.');
                this.onInterruptedHandler();
                return;
            }

            const modelTurn = serverContent.modelTurn || serverContent.model_turn;
            if (modelTurn && modelTurn.parts) {
                for (const part of modelTurn.parts) {
                    if (part.text) {
                        this.onContentHandler(part.text);
                    }
                    const inlineData = part.inlineData || part.inline_data;
                    if (inlineData && (inlineData.mimeType === 'AUDIO' || inlineData.mimeType === 'audio/pcm;rate=24000' || inlineData.mimeType === 'audio/pcm;rate=16000' || inlineData.mime_type === 'AUDIO')) {
                        // Convert base64 audio to Int16Array
                        const binaryString = atob(inlineData.data);
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
        console.log('[DEBUG] Sending video frame, size:', base64Frame.length);
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
        console.log('[DEBUG] Sending audio chunk, samples:', pcm16Data.length, 'base64 len:', base64Audio.length);
        this.ws.send(JSON.stringify(message));
    }

    /**
     * Signals to Gemini that the user's turn is complete.
     * This triggers the model to start generating a response.
     */
    sendTurnComplete() {
        if (!this.isConnected || !this.ws) return;
        const message = {
            clientContent: {
                turnComplete: true
            }
        };
        console.log('[DEBUG] Sending turnComplete:', JSON.stringify(message));
        this.ws.send(JSON.stringify(message));
        console.log('LiveAPIClient: Sent turnComplete signal');
    }

    // ── Event Handler Registration ──

    onContent(handler: (text: string) => void) {
        this.onContentHandler = handler;
    }

    onAudio(handler: (data: Int16Array) => void) {
        this.onAudioHandler = handler;
    }

    onDisconnect(handler: (reason: string) => void) {
        this.onDisconnectHandler = handler;
    }

    onInterrupted(handler: () => void) {
        this.onInterruptedHandler = handler;
    }

    onGoAway(handler: (timeLeft: number) => void) {
        this.onGoAwayHandler = handler;
    }

    onReconnecting(handler: (attempt: number) => void) {
        this.onReconnectingHandler = handler;
    }

    onReconnected(handler: () => void) {
        this.onReconnectedHandler = handler;
    }

    /**
     * Disconnects the session intentionally (no auto-reconnect).
     */
    disconnect() {
        this.shouldReconnect = false;
        this.ws?.close(1000, 'Client disconnect');
        this.isConnected = false;
    }
}
