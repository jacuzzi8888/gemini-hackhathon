import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        // Provide immediate audio feedback
        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance("Sending login link");
        synth.speak(utterance);

        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                // Ensure this matches your Vercel deployment URL eventually
                emailRedirectTo: window.location.origin,
            },
        });

        if (error) {
            setMessage(`Error: ${error.message}`);
            synth.speak(new SpeechSynthesisUtterance("Login failed. Check your email address."));
        } else {
            setMessage('Check your email for the login link!');
            synth.speak(new SpeechSynthesisUtterance("Link sent. Please check your email inbox."));
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-aura-dark px-6 py-12">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h1 className="text-5xl font-extrabold text-white tracking-tight mb-4">Aura Sight</h1>
                    <p className="text-xl text-slate-400">Your AI visual companion</p>
                </div>

                <form onSubmit={handleLogin} className="mt-12 space-y-6">
                    <div>
                        <label htmlFor="email" className="sr-only">Email address</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="appearance-none rounded-2xl relative block w-full px-6 py-6 border border-white/10 bg-white/5 placeholder-slate-500 text-white text-2xl focus:outline-none focus:ring-2 focus:ring-aura-cyan focus:border-transparent transition-all"
                            placeholder="Email address"
                            aria-label="Enter your email address to receive a login link"
                        />
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`group relative w-full flex justify-center py-6 px-4 border border-transparent text-2xl font-bold rounded-2xl text-aura-dark bg-white hover:bg-slate-200 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-aura-cyan transition-all transform active:scale-95 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                            aria-label={loading ? "Sending link" : "Send magic link"}
                        >
                            {loading ? 'Sending...' : 'Send Magic Link'}
                        </button>
                    </div>
                </form>

                {message && (
                    <div 
                        className="mt-6 text-center text-xl font-medium text-aura-cyan p-4 bg-white/5 rounded-xl border border-white/10"
                        role="alert"
                        aria-live="polite"
                    >
                        {message}
                    </div>
                )}
            </div>
        </div>
    );
};
