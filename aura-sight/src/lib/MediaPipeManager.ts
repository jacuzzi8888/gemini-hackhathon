import { ObjectDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import type { Detection } from "@mediapipe/tasks-vision";

export interface HazardEvent {
    label: string;
    confidence: number;
    timestamp: number;
    boundingBox?: { x: number, y: number, w: number, h: number };
}

/**
 * MediaPipeManager handles on-device object detection using WebAssembly.
 * This provides a "Safety Layer" that works even when the cloud is lagging or offline.
 * 
 * 2026 Enterprise Standard: Edge-Native Inference.
 */
export class MediaPipeManager {
    private detector: ObjectDetector | null = null;
    private isInitializing: boolean = false;
    private onHazardDetected: ((hazard: HazardEvent) => void) | null = null;

    // List of objects that trigger immediate safety warnings
    private static readonly DANGER_LABELS = ['chair', 'table', 'person', 'car', 'stairs', 'door'];

    /**
     * Initializes the MediaPipe vision stack.
     */
    async initialize() {
        if (this.detector || this.isInitializing) return;
        this.isInitializing = true;

        try {
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
            );

            this.detector = await ObjectDetector.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
                    delegate: "GPU"
                },
                scoreThreshold: 0.5,
                runningMode: "VIDEO"
            });

            // console.log("MediaPipe Edge CV initialized successfully (GPU Delegate)");
            this.isInitializing = false;
        } catch (error) {
            console.error("Failed to initialize MediaPipe Edge CV:", error);
            this.isInitializing = false;
            throw error;
        }
    }

    /**
     * Processes a video frame or element for local detection.
     * @param videoElement - The hidden video element from MediaManager.
     * @param timestamp - current time for MediaPipe tracking.
     */
    detect(videoElement: HTMLVideoElement, timestamp: number) {
        if (!this.detector) return;

        const results = this.detector.detectForVideo(videoElement, timestamp);
        this.processDetections(results.detections);
    }

    private processDetections(detections: Detection[]) {
        if (!this.onHazardDetected) return;

        for (const detection of detections) {
            const category = detection.categories[0];
            const label = category.categoryName.toLowerCase();
            
            // If we find a high-priority hazard, emit an event immediately
            if (MediaPipeManager.DANGER_LABELS.includes(label)) {
                this.onHazardDetected({
                    label,
                    confidence: category.score,
                    timestamp: Date.now(),
                    boundingBox: detection.boundingBox ? {
                        x: detection.boundingBox.originX / 512, // Normalized
                        y: detection.boundingBox.originY / 512,
                        w: detection.boundingBox.width / 512,
                        h: detection.boundingBox.height / 512
                    } : undefined
                });
            }
        }
    }

    /**
     * Register a callback for when a safety hazard is detected on the edge.
     */
    onHazard(callback: (hazard: HazardEvent) => void) {
        this.onHazardDetected = callback;
    }

    close() {
        if (this.detector) {
            this.detector.close();
            this.detector = null;
        }
    }
}
