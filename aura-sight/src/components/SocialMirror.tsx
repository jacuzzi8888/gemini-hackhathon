import React from 'react';
import { Smile, Users, Ruler } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface SocialData {
    mood: string;
    expression: string;
    distance: string;
}

export interface SocialMirrorProps {
    readonly data: SocialData | null;
    readonly className?: string;
}

export const SocialMirror: React.FC<SocialMirrorProps> = ({ data, className = '' }) => {
    return (
        <div className={cn("relative w-full h-full flex flex-col items-center justify-center bg-aura-dark p-6 overflow-hidden", className)}>
            {/* Soft Purple Glow (Social Mode Identifier) */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(112,0,255,0.15)_0%,transparent_70%)] pointer-events-none" />

            {data ? (
                <div className="z-10 flex flex-col gap-12 w-full max-w-sm">
                    <div className="flex flex-col items-center gap-4 text-white">
                        <Smile className="w-12 h-12 text-aura-social opacity-80" />
                        <h2 className="text-2xl font-bold uppercase tracking-widest opacity-60">Mood</h2>
                        <p className="text-5xl font-bold tracking-tight">{data.mood}</p>
                    </div>

                    <div className="w-full h-[1px] bg-white/10" />

                    <div className="flex flex-col items-center gap-4 text-white">
                        <Users className="w-12 h-12 text-aura-social opacity-80" />
                        <h2 className="text-2xl font-bold uppercase tracking-widest opacity-60">Expression</h2>
                        <p className="text-5xl font-bold tracking-tight">{data.expression}</p>
                    </div>

                    <div className="w-full h-[1px] bg-white/10" />

                    <div className="flex flex-col items-center gap-4 text-white">
                        <Ruler className="w-12 h-12 text-aura-social opacity-80" />
                        <h2 className="text-2xl font-bold uppercase tracking-widest opacity-60">Distance</h2>
                        <p className="text-5xl font-bold tracking-tight">{data.distance}</p>
                    </div>
                </div>
            ) : (
                <div className="z-10 flex flex-col items-center text-center px-4 animate-pulse duration-1000">
                    <p className="text-white text-3xl font-medium opacity-80">Scanning social context...</p>
                </div>
            )}
        </div>
    );
};
