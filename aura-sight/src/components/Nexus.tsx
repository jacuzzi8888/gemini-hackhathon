import React, { useState, useRef, useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { AuraStatus } from '../App';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface NexusProps {
    readonly status: AuraStatus;
    readonly directorMessage: string | null;
    readonly onStartRecording: () => void;
    readonly onStopRecording: () => void;
    readonly onCancel: () => void;
    readonly className?: string;
}

export const Nexus: React.FC<NexusProps> = ({
    status,
    directorMessage,
    onStartRecording,
    onStopRecording,
    onCancel,
    className = '',
}) => {
    const [isPressing, setIsPressing] = useState(false);
    const [pressProgress, setPressProgress] = useState(0);
    const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pressFrameRef = useRef<number | null>(null);

    const isEngaged = status !== 'idle';

    const startPress = () => {
        // If in responding/thinking/error state, tap to cancel
        if (status === 'responding' || status === 'thinking' || status === 'error') {
            onCancel();
            return;
        }
        // If already recording, release stops recording
        if (status === 'recording') {
            return;
        }

        // Start the hold animation
        setIsPressing(true);
        setPressProgress(0);

        const startTime = Date.now();
        const duration = 800; // ms to hold before activating

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            setPressProgress(progress);

            if (progress < 1) {
                pressFrameRef.current = requestAnimationFrame(animate);
            }
        };
        pressFrameRef.current = requestAnimationFrame(animate);

        pressTimerRef.current = setTimeout(() => {
            // Hold complete -> start recording
            if ('vibrate' in navigator) navigator.vibrate(50);
            onStartRecording();
            setIsPressing(false);
            setPressProgress(0);
        }, duration);
    };

    const endPress = () => {
        // If recording, release = stop recording -> thinking
        if (status === 'recording') {
            onStopRecording();
            return;
        }

        // If still in the hold animation, cancel it
        if (isPressing) {
            setIsPressing(false);
            setPressProgress(0);
            if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
            if (pressFrameRef.current) cancelAnimationFrame(pressFrameRef.current);
        }
    };

    useEffect(() => {
        return () => {
            if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
            if (pressFrameRef.current) cancelAnimationFrame(pressFrameRef.current);
        };
    }, []);

    // ── Status Text ──
    const statusLabel = (() => {
        switch (status) {
            case 'recording': return 'Listening...';
            case 'thinking': return 'Processing...';
            case 'responding': return directorMessage || 'Speaking...';
            case 'error': return directorMessage || 'Error';
            default: return null;
        }
    })();

    return (
        <div className={cn("relative flex h-full w-full flex-col overflow-hidden items-center justify-center", className)}>
            {/* Background Overlay */}
            {isEngaged && (
                <div className="absolute inset-0 pointer-events-none bg-aura-dark/60 backdrop-blur-md z-0 transition-opacity duration-500" />
            )}

            {/* The Director Message */}
            {isEngaged && statusLabel && (
                <div className="absolute top-16 px-10 text-center z-20 animate-in fade-in slide-in-from-top-4 duration-500">
                    <h1 className="text-white text-2xl font-bold font-sans tracking-tight leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] max-w-sm">
                        {statusLabel.length > 80 ? statusLabel.substring(0, 80) + '...' : statusLabel}
                    </h1>
                </div>
            )}

            {/* ── The Ring Interactor ── */}
            <button
                onPointerDown={startPress}
                onPointerUp={endPress}
                onPointerLeave={endPress}
                onContextMenu={(e) => e.preventDefault()}
                className="relative z-10 flex items-center justify-center w-[220px] h-[220px] rounded-full border border-white/40 focus:outline-none transition-transform duration-300"
                style={{ transform: isPressing ? 'scale(0.95)' : 'scale(1)' }}
                aria-label={
                    status === 'idle' ? 'Long press to scan' :
                        status === 'recording' ? 'Release to process' :
                            'Tap to stop'
                }
            >
                {/* Progress Ring (Hold Animation) */}
                {!isEngaged && isPressing && (
                    <div
                        className="absolute inset-0 rounded-full"
                        style={{
                            background: `conic-gradient(var(--color-aura-primary) ${pressProgress * 360}deg, transparent 0deg)`,
                            maskImage: 'radial-gradient(transparent 65%, black 66%)',
                            WebkitMaskImage: 'radial-gradient(transparent 65%, black 66%)'
                        }}
                    />
                )}

                {/* Inner Circle */}
                <div
                    className={cn(
                        "w-[200px] h-[200px] rounded-full transition-all duration-500 flex items-center justify-center overflow-hidden",
                        status === 'idle' && "bg-transparent border-2 border-white/90 scale-95",
                        status === 'recording' && "bg-red-500/80 scale-100 border-none shadow-[0_0_80px_rgba(239,68,68,0.5)] animate-pulse",
                        status === 'thinking' && "scale-100 border-none shadow-[0_0_60px_rgba(245,158,11,0.4)]",
                        status === 'responding' && "bg-aura-primary scale-100 border-none shadow-[0_0_80px_rgba(19,127,236,0.6)]",
                        status === 'error' && "bg-red-800/60 scale-100 border-none shadow-[0_0_40px_rgba(239,68,68,0.3)]"
                    )}
                    style={status === 'thinking' ? {
                        background: 'conic-gradient(from 0deg, #F59E0B, #8B5CF6, #3B82F6, #F59E0B)',
                        animation: 'spin 2s linear infinite'
                    } : undefined}
                >
                    {/* Voice Waveform (Recording / Responding) */}
                    {(status === 'recording' || status === 'responding') && (
                        <div className="flex items-center justify-center gap-1.5 h-16 w-full">
                            {[0.8, 0.4, 1, 0.6, 0.9].map((scale, i) => (
                                <div
                                    key={i}
                                    className="w-2 bg-white rounded-full animate-pulse"
                                    style={{
                                        height: `${scale * 100}%`,
                                        animationDelay: `${i * 0.15}s`,
                                        animationDuration: status === 'recording' ? '0.6s' : '0.8s'
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {/* Thinking Icon */}
                    {status === 'thinking' && (
                        <div className="text-white text-4xl font-light animate-pulse">⟳</div>
                    )}

                    {/* Error Icon */}
                    {status === 'error' && (
                        <div className="text-white text-4xl">⚠</div>
                    )}
                </div>
            </button>

            {/* Instructions (Idle) */}
            {status === 'idle' && (
                <div className={cn("absolute bottom-32 text-center z-10 transition-opacity duration-300", isPressing ? "opacity-0" : "opacity-100")}>
                    <p className="text-white text-xl font-medium tracking-tight opacity-90 px-8">Hold to talk to Aura</p>
                    <p className="text-slate-300 text-[10px] font-bold tracking-[0.3em] uppercase mt-3 opacity-60">Aura Sentinel • Active</p>
                </div>
            )}

            {/* Sub-label (Recording) */}
            {status === 'recording' && (
                <div className="absolute bottom-32 text-center z-10 animate-in slide-in-from-bottom flex flex-col items-center gap-1">
                    <span className="text-red-400 text-xs font-bold uppercase tracking-widest bg-red-500/10 px-3 py-1 rounded-full border border-red-400/30">
                        ● Recording
                    </span>
                    <p className="text-white/70 text-sm mt-2">Release when done speaking</p>
                </div>
            )}

            {/* Sub-label (Thinking) */}
            {status === 'thinking' && (
                <div className="absolute bottom-32 text-center z-10 animate-in slide-in-from-bottom flex flex-col items-center gap-1">
                    <span className="text-amber-400 text-xs font-bold uppercase tracking-widest bg-amber-500/10 px-3 py-1 rounded-full border border-amber-400/30">
                        Analyzing
                    </span>
                    <p className="text-white/70 text-sm mt-2">Tap to cancel</p>
                </div>
            )}

            {/* Sub-label (Responding) */}
            {status === 'responding' && (
                <div className="absolute bottom-32 text-center z-10 animate-in slide-in-from-bottom flex flex-col items-center gap-1 w-3/4 max-w-sm">
                    <span className="text-aura-primary text-xs font-bold uppercase tracking-widest bg-aura-primary/10 px-3 py-1 rounded-full border border-aura-primary/30">
                        Aura Speaking
                    </span>
                    <p className="text-white text-lg font-medium tracking-wide mt-2">{directorMessage}</p>
                </div>
            )}
        </div>
    );
};
