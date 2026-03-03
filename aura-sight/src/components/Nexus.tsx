import React from 'react';
import { ArrowUp } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface NexusProps {
    readonly isActive: boolean;
    readonly directorMessage: string | null;
    readonly onToggle: () => void;
    readonly className?: string;
}

export const Nexus: React.FC<NexusProps> = ({
    isActive,
    directorMessage,
    onToggle,
    className = '',
}) => {
    // Simple mock extraction for the "arrow" word.
    const shortMessage = directorMessage?.split(" ").slice(-1)[0].replace(".", "") || "UP";

    return (
        <div className={cn("relative flex h-full w-full flex-col overflow-hidden items-center justify-center", className)}>
            {/* Background Shift */}
            {isActive && (
                <div className="absolute inset-0 pointer-events-none bg-aura-dark/60 backdrop-blur-md z-0 transition-opacity duration-500" />
            )}

            {/* The Director */}
            {isActive && directorMessage && (
                <div className="absolute top-16 flex flex-col items-center gap-2 z-20 animate-in slide-in-from-top-4 duration-500">
                    <ArrowUp className="w-20 h-20 text-white animate-bounce" />
                    <h1 className="text-white text-4xl font-bold font-sans tracking-tight uppercase">
                        {shortMessage}
                    </h1>
                </div>
            )}

            {/* The Ring Interactor */}
            <button
                onPointerDown={onToggle}
                className="relative z-10 flex items-center justify-center w-[220px] h-[220px] rounded-full border border-white/40 focus:outline-none active:scale-95 transition-transform duration-300"
                aria-label={isActive ? "Stop Scanning" : "Long press to scan"}
            >
                <div
                    className={cn(
                        "w-[200px] h-[200px] rounded-full transition-all duration-500 flex items-center justify-center",
                        isActive
                            ? "bg-aura-primary scale-100 border-none shadow-[0_0_80px_rgba(19,127,236,0.6)] animate-pulse"
                            : "bg-transparent border-2 border-white/90 scale-95"
                    )}
                />
            </button>

            {/* Instructions */}
            {!isActive && (
                <div className="absolute bottom-32 text-center z-10 animate-in fade-in duration-500">
                    <p className="text-white text-xl font-medium tracking-tight opacity-90">Long press to scan</p>
                    <p className="text-slate-500 text-xs font-bold tracking-[0.2em] uppercase mt-3">The Nexus Standby</p>
                </div>
            )}

            {/* Pathfinder Sub-Label (Optional during Active) */}
            {isActive && (
                <div className="absolute bottom-32 text-center z-10 animate-in slide-in-from-bottom flex flex-col items-center gap-1">
                    <span className="text-aura-primary text-xs font-bold uppercase tracking-widest bg-aura-primary/10 px-3 py-1 rounded-full">Scanning</span>
                    <p className="text-white text-lg font-medium">{directorMessage}</p>
                </div>
            )}
        </div>
    );
};
