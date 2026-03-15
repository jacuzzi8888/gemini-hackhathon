import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { playEarcon } from '../lib/Earcon';
import { MemoryManager } from './MemoryManager';

interface ToggleProps {
    label: string;
    description?: string;
    field: string;
    initialChecked?: boolean;
    userId?: string;
}

const OversizedToggle = ({ label, description, field, initialChecked = false, userId }: ToggleProps) => {
    const [checked, setChecked] = useState(initialChecked);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setChecked(initialChecked);
    }, [initialChecked]);

    const handleToggle = async () => {
        if (!userId || isSaving) return;
        const newValue = !checked;
        setChecked(newValue);
        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('accessibility_preferences')
                .upsert({ 
                    user_id: userId, 
                    [field]: newValue,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
            if (error) throw error;
            playEarcon(newValue ? 'success' : 'thinking');
        } catch (e) {
            console.error(e);
            setChecked(!newValue);
            playEarcon('error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <button
            onClick={handleToggle}
            disabled={isSaving}
            className="w-full flex items-center justify-between py-8 border-b border-white/10 text-left focus:outline-none focus:bg-white/5 transition-colors"
        >
            <div className="flex flex-col gap-2">
                <span className="text-3xl font-bold text-white tracking-tight">{label}</span>
                {description && <span className="text-lg font-medium text-slate-500">{description}</span>}
            </div>
            <div className={`w-24 h-14 rounded-full p-2 transition-colors duration-300 relative ${checked ? 'bg-white' : 'bg-white/20'}`}>
                <div className={`w-10 h-10 rounded-full bg-[#050505] transition-transform duration-300 shadow-md ${checked ? 'translate-x-10' : 'translate-x-0'}`} />
            </div>
        </button>
    );
};

export interface SettingsPanelProps {
    readonly onClose?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
    const [preferences, setPreferences] = useState<any>(null);
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        const loadPrefs = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setUserId(user.id);

            const { data, error } = await supabase
                .from('accessibility_preferences')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (!error && data) {
                setPreferences(data);
            }
        };
        loadPrefs();
    }, []);

    return (
        <div className="w-full h-full flex flex-col bg-[#050505] p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-12 pt-8">
                <h1 className="text-white text-4xl font-bold tracking-tight">Settings</h1>
                {onClose && (
                    <button onClick={onClose} className="text-white text-xl font-bold opacity-60 hover:opacity-100 uppercase tracking-widest px-4 py-2">
                        Done
                    </button>
                )}
            </div>
            <div className="flex flex-col">
                <OversizedToggle label="Voice Speed" description="Faster speech output" field="voice_speed_fast" initialChecked={preferences?.voice_speed_fast} userId={userId || undefined} />
                <OversizedToggle label="Haptic Intensity" description="Stronger vibration alerts" field="haptic_enabled" initialChecked={preferences?.haptic_enabled} userId={userId || undefined} />
                <OversizedToggle label="High Contrast" description="Maximize visual clarity" field="high_contrast_enabled" initialChecked={preferences?.high_contrast_enabled} userId={userId || undefined} />
                <OversizedToggle label="Verbose Mode" description="More detailed descriptions" field="verbose_mode" initialChecked={preferences?.verbose_mode} userId={userId || undefined} />
            </div>
            <MemoryManager />
            <div className="mt-auto pt-12 pb-8">
                <button onClick={() => supabase.auth.signOut()} className="w-full py-6 rounded-2xl border-2 border-red-500/50 text-red-400 font-bold text-2xl tracking-widest uppercase hover:bg-red-500 hover:text-white transition-colors">
                    Sign Out
                </button>
            </div>
        </div>
    );
};
