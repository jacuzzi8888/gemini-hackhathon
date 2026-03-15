import { playEarcon } from "./Earcon";

/**
 * MediaManager handles the camera and microphone streams,
 * providing frames and audio chunks for the Gemini Multimodal Live API.
 * 
 * 2026 Update: Supports multi-lens switching (Ultra-wide, Telephoto, Front/Back).
 */
export class MediaManager {
    private stream: MediaStream | null = null;
    private videoTrack: MediaStreamTrack | null = null;
    private audioTrack: MediaStreamTrack | null = null;
    private audioContext: AudioContext | null = null;
    private processor: AudioWorkletNode | null = null;
    private onAudioData: ((data: Int16Array) => void) | null = null;
    private videoElement: HTMLVideoElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private activeMasks: { x: number, y: number, w: number, h: number }[] = [];

    constructor() {
        // Create a hidden video element and canvas once to avoid overhead
        if (typeof document !== 'undefined') {
            this.videoElement = document.createElement('video');
            this.videoElement.setAttribute('autoplay', '');
            this.videoElement.setAttribute('muted', '');
            this.videoElement.setAttribute('playsinline', '');
            this.videoElement.style.display = 'none';
            document.body.appendChild(this.videoElement);

            this.canvas = document.createElement('canvas');
            this.canvas.width = 512;
            this.canvas.height = 512;
            this.ctx = this.canvas.getContext('2d', { alpha: false });
        }
    }

    /**
     * Enumerates available video input devices and returns a clean list
     * including lens metadata where available.
     */
    async getAvailableCameras(): Promise<{ id: string; label: string }[]> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            
            // If labels are empty, we need to request permission first
            if (videoDevices.length > 0 && !videoDevices[0].label) {
                const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
                const labeledDevices = await navigator.mediaDevices.enumerateDevices();
                tempStream.getTracks().forEach(t => t.stop());
                return labeledDevices
                    .filter(d => d.kind === 'videoinput')
                    .map(d => ({ id: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0,4)}` }));
            }

            return videoDevices.map(d => ({
                id: d.deviceId,
                label: d.label || `Camera ${d.deviceId.slice(0, 4)}`
            }));
        } catch (error) {
            console.error("Failed to enumerate cameras:", error);
            return [];
        }
    }

    async initialize(deviceId?: string): Promise<void> {
        try {
            this.stop();

            const constraints: MediaStreamConstraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoTrack = this.stream.getVideoTracks()[0];
            this.audioTrack = this.stream.getAudioTracks()[0];

            // Attach the stream to our hidden video element for frame capture
            if (this.videoElement) {
                this.videoElement.srcObject = this.stream;
                // Wait for the video to be ready
                await new Promise((resolve) => {
                    if (this.videoElement) {
                        this.videoElement.onloadedmetadata = () => {
                            this.videoElement?.play().then(resolve);
                        };
                    } else resolve(null);
                });
            }

            console.log("Media initialized successfully with", deviceId ? `device ${deviceId}` : 'default back camera');
            playEarcon('success');
        } catch (error) {
            console.error("Failed to initialize media:", error);
            playEarcon('error');
            throw error;
        }
    }

    /**
     * Captures the current video frame as a base64 JPEG string.
     * Optimized for 2026 Gemini Live processing (512x512).
     */
    captureFrame(): string | null {
        if (!this.stream || !this.videoTrack || !this.videoElement || !this.ctx || !this.canvas) return null;

        // Draw the current video frame onto the 512x512 canvas
        this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
        
        // Apply Privacy Masking at source
        this.applyMasks();
        
        // Return base64 JPEG at 0.6 quality (sweet spot for Gemini)
        return this.canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
    }

    /**
     * Updates the active privacy masks.
     * @param masks - Array of rectangles to blur on the next capture.
     */
    setPrivacyMasks(masks: { x: number, y: number, w: number, h: number }[]) {
        this.activeMasks = masks;
    }

    private applyMasks() {
        if (!this.ctx || this.activeMasks.length === 0) return;

        this.ctx.save();
        for (const mask of this.activeMasks) {
            // Enterprise standard: High-quality Gaussian-like blur for privacy
            // For Canvas, we use a simpler box blur or fill to save perf on-device
            this.ctx.filter = 'blur(15px)';
            this.ctx.drawImage(
                this.canvas!, 
                mask.x * this.canvas!.width, 
                mask.y * this.canvas!.height, 
                mask.w * this.canvas!.width, 
                mask.h * this.canvas!.height,
                mask.x * this.canvas!.width, 
                mask.y * this.canvas!.height, 
                mask.w * this.canvas!.width, 
                mask.h * this.canvas!.height
            );
            this.ctx.filter = 'none';
        }
        this.ctx.restore();
    }
        this.onAudioData = onAudioData;
        if (!this.stream) return;

        this.audioContext = new AudioContext({ sampleRate: 16000 });
        // Use the absolute path for the worklet consistent with the project structure
        await this.audioContext.audioWorklet.addModule('/pcm-processor.worklet.js');

        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.processor = new AudioWorkletNode(this.audioContext, 'pcm-processor');

        this.processor.port.onmessage = (e) => {
            if (this.onAudioData) this.onAudioData(new Int16Array(e.data));
        };

        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
    }

    toggleVideo(enabled: boolean) {
        if (this.videoTrack) this.videoTrack.enabled = enabled;
    }

    toggleAudio(enabled: boolean) {
        if (this.audioTrack) this.audioTrack.enabled = enabled;
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
            this.stream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.videoTrack = null;
        this.audioTrack = null;
    }

    getStream() {
        return this.stream;
    }
}
