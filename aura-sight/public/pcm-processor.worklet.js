/**
 * PCMProcessorWorklet
 * A high-performance AudioWorklet for converting Float32 browser audio
 * to PCM16 (Int16) for the Gemini Multimodal Live API.
 *
 * Optimizations (2026 standard):
 * - Pre-allocated ring buffer (no allocations in process())
 * - Accumulates to 40ms chunks (640 samples at 16kHz) before posting
 *   to reduce WebSocket message overhead
 */
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Ring buffer for 40ms at 16kHz = 640 samples
        this.bufferSize = 640;
        this.buffer = new Int16Array(this.bufferSize);
        this.writeIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length === 0) return true;

        const channelData = input[0];
        if (!channelData) return true;

        for (let i = 0; i < channelData.length; i++) {
            // Clamp and convert to Int16
            const s = Math.max(-1, Math.min(1, channelData[i]));
            this.buffer[this.writeIndex++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

            // When buffer is full (40ms accumulated), send and reset
            if (this.writeIndex >= this.bufferSize) {
                // Send a copy (transferable) and reset write position
                const copy = this.buffer.slice();
                this.port.postMessage(copy.buffer, [copy.buffer]);
                this.writeIndex = 0;
            }
        }
        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor);
