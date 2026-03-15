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
    readonly videoStream?: MediaStream | null;
    readonly cameraEnabled?: boolean;
    readonly isHandsFree?: boolean;
    readonly className?: string;
}

export const Nexus: React.FC<NexusProps> = ({
    status,
    directorMessage,
    onStartRecording,
    onStopRecording,
    onCancel,
    videoStream,
    cameraEnabled = true,
    isHandsFree = false,
    className = '',
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPressing, setIsPressing] = useState(false);
    const [pressProgress, setPressProgress] = useState(0);
    const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pressFrameRef = useRef<number | null>(null);

    const isEngaged = status !== 'idle';

    const startPress = () => {
        // If in responding/thinking/error/hands-free state, tap to cancel
        if (status === 'responding' || status === 'thinking' || status === 'error' || isHandsFree) {
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

    // ── Bind Video Stream ──
    useEffect(() => {
        const bindStream = () => {
            if (videoRef.current && videoStream) {
                if (videoRef.current.srcObject !== videoStream) {
                    videoRef.current.srcObject = videoStream;
                }
                
                // 2026 Standard: Aggressive Jumpstart
                const jumpstart = () => {
                   if (videoRef.current && videoRef.current.paused) {
                       videoRef.current.play().catch(e => console.warn("Jumpstart failed:", e));
                   }
                };
                
                requestAnimationFrame(jumpstart);
                setTimeout(jumpstart, 50); // Fallback for low-power NPUs
            } else if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };
        bindStream();
        
        const timer = setTimeout(bindStream, 150);
        const secondTimer = setTimeout(bindStream, 500);
        return () => {
            clearTimeout(timer);
            clearTimeout(secondTimer);
        };
    }, [videoStream, status]);

    // ── Status Text ──
    const statusLabel = (() => {
        switch (status) {
            case 'recording': return 'Listening...';
            case 'thinking': return 'Processing...';
            case 'watching': return 'Watching...';
            case 'responding': return directorMessage || 'Speaking...';
            case 'reconnecting': return directorMessage || 'Connection lost...';
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
                <div role="status" aria-live="assertive" aria-atomic="true" className="absolute top-16 px-10 text-center z-20 animate-in fade-in slide-in-from-top-4 duration-500">
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
                        status === 'listening' && "bg-aura-amber scale-100 border-none shadow-[0_0_80px_rgba(245,158,11,0.6)] animate-pulse",
                        status === 'watching' && "bg-aura-dark scale-100 border-2 border-aura-cyan shadow-[0_0_80px_rgba(19,127,236,0.6)]",
                        status === 'error' && "bg-red-800/60 scale-100 border-none shadow-[0_0_40px_rgba(239,68,68,0.3)]",
                        isHandsFree && status === 'idle' && "bg-aura-cyan/40 scale-100 border-2 border-aura-cyan shadow-[0_0_60px_rgba(19,127,236,0.4)] animate-pulse"
                    )}
                    style={status === 'thinking' ? {
                        background: 'conic-gradient(from 0deg, #F59E0B, #8B5CF6, #3B82F6, #F59E0B)',
                        animation: 'spin 2s linear infinite'
                    } : undefined}
                >
                    {/* Live Camera Feed (Masked by rounded-full on parent) */}
                    {(status === 'recording' || status === 'responding' || status === 'watching' || status === 'reconnecting' || isHandsFree) && videoStream && cameraEnabled && (
                        <div className={cn(
                            "absolute inset-0 w-full h-full transition-all duration-700",
                            (status === 'watching' || isHandsFree && status === 'idle') ? "opacity-100 scale-100" : "opacity-60"
                        )}>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className={cn(
                                    "w-full h-full object-cover pointer-events-none transition-filter duration-700",
                                    status === 'watching' ? "grayscale-0 contrast-100 saturate-100" : 
                                    (isHandsFree && status === 'idle' ? "grayscale-[0.3] contrast-125 saturate-150 blur-[2px]" : "mix-blend-screen")
                                )}
                            />
                            {/* Scanning Line overlay for Hands-Free */}
                            {(status === 'watching' || (isHandsFree && status === 'idle')) && (
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-aura-cyan/20 to-transparent h-1/2 w-full animate-scan pointer-events-none" />
                            )}
                            
                            {/* RED DOT: Active Listening Indicator (New 2026 Standard) */}
                            {(status === 'recording' || status === 'listening' || status === 'watching' || status === 'reconnecting') && (
                                <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full border border-white/10 z-50">
                                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
                                    <span className="text-[8px] font-bold text-white uppercase tracking-tighter">LIVE</span>
                                </div>
                            )}
                        </div>
                    )}

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
            {status === 'idle' && !isHandsFree && (
                <div className={cn("absolute bottom-32 text-center z-10 transition-opacity duration-300", isPressing ? "opacity-0" : "opacity-100")}>
                    <p className="text-white text-xl font-medium tracking-tight opacity-90 px-8">
                        Hold to talk to Aura
                    </p>
                    <p className="text-slate-300 text-[10px] font-bold tracking-[0.3em] uppercase mt-3 opacity-60">
                        Aura Sentinel • Active
                    </p>
                </div>
            )}

            {/* Sub-label (Recording) */}
            {status === 'recording' && (
                <div role="status" aria-live="polite" className="absolute bottom-32 text-center z-10 animate-in slide-in-from-bottom flex flex-col items-center gap-1">
                    <span className="text-red-400 text-xs font-bold uppercase tracking-widest bg-red-500/10 px-3 py-1 rounded-full border border-red-400/30">
                        ● Recording
                    </span>
                    <p className="text-white/70 text-sm mt-2">Release when done speaking</p>
                </div>
            )}

            {/* Sub-label (Thinking) */}
            {status === 'thinking' && (
                <div role="status" aria-live="polite" className="absolute bottom-32 text-center z-10 animate-in slide-in-from-bottom flex flex-col items-center gap-1">
                    <span className="text-amber-400 text-xs font-bold uppercase tracking-widest bg-amber-500/10 px-3 py-1 rounded-full border border-amber-400/30">
                        Analyzing
                    </span>
                    <p className="text-white/70 text-sm mt-2">Tap to cancel</p>
                </div>
            )}

            {/* Sub-label (Responding) */}
            {status === 'responding' && (
                <div role="status" aria-live="polite" className="absolute bottom-32 text-center z-10 animate-in slide-in-from-bottom flex flex-col items-center gap-1 w-3/4 max-w-sm">
                    <span className="text-aura-primary text-xs font-bold uppercase tracking-widest bg-aura-primary/10 px-3 py-1 rounded-full border border-aura-primary/30">
                        Aura Speaking
                    </span>
                    <p className="text-white text-lg font-medium tracking-wide mt-2">{directorMessage}</p>
                </div>
            )}
        </div>
    );
};
