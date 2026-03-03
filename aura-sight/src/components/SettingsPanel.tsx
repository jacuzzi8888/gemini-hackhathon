import React, { useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ToggleProps {
    label: string;
    description?: string;
    initialChecked?: boolean;
}

const OversizedToggle: React.FC<ToggleProps> = ({ label, description, initialChecked = false }) => {
    const [checked, setChecked] = useState(initialChecked);

    return (
        <button
            onClick={() => setChecked(!checked)}
            className="w-full flex items-center justify-between py-8 border-b border-white/10 text-left focus:outline-none focus:bg-white/5 transition-colors"
            aria-pressed={checked}
        >
            <div className="flex flex-col gap-2">
                <span className="text-3xl font-bold text-white tracking-tight">{label}</span>
                {description && <span className="text-lg font-medium text-slate-500">{description}</span>}
            </div>

            {/* Giant Toggle */}
            <div
                className={cn(
                    "w-24 h-14 rounded-full p-2 transition-colors duration-300 relative",
                    checked ? "bg-white" : "bg-white/20"
                )}
            >
                <div
                    className={cn(
                        "w-10 h-10 rounded-full bg-aura-dark transition-transform duration-300 shadow-md",
                        checked ? "translate-x-10" : "translate-x-0"
                    )}
                />
            </div>
        </button>
    );
};

export interface SettingsPanelProps {
    readonly className?: string;
    readonly onClose?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ className = '', onClose }) => {
    return (
        <div className={cn("w-full h-full flex flex-col bg-aura-dark p-6 overflow-y-auto", className)}>
            <div className="flex items-center justify-between mb-12 pt-8">
                <h1 className="text-white text-4xl font-bold tracking-tight">Settings</h1>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-white text-xl font-bold opacity-60 hover:opacity-100 uppercase tracking-widest px-4 py-2"
                    >
                        Done
                    </button>
                )}
            </div>

            <div className="flex flex-col">
                <OversizedToggle
                    label="Voice Speed"
                    description="Faster speech output"
                    initialChecked={false}
                />
                <OversizedToggle
                    label="Haptic Intensity"
                    description="Stronger vibration alerts"
                    initialChecked={true}
                />
                <OversizedToggle
                    label="Sensor Calibration"
                    description="Auto-adjust to lighting"
                    initialChecked={true}
                />
                <OversizedToggle
                    label="Verbose Mode"
                    description="More detailed descriptions"
                    initialChecked={false}
                />
            </div>
        </div>
    );
};
