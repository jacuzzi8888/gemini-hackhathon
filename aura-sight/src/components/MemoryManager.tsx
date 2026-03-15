import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Trash2, BrainCircuit } from 'lucide-react';
import { playEarcon } from '../lib/Earcon';

interface MemoryItem {
    id: string;
    content: string;
    created_at: string;
    category?: string;
}

export const MemoryManager: React.FC = () => {
    const [memories, setMemories] = useState<MemoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const loadMemories = async () => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('ai_memory')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (!error && data) {
            setMemories(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        loadMemories();
    }, []);

    const deleteMemory = async (id: string) => {
        const { error } = await supabase
            .from('ai_memory')
            .delete()
            .eq('id', id);

        if (!error) {
            setMemories(m => m.filter(item => item.id !== id));
            playEarcon('thinking');
        } else {
            playEarcon('error');
        }
    };

    if (loading) return <div className="py-8 text-slate-500 animate-pulse text-xl font-bold">Auditing Memory Bank...</div>;

    return (
        <div className="flex flex-col gap-6 mt-8">
            <div className="flex items-center gap-3 mb-2">
                <BrainCircuit className="w-8 h-8 text-aura-cyan" />
                <h2 className="text-2xl font-bold text-white uppercase tracking-widest">Agentic Memory</h2>
            </div>
            
            <p className="text-lg text-slate-400 leading-relaxed mb-4">
                In compliance with 2026 transparency standards, here is what Aura has learned about you. 
                You can purge any data point below.
            </p>

            {memories.length === 0 ? (
                <div className="p-8 rounded-2xl border-2 border-dashed border-white/10 text-center text-slate-500 text-xl font-medium">
                    No persistent memories found.
                </div>
            ) : (
                <div className="space-y-4">
                    {memories.map((memory) => (
                        <div 
                            key={memory.id} 
                            className="bg-white/5 rounded-2xl p-6 border border-white/10 flex items-start justify-between group transition-all hover:bg-white/10"
                        >
                            <div className="flex flex-col gap-1">
                                <span className="text-white text-xl font-medium leading-normal">{memory.content}</span>
                                <span className="text-sm text-slate-500 font-mono italic">
                                    Learned on {new Date(memory.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <button
                                onClick={() => deleteMemory(memory.id)}
                                className="p-3 text-slate-500 hover:text-red-400 transition-colors"
                                aria-label="Purge this memory"
                            >
                                <Trash2 className="w-6 h-6" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
