import { useState, useCallback, useRef, useEffect } from 'react'
import { Eye, Settings } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { MediaManager } from './lib/MediaManager'
import { AudioPlayer } from './lib/AudioPlayer'
import { LiveAPIClient } from './lib/LiveAPIClient'
import { unlockAudio, playEarcon } from './lib/Earcon'

import { Nexus } from './components/Nexus'
import { SettingsPanel } from './components/SettingsPanel'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type AuraStatus = 'idle' | 'recording' | 'thinking' | 'responding' | 'error' | 'reconnecting'
type ViewMode = 'nexus' | 'settings'

function App() {
  const [activeView, setActiveView] = useState<ViewMode>('nexus')
  const [status, setStatus] = useState<AuraStatus>('idle')
  const [directorMessage, setDirectorMessage] = useState<string | null>(null)

  const mediaManager = useRef<MediaManager | null>(null)
  const audioPlayer = useRef<AudioPlayer | null>(null)
  const apiClient = useRef<LiveAPIClient | null>(null)
  const captureInterval = useRef<number | null>(null)
  const heartbeatInterval = useRef<number | null>(null)

  // ── Haptic Heartbeat ──
  const startHeartbeat = useCallback(() => {
    if (!('vibrate' in navigator)) return
    heartbeatInterval.current = window.setInterval(() => {
      navigator.vibrate(40)
    }, 2000)
  }, [])

  const stopHeartbeat = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current)
      heartbeatInterval.current = null
    }
  }, [])

  // ── Start Recording ──
  const startRecording = useCallback(async () => {
    // Unlock audio context on user gesture
    await unlockAudio()

    if (!mediaManager.current) mediaManager.current = new MediaManager()
    if (!audioPlayer.current) audioPlayer.current = new AudioPlayer()
    if (!apiClient.current) apiClient.current = new LiveAPIClient()

    const success = await mediaManager.current.initialize()
    if (!success) {
      setStatus('error')
      playEarcon('error')
      setDirectorMessage('Camera access denied')
      return
    }

    setStatus('recording')
    playEarcon('start')
    setDirectorMessage('Listening...')
    startHeartbeat()

    // Haptic tick on activation
    if ('vibrate' in navigator) navigator.vibrate([80, 40, 80])

    try {
      await audioPlayer.current.resume()

      // Setup content & audio handlers
      apiClient.current!.onContent((text) => {
        setDirectorMessage(text)
        setStatus('responding')
        stopHeartbeat()
      })

      apiClient.current!.onAudio((pcm16) => {
        setStatus('responding')
        stopHeartbeat()
        audioPlayer.current?.queueAudio(pcm16)
        // Stop media tracks after first audio response (Gemini is now responding)
        mediaManager.current?.stop()
      })

      // Handle user interruption — immediately clear AI audio
      apiClient.current!.onInterrupted(() => {
        console.log('User interrupted — clearing audio queue')
        audioPlayer.current?.clearQueue()
        audioPlayer.current?.resume()
      })

      // Handle GoAway pre-termination warning
      apiClient.current!.onGoAway((timeLeft) => {
        console.warn(`Session ending in ${timeLeft}ms — will auto-reconnect`)
        setDirectorMessage('Reconnecting...')
      })

      // Handle Gemini finishing its response — reset UI to idle
      apiClient.current!.onTurnComplete(() => {
        console.log('Gemini finished responding — resetting to idle')
        setStatus('idle')
        setDirectorMessage(null)
        stopHeartbeat()
        // Clean up media tracks now that the full exchange is done
        mediaManager.current?.stop()
      })

      // Handle reconnection events
      apiClient.current!.onReconnecting((attempt) => {
        setStatus('reconnecting')
        setDirectorMessage(`Reconnecting (${attempt})...`)
      })

      apiClient.current!.onReconnected(() => {
        setStatus('idle')
        setDirectorMessage('Reconnected')
        playEarcon('success')
        setTimeout(() => setDirectorMessage(null), 2000)
      })

      // Handle unexpected disconnection (after all retries exhausted)
      apiClient.current!.onDisconnect((error) => {
        console.error('Aura session disconnected:', error)
        setStatus('error')
        playEarcon('error')
        setDirectorMessage('Connection lost — tap to retry')
        stopHeartbeat()
        mediaManager.current?.stop()
      })

      await apiClient.current!.connect()

      // IMPORTANT: Await audio capture setup — worklet must be loaded before user can release
      await mediaManager.current.startAudioCapture((pcm16) => {
        apiClient.current?.sendAudioChunk(pcm16)
      })
      console.log('Audio capture started — worklet loaded')

      // Send first video frame IMMEDIATELY (don't wait 1s for interval)
      const firstFrame = mediaManager.current?.captureFrame()
      if (firstFrame && apiClient.current) {
        apiClient.current.sendVideoFrame(firstFrame)
        console.log('First video frame sent')
      }

      // Then continue sending frames every 1 second
      captureInterval.current = window.setInterval(() => {
        const frame = mediaManager.current?.captureFrame()
        if (frame && apiClient.current) {
          apiClient.current.sendVideoFrame(frame)
        }
      }, 1000)

    } catch (err) {
      console.error('Failed to start Aura session:', err)
      setStatus('error')
      playEarcon('error')
      setDirectorMessage('Connection failed')
      stopHeartbeat()
      mediaManager.current?.stop()
    }
  }, [startHeartbeat, stopHeartbeat])

  // ── Stop Recording -> Thinking ──
  const stopRecording = useCallback(() => {
    // Stop sending NEW video frames
    if (captureInterval.current) {
      clearInterval(captureInterval.current)
      captureInterval.current = null
    }

    // Send one final video frame for Gemini's context
    const frame = mediaManager.current?.captureFrame()
    if (frame && apiClient.current) {
      apiClient.current.sendVideoFrame(frame)
    }

    // Signal to Gemini that user's turn is complete — triggers response generation
    apiClient.current?.sendTurnComplete()

    // DO NOT call mediaManager.stop() here!
    // The audio/video tracks must stay alive until Gemini responds.
    // They will be stopped when the first audio response arrives (in onAudio handler above).

    setStatus('thinking')
    playEarcon('thinking')
    setDirectorMessage('Processing...')
    stopHeartbeat()

    // Haptic double-pulse
    if ('vibrate' in navigator) navigator.vibrate([50, 80, 50])
  }, [stopHeartbeat])

  // ── Full Cancel / Reset ──
  const cancelSession = useCallback(() => {
    setStatus('idle')
    setDirectorMessage(null)
    stopHeartbeat()
    mediaManager.current?.stop()
    audioPlayer.current?.stop()
    apiClient.current?.disconnect()
    if (captureInterval.current) {
      clearInterval(captureInterval.current)
      captureInterval.current = null
    }
  }, [stopHeartbeat])

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      mediaManager.current?.stop()
      stopHeartbeat()
      if (captureInterval.current) clearInterval(captureInterval.current)
    }
  }, [stopHeartbeat])

  // ── Handle mobile background/foreground lifecycle ──
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && status !== 'idle') {
        // Pause capture when backgrounded to save resources
        if (captureInterval.current) {
          clearInterval(captureInterval.current)
          captureInterval.current = null
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [status])

  // Determine active-like states for UI
  const isEngaged = status !== 'idle'

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-aura-dark text-aura-light overflow-hidden relative">
      {/* Dynamic Backgrounds */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute w-[200vw] h-[200vh] -top-[50vh] -left-[50vw] bg-[radial-gradient(ellipse_at_center,rgba(19,127,236,0.03)_0%,transparent_50%)] animate-spin-slow" />
        <div className="absolute w-[150vw] h-[150vh] -top-[25vh] -left-[25vw] bg-[radial-gradient(ellipse_at_center,rgba(112,0,255,0.03)_0%,transparent_50%)] animate-spin-reverse-slow" />
      </div>

      {/* Dynamic Main Content Area */}
      <main className="flex-1 relative w-full h-full overflow-hidden z-10">
        {activeView === 'nexus' && (
          <>
            {/* Header Layer */}
            <header className="absolute top-0 inset-x-0 px-8 py-10 flex justify-between items-center z-30 pointer-events-none">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-4 h-4 rounded-full transition-all duration-300",
                  status === 'recording' && "bg-red-500 shadow-[0_0_15px_#EF4444] animate-pulse",
                  status === 'thinking' && "bg-amber-400 shadow-[0_0_15px_#F59E0B] animate-pulse",
                  status === 'responding' && "bg-green-400 shadow-[0_0_15px_#4ADE80] animate-pulse",
                  status === 'reconnecting' && "bg-amber-400 shadow-[0_0_15px_#F59E0B] animate-pulse",
                  status === 'error' && "bg-red-600",
                  status === 'idle' && "bg-white/30"
                )} />
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/80" role="status" aria-live="polite">
                  {status === 'idle' && 'Ready'}
                  {status === 'recording' && 'Recording'}
                  {status === 'thinking' && 'Thinking'}
                  {status === 'responding' && 'Speaking'}
                  {status === 'reconnecting' && 'Reconnecting'}
                  {status === 'error' && 'Error'}
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
              status={status}
              directorMessage={directorMessage}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onCancel={cancelSession}
            />
          </>
        )}


        {activeView === 'settings' && (
          <SettingsPanel onClose={() => setActiveView('nexus')} />
        )}
      </main>

      {/* Persistent Bottom Nav */}
      {activeView !== 'settings' && (
        <nav className="relative z-30 flex justify-center items-center px-6 py-8 bg-aura-dark border-t border-white/10">
          <button
            onClick={() => setActiveView('nexus')}
            className={cn(
              "flex flex-col items-center gap-2 transition-all duration-500 px-10 py-2 rounded-full",
              isEngaged ? "text-aura-primary scale-110" : "text-white/40 hover:text-white/60"
            )}
          >
            <Eye className={cn("w-10 h-10 transition-transform duration-500", isEngaged && "animate-pulse")} />
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] mt-1">
              {status === 'idle' && 'Hold to Scan'}
              {status === 'recording' && 'Recording...'}
              {status === 'thinking' && 'Thinking...'}
              {status === 'responding' && 'Aura Speaking'}
              {status === 'reconnecting' && 'Reconnecting...'}
              {status === 'error' && 'Tap to Retry'}
            </span>
          </button>
        </nav>
      )}
    </div>
  )
}

export default App
