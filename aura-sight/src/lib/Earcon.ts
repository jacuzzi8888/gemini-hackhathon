/**
 * Earcon - Synthesized audio cues for the Aura Sentinel UX.
 * Uses the Web Audio API to generate instant, latency-free tones.
 * No file loading required.
 */

type EarconType = 'start' | 'thinking' | 'success' | 'error' | 'stop';

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext {
    if (!sharedContext || sharedContext.state === 'closed') {
        sharedContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return sharedContext;
}

/**
 * Must be called from a user gesture (pointerdown/click) to unlock audio.
 */
export async function unlockAudio(): Promise<void> {
    const ctx = getContext();
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }
}

/**
 * Play a synthesized earcon tone.
 */
export function playEarcon(type: EarconType): void {
    const ctx = getContext();
    if (ctx.state === 'suspended') return; // Not yet unlocked

    switch (type) {
        case 'start':
            playStartChime(ctx);
            break;
        case 'thinking':
            playThinkingSweep(ctx);
            break;
        case 'success':
            playSuccessPing(ctx);
            break;
        case 'error':
            playErrorTone(ctx);
            break;
        case 'stop':
            playStopChime(ctx);
            break;
    }
}

/** High chime: 880Hz -> 1100Hz sine sweep, 300ms */
function playStartChime(ctx: AudioContext) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.3);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
}

/** Ascending sweep: 440Hz -> 880Hz, gentler, 400ms */
function playThinkingSweep(ctx: AudioContext) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.4);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
}

/** Double ping: Two quick 1200Hz blips */
function playSuccessPing(ctx: AudioContext) {
    for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + i * 0.15;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);

        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.1);
    }
}

/** Low double thud: Two 220Hz blips */
function playErrorTone(ctx: AudioContext) {
    for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = ctx.currentTime + i * 0.2;

        osc.type = 'square';
        osc.frequency.setValueAtTime(220, t);

        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
    }
}

/** Descending: 660Hz -> 440Hz, 300ms */
function playStopChime(ctx: AudioContext) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.3);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
}
