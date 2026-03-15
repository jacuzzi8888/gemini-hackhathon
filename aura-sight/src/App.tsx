import { useState, useCallback, useRef, useEffect } from 'react'
import { Eye, Settings, Video, VideoOff } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { MediaManager } from './lib/MediaManager'
import { AudioPlayer } from './lib/AudioPlayer'
import { LiveAPIClient } from './lib/LiveAPIClient'
import { unlockAudio, playEarcon } from './lib/Earcon'
import { supabase } from './lib/supabase'

import { Nexus } from './components/Nexus'
import { SettingsPanel } from './components/SettingsPanel'
import { Login } from './components/Login'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type AuraStatus = 'idle' | 'recording' | 'thinking' | 'responding' | 'error' | 'reconnecting'
type ViewMode = 'nexus' | 'settings' | 'loading'

function App() {
  const [session, setSession] = useState<any>(null)
  const [isLoadingSession, setIsLoadingSession] = useState(true)

  const [activeView, setActiveView] = useState<ViewMode>('nexus')
  const [status, setStatus] = useState<AuraStatus>('idle')
  const [directorMessage, setDirectorMessage] = useState<string | null>(null)
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null)
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(true)
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0)

  const mediaManager = useRef<MediaManager | null>(null)
  const audioPlayer = useRef<AudioPlayer | null>(null)
  const apiClient = useRef<LiveAPIClient | null>(null)
  const captureInterval = useRef<number | null>(null)
  const heartbeatInterval = useRef<number | null>(null)

  // ── Session Auto-Resume ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setIsLoadingSession(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

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

  const isEngaged = status !== 'idle'

  // ── Start Recording ──
  const startRecording = useCallback(async () => {
    await unlockAudio()

    if (!mediaManager.current) mediaManager.current = new MediaManager()
    if (!audioPlayer.current) audioPlayer.current = new AudioPlayer()
    if (!apiClient.current) apiClient.current = new LiveAPIClient()

    try {
      await mediaManager.current.initialize()
    } catch (err) {
      setStatus('error')
      playEarcon('error')
      setDirectorMessage('Camera access denied')
      return
    }

    setVideoStream(mediaManager.current.getStream())
    mediaManager.current.toggleVideo(cameraEnabled)

    setStatus('recording')
    playEarcon('start')
    setDirectorMessage('Listening...')
    startHeartbeat()

    if ('vibrate' in navigator) navigator.vibrate([80, 40, 80])

    try {
      await audioPlayer.current.resume()

      apiClient.current!.onContent((text) => {
        setDirectorMessage(text)
        setStatus('responding')
        stopHeartbeat()
      })

      apiClient.current!.onAudio((pcm16) => {
        setStatus('responding')
        stopHeartbeat()
        audioPlayer.current?.queueAudio(pcm16)
      })

      apiClient.current!.onInterrupted(() => {
        audioPlayer.current?.clearQueue()
        audioPlayer.current?.resume()
      })

      apiClient.current!.onTurnComplete(() => {
        setStatus('idle')
        setDirectorMessage(null)
        stopHeartbeat()
        mediaManager.current?.stop()
        setVideoStream(null)
        apiClient.current?.disconnect()
      })

      apiClient.current!.onDisconnect(() => {
        setStatus('error')
        playEarcon('error')
        setDirectorMessage('Connection lost')
        stopHeartbeat()
        mediaManager.current?.stop()
        setVideoStream(null)
      })

      // Get JWT for auth
      let token: string | undefined = undefined;
      const authKey = Object.keys(sessionStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (authKey) {
        const sbData = JSON.parse(sessionStorage.getItem(authKey) || '{}');
        token = sbData?.access_token;
      }

      await apiClient.current!.connect(token)

      await mediaManager.current.startAudioCapture((pcm16) => {
        apiClient.current?.sendAudioChunk(pcm16)
      })

      captureInterval.current = window.setInterval(() => {
        const frame = mediaManager.current?.captureFrame()
        if (frame && apiClient.current) {
          apiClient.current.sendVideoFrame(frame)
        }
      }, 1000)

    } catch (err) {
      setStatus('error')
      playEarcon('error')
      setDirectorMessage('Connection failed')
      stopHeartbeat()
      mediaManager.current?.stop()
    }
  }, [startHeartbeat, stopHeartbeat, cameraEnabled])

  const stopRecording = useCallback(() => {
    if (captureInterval.current) {
      clearInterval(captureInterval.current)
      captureInterval.current = null
    }

    const frame = mediaManager.current?.captureFrame()
    if (frame && apiClient.current) {
      apiClient.current.sendVideoFrame(frame)
    }

    apiClient.current?.sendTurnComplete()
    setStatus('thinking')
    playEarcon('thinking')
    setDirectorMessage('Processing...')
    stopHeartbeat()
    if ('vibrate' in navigator) navigator.vibrate([50, 80, 50])
  }, [stopHeartbeat])

  const cancelSession = useCallback(() => {
    setStatus('idle')
    setDirectorMessage(null)
    stopHeartbeat()
    mediaManager.current?.stop()
    setVideoStream(null)
    audioPlayer.current?.stop()
    apiClient.current?.disconnect()
    if (captureInterval.current) {
      clearInterval(captureInterval.current)
      captureInterval.current = null
    }
  }, [stopHeartbeat])

  const cycleCamera = useCallback(async () => {
    if (!mediaManager.current) mediaManager.current = new MediaManager()
    
    let currentCameras = cameras
    if (currentCameras.length === 0) {
      currentCameras = await mediaManager.current.getAvailableCameras()
      setCameras(currentCameras)
    }

    if (currentCameras.length === 0) return

    const nextIndex = (currentCameraIndex + 1) % currentCameras.length
    setCurrentCameraIndex(nextIndex)

    if ('vibrate' in navigator) {
      const isBack = currentCameras[nextIndex].label.toLowerCase().includes('back') || 
                     currentCameras[nextIndex].label.toLowerCase().includes('environment')
      navigator.vibrate(isBack ? [40, 40, 40] : [120])
    }

    if (isEngaged) {
      await mediaManager.current.initialize(currentCameras[nextIndex].id)
      setVideoStream(mediaManager.current.getStream())
    }
  }, [cameras, currentCameraIndex, isEngaged])

  const toggleCamera = useCallback(() => {
    const newState = !cameraEnabled
    setCameraEnabled(newState)
    if (mediaManager.current) {
      mediaManager.current.toggleVideo(newState)
    }
  }, [cameraEnabled])

  if (isLoadingSession) {
    return (
        <div className="flex h-[100dvh] w-full items-center justify-center bg-aura-dark text-aura-light">
            <p className="text-3xl font-bold animate-pulse tracking-widest text-aura-cyan">AURA</p>
        </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-aura-dark text-aura-light overflow-hidden relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute w-[200vw] h-[200vh] -top-[50vh] -left-[50vw] bg-[radial-gradient(ellipse_at_center,rgba(19,127,236,0.03)_0%,transparent_50%)] animate-spin-slow" />
        <div className="absolute w-[150vw] h-[150vh] -top-[25vh] -left-[25vw] bg-[radial-gradient(ellipse_at_center,rgba(112,0,255,0.03)_0%,transparent_50%)] animate-spin-reverse-slow" />
      </div>

      <main className="flex-1 relative w-full h-full overflow-hidden z-10">
        {activeView === 'nexus' ? (
          <>
            <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
              <div className="flex items-center gap-2 text-white">
                <Eye className="w-6 h-6 text-aura-cyan" aria-hidden="true" />
                <span className="font-bold tracking-widest uppercase text-sm">Aura</span>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleCamera}
                  className="p-3 text-slate-300 hover:text-white transition-colors"
                >
                  {cameraEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6 text-red-400" />}
                </button>
                <button
                  onClick={cycleCamera}
                  className="p-3 text-aura-cyan hover:text-white transition-all active:rotate-180"
                >
                  <Eye className="w-7 h-7" />
                </button>
                <button
                  onClick={() => setActiveView('settings')}
                  className="p-3 text-slate-300 hover:text-white transition-colors"
                >
                  <Settings className="w-6 h-6" />
                </button>
              </div>
            </header>

            <Nexus
              status={status}
              directorMessage={directorMessage}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onCancel={cancelSession}
              videoStream={videoStream}
              cameraEnabled={cameraEnabled}
            />
          </>
        ) : (
          <SettingsPanel onClose={() => setActiveView('nexus')} />
        )}
      </main>

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
              {status === 'idle' ? 'Hold to Scan' : status.toUpperCase()}
            </span>
          </button>
        </nav>
      )}
    </div>
  )
}

export default App
