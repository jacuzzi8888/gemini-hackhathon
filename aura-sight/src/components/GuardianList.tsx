import React from 'react';
import { ShieldAlert, Info } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export interface GuardianAlert {
    id: string;
    title: string;
    type: 'critical' | 'info';
    timestamp: string;
}

export interface GuardianListProps {
    readonly alerts: GuardianAlert[];
    readonly className?: string;
}

export const GuardianList: React.FC<GuardianListProps> = ({ alerts, className = '' }) => {
    return (
        <div className={cn("w-full h-full flex flex-col bg-aura-dark p-6 overflow-y-auto", className)}>
            <h2 className="text-white text-4xl font-bold tracking-tight mb-10 pt-8">Guardian Alerts</h2>
            <div className="flex flex-col gap-6 pb-24">
                {alerts.map((alert) => (
                    <button
                        key={alert.id}
                        className={cn(
                            "w-full text-left p-6 flex flex-col gap-4 focus:outline-none active:scale-[0.98] transition-all",
                            alert.type === 'critical'
                                ? "bg-aura-dark border-[6px] border-aura-warning text-white"
                                : "bg-white text-aura-dark border-none"
                        )}
                    >
                        <div className="flex items-center gap-4">
                            {alert.type === 'critical' ? (
                                <ShieldAlert className="w-10 h-10 text-aura-warning" />
                            ) : (
                                <Info className="w-10 h-10 text-aura-dark" />
                            )}
                            <h3 className="text-3xl font-bold font-sans tracking-tight">{alert.title}</h3>
                        </div>
                        <div className="flex justify-end">
                            <span className={cn(
                                "text-sm font-bold uppercase tracking-[0.2em]",
                                alert.type === 'critical' ? "text-aura-warning" : "text-aura-dark/60"
                            )}>{alert.timestamp}</span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};
