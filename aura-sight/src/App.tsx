import { useState, useCallback, useRef, useEffect } from 'react'
import { Eye, ShieldAlert, Settings, Smile } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { MediaManager } from './lib/MediaManager'
import { AudioPlayer } from './lib/AudioPlayer'

import { Nexus } from './components/Nexus'
import { GuardianList } from './components/GuardianList'
import type { GuardianAlert } from './components/GuardianList'
import { SocialMirror } from './components/SocialMirror'
import { SettingsPanel } from './components/SettingsPanel'
import { mockGuardianAlerts, mockSocialData } from './data/mockData'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type ViewMode = 'nexus' | 'guardian' | 'social' | 'settings'

function App() {
  const [activeView, setActiveView] = useState<ViewMode>('nexus')
  const [isActive, setIsActive] = useState(false)
  const [directorMessage, setDirectorMessage] = useState<string | null>(null)

  const mediaManager = useRef<MediaManager | null>(null)
  const audioPlayer = useRef<AudioPlayer | null>(null)
  const captureInterval = useRef<number | null>(null)

  const toggleAura = useCallback(async () => {
    if (!isActive) {
      // Starting Aura
      if (!mediaManager.current) mediaManager.current = new MediaManager()
      if (!audioPlayer.current) audioPlayer.current = new AudioPlayer()

      const success = await mediaManager.current.initialize()
      if (success) {
        setIsActive(true)
        audioPlayer.current.resume()

        // Mock capture loop (sending to console for now)
        captureInterval.current = window.setInterval(() => {
          const frame = mediaManager.current?.captureFrame()
          if (frame) {
            console.log('Captured frame (base64 length):', frame.length)
          }
        }, 1000)

        mediaManager.current.startAudioCapture((pcm16) => {
          console.log('Captured audio chunk samples:', pcm16.length)
        })

        setDirectorMessage("Scanning environment... Tilt up slightly.")
      }
    } else {
      // Stopping Aura
      setIsActive(false)
      mediaManager.current?.stop()
      audioPlayer.current?.stop()
      if (captureInterval.current) clearInterval(captureInterval.current)
      setDirectorMessage(null)
    }

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(isActive ? 50 : [100, 50, 100])
    }
  }, [isActive])

  useEffect(() => {
    return () => {
      mediaManager.current?.stop()
      if (captureInterval.current) clearInterval(captureInterval.current)
    }
  }, [])

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-aura-dark text-aura-light overflow-hidden">
      {/* Dynamic Main Content Area */}
      <main className="flex-1 relative w-full h-full overflow-hidden">
        {activeView === 'nexus' && (
          <>
            {/* Header Layer (Only in Nexus Standby/Scanning) */}
            <header className="absolute top-0 inset-x-0 px-8 py-10 flex justify-between items-center z-30 pointer-events-none">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-4 h-4 rounded-full transition-all duration-300",
                  isActive ? "bg-aura-primary shadow-[0_0_15px_#137FEC]" : "bg-white/30"
                )} />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/80">
                  {isActive ? 'Live' : 'Ready'}
                </span>
              </div>
              <button
                onClick={() => setActiveView('settings')}
                className="pointer-events-auto p-4 rounded-full text-white/60 hover:text-white transition-colors"
              >
                <Settings className="w-8 h-8" />
              </button>
            </header>

            <Nexus
              isActive={isActive}
              directorMessage={directorMessage}
              onToggle={toggleAura}
            />
          </>
        )}

        {activeView === 'guardian' && (
          <GuardianList alerts={mockGuardianAlerts as GuardianAlert[]} />
        )}

        {activeView === 'social' && (
          <SocialMirror data={isActive || true ? mockSocialData : null} />
        )}

        {activeView === 'settings' && (
          <SettingsPanel onClose={() => setActiveView('nexus')} />
        )}
      </main>

      {/* Persistent Bottom Nav (Hidden if in settings) */}
      {activeView !== 'settings' && (
        <nav className="relative z-30 flex justify-around items-center px-6 py-8 bg-aura-dark border-t border-white/10">
          <button
            onClick={() => setActiveView('guardian')}
            className={cn("flex flex-col items-center gap-2 transition-colors", activeView === 'guardian' ? "text-white" : "text-white/40")}
          >
            <ShieldAlert className="w-8 h-8" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Alerts</span>
          </button>

          <button
            onClick={() => setActiveView('nexus')}
            className={cn("flex flex-col items-center gap-2 transition-colors", activeView === 'nexus' ? "text-aura-primary" : "text-white/40")}
          >
            <Eye className="w-10 h-10" />
            <span className="text-[10px] flex items-center justify-center font-bold uppercase tracking-widest mt-1">Scan</span>
          </button>

          <button
            onClick={() => setActiveView('social')}
            className={cn("flex flex-col items-center gap-2 transition-colors", activeView === 'social' ? "text-aura-social" : "text-white/40")}
          >
            <Smile className="w-8 h-8" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Social</span>
          </button>
        </nav>
      )}
    </div>
  )
}

export default App
