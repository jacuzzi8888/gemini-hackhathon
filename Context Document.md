# **Context: Aura Sight Technical Architecture**

## **1. Technical Stack**

*   **AI Model**: `gemini-3.1-flash-lite-preview` (Gemini Multimodal Live API).
*   **Audio Engine**: `Earcon.ts` (Synthesized Web Audio) + `AudioPlayer.ts` (PCM16 chunks).
*   **Interaction Logic**: `AuraStatus` State Machine (idle -> recording -> thinking -> responding).
*   **Backend**: Node.js/Express WebSocket Proxy (Deployed to **Google Cloud Run**).
*   **Frontend**: React + Tailwind CSS (Deployed to **Vercel**).
*   **Infrastructure**: GCP Secret Manager (GEMINI_API_KEY) + GitHub Actions (WIF Auth).

## **2. Aura Sentinel Interaction Flow**

1.  **Hold-to-Talk**: User long-presses the Nexus ring (>800ms).
    *   `Earcon: start` chime plays.
    *   Haptic Heartbeat (40ms Every 2s) starts.
2.  **Multimodal Stream**: While holding, camera frames (1 FPS) and PCM16 audio are streamed to the proxy.
3.  **Release-to-Process**: User releases the ring.
    *   `Earcon: thinking` sweep plays.
    *   State transitions to `thinking`.
4.  **Aura Response**: Gemini streams back text and audio.
    *   State transitions to `responding`.
    *   "Aura Director" logic guides the user's camera ("Tilt up", "Move left").

## **3. Key Production Configs**

*   **Proxy URL**: `aura-proxy-432140310963.us-central1.run.app`
*   **Key Source**: `Secret Manager` (Project `ocellus-488718`).
*   **Unified Model**: The app has pivoted to a "Sentinel" UX—no separate tabs for Alerts/Social. Everything is oral and centered on the Nexus ring.

## **4. Current State (Ready for Next Session)**

*   ✅ **Sentinel Transformation Completed**: Audio, Haptics, and State Machine are 100% integrated.
*   ✅ **Deployment Reliable**: Cloud Run permissions and Vercel environment detection are fixed.
*   ✅ **Gemini 3 Flash Active**: The AI is programmed to be proactive and safety-first.