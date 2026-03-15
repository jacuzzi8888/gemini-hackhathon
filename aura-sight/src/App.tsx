import { useState, useCallback, useRef, useEffect } from 'react'
import { Eye, Settings, Video, VideoOff } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { MediaManager } from './lib/MediaManager'
import { AudioPlayer } from './lib/AudioPlayer'
import { LiveAPIClient } from './lib/LiveAPIClient'
import { MediaPipeManager } from './lib/MediaPipeManager'
import type { HazardEvent } from './lib/MediaPipeManager'
import { unlockAudio, playEarcon } from './lib/Earcon'
import { supabase } from './lib/supabase'

import { Nexus } from './components/Nexus'
import { SettingsPanel } from './components/SettingsPanel'
import { Login } from './components/Login'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type AuraStatus = 'idle' | 'recording' | 'thinking' | 'responding' | 'listening' | 'watching' | 'error' | 'reconnecting'
type ViewMode = 'nexus' | 'settings' | 'loading'

function App() {
  const [session, setSession] = useState<any>(null)
  const [isLoadingSession, setIsLoadingSession] = useState(true)

  const [activeView, setActiveView] = useState<ViewMode>('nexus')
  const [status, setStatus] = useState<AuraStatus>('idle')
  const statusRef = useRef<AuraStatus>('idle')
  
  // Helper to keep ref in sync with state
  const updateStatus = (newStatus: AuraStatus) => {
    if (statusRef.current === newStatus) return
    statusRef.current = newStatus
    setStatus(newStatus)
  }
  const [directorMessage, setDirectorMessage] = useState<string | null>(null)
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null)
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(true)
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0)
  const [isHandsFree, setIsHandsFree] = useState<boolean>(false)
  const isHandsFreeRef = useRef<boolean>(false)
  const wasLastResponseQuestionRef = useRef<boolean>(false)
  const listeningTimeoutRef = useRef<number | null>(null)

  const mediaManager = useRef<MediaManager | null>(null)
  const mediaPipeManager = useRef<MediaPipeManager | null>(null)
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
    if (!mediaPipeManager.current) mediaPipeManager.current = new MediaPipeManager()
    if (!audioPlayer.current) audioPlayer.current = new AudioPlayer()
    if (!apiClient.current) apiClient.current = new LiveAPIClient()

    try {
      await mediaManager.current.initialize()
    } catch (err) {
      updateStatus('error')
      playEarcon('error')
      setDirectorMessage('Camera access denied')
      return
    }

    setVideoStream(mediaManager.current.getStream())
    mediaManager.current.toggleVideo(cameraEnabled)

    updateStatus('recording')
    playEarcon('start')
    setDirectorMessage('Listening...')
    startHeartbeat()

    if ('vibrate' in navigator) navigator.vibrate([80, 40, 80])

    // Initialize MediaPipe Safety Layer (Parallel to Cloud)
    mediaPipeManager.current.initialize().catch(err => {
      console.warn("MediaPipe Safety Layer failed to initialize, continuing with Cloud-only:", err);
    });

    mediaPipeManager.current.onHazard((hazard: HazardEvent) => {
      // 1. Immediate tactile feedback for safety
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]); 
      }
      // console.log("EDGE HAZARD DETECTED:", hazard.label);

      // 2. PRIVACY-AT-SOURCE: If it is a person, apply a privacy mask
      if (hazard.label === 'person' && hazard.boundingBox && mediaManager.current) {
        mediaManager.current.setPrivacyMasks([hazard.boundingBox]);
      }

      // 3. SPATIAL FEEDBACK: Orientation
      if (hazard.boundingBox && audioPlayer.current) {
        // Map normalized X (0 to 1) to Panner X (-1 to 1)
        const spatialX = (hazard.boundingBox.x + hazard.boundingBox.w / 2) * 2 - 1;
        audioPlayer.current.updateSpatialPosition(spatialX, 0, -1);
      }
    });

    try {
      await audioPlayer.current.resume()

      apiClient.current!.onContent((text) => {
        setDirectorMessage(text)
        updateStatus('responding')
        stopHeartbeat()
        
        // Simple question detection - ends with ?
        const isQuestion = text.trim().endsWith('?');
        wasLastResponseQuestionRef.current = isQuestion;
      })

      apiClient.current!.onAudio((pcm16) => {
        updateStatus('responding')
        stopHeartbeat()
        audioPlayer.current?.queueAudio(pcm16)
      })

      apiClient.current!.onInterrupted(() => {
        audioPlayer.current?.clearQueue()
        audioPlayer.current?.resume()
      })

      apiClient.current!.onTurnComplete(async () => {
        if (isHandsFreeRef.current) {
          updateStatus('watching');
          setDirectorMessage('Watching...');
          startHeartbeat();
          
          // Force clear any privacy masks to ensure feed is clear (except for persons)
          mediaManager.current?.setPrivacyMasks([]);

          // RESTART AUDIO CAPTURE FOR VAD with a robust delay
          // This allows session resumption / token update to stabilize
          setTimeout(async () => {
            try {
              if (statusRef.current === 'watching') {
                await mediaManager.current?.startAudioCapture((pcm16) => {
                  apiClient.current?.sendAudioChunk(pcm16);
                });
              }
            } catch (err) {
              console.error("Failed to restart audio capture in hands-free mode:", err);
            }
          }, 1000); // 2026 Standard: 1s for hardware stabilization

          // Ensure capture interval is running
          if (!captureInterval.current) {
            captureInterval.current = window.setInterval(() => {
              const frame = mediaManager.current?.captureFrame();
              if (frame && apiClient.current) {
                apiClient.current.sendVideoFrame(frame);
              }
            }, 1000);
          }
          return;
        }

        if (wasLastResponseQuestionRef.current) {
          // ENTER CONDITIONAL HOT-MIC (LISTENING)
          updateStatus('listening');
          setDirectorMessage('Aura is listening...');
          
          // Restart audio capture for VAD/Interaction
          try {
            await mediaManager.current?.startAudioCapture((pcm16) => {
              apiClient.current?.sendAudioChunk(pcm16);
            });
          } catch (err) {
            console.error("Failed to start audio capture for listening state:", err);
          }

          // Set auto-timeout
          if (listeningTimeoutRef.current) clearTimeout(listeningTimeoutRef.current);
          listeningTimeoutRef.current = window.setTimeout(() => {
            if (statusRef.current === 'listening') {
              cancelSession();
            }
          }, 10000); // 10s timeout
          
          return;
        }

        updateStatus('idle')
        setDirectorMessage(null)
        stopHeartbeat()
        mediaManager.current?.stop()
        setVideoStream(null)
      })

      apiClient.current!.onHandsFreeToggle((enabled) => {
        setIsHandsFree(enabled);
        isHandsFreeRef.current = enabled;
        if (enabled) {
          playEarcon('success');
          setDirectorMessage('Hands-free active');
          // VAD is enabled in setup, so AI will respond automatically from now on
        } else {
          setDirectorMessage('Hands-free off');
          playEarcon('stop');
          // If we're not currently recording/responding, cleanup
          if (statusRef.current === 'idle') {
            cancelSession();
          }
        }
      });

      apiClient.current!.onTranscription((transcript) => {
        if (statusRef.current === 'recording' || statusRef.current === 'listening' || statusRef.current === 'watching') {
          setDirectorMessage(`"${transcript}"`);

          const lowerTranscript = transcript.toLowerCase();
          
          // VOICE COMMANDS: Mode Switching
          if (lowerTranscript.includes("watch this") || lowerTranscript.includes("be my eyes")) {
            if (!isHandsFreeRef.current) {
              setIsHandsFree(true);
              isHandsFreeRef.current = true;
              updateStatus('watching'); // Explicitly transition to watching
              playEarcon('success');
              setDirectorMessage('Initiating Watch Mode...');
            }
          }

          if (lowerTranscript.includes("stop watching") || lowerTranscript.includes("go to sleep")) {
            cancelSession();
          }
        }
      });

      apiClient.current!.onDisconnect(() => {
        // 2026 Persistence Logic: Only kill media if we are in a terminal state or idle
        // If the socket is reconnecting, we MUST keep the stream alive for resumption.
        if (statusRef.current !== 'idle' && statusRef.current !== 'error' && statusRef.current !== 'reconnecting') {
           updateStatus('error');
           playEarcon('error');
           setDirectorMessage('Connection lost');
           
           // Terminal stop
           mediaManager.current?.stop();
           setVideoStream(null);
           stopHeartbeat();
        }
      })

      apiClient.current!.onReconnecting((attempt) => {
        updateStatus('reconnecting');
        setDirectorMessage(`Reconnecting (Attempt ${attempt})...`);
      });

      apiClient.current!.onReconnected(() => {
        if (isHandsFreeRef.current) {
          updateStatus('watching');
          setDirectorMessage('Watching...');
          
          // 2026 Resumption: Ensure capture loops are active
          if (mediaManager.current?.getStream()) {
             mediaManager.current.startAudioCapture((pcm16) => {
               apiClient.current?.sendAudioChunk(pcm16);
             });
             
             if (!captureInterval.current) {
                captureInterval.current = window.setInterval(() => {
                  const frame = mediaManager.current?.captureFrame();
                  if (frame && apiClient.current) {
                    apiClient.current.sendVideoFrame(frame);
                  }
                }, 1000);
             }
          }
        } else {
          updateStatus('idle');
          setDirectorMessage(null);
        }
      });

      // Get JWT for auth
      let token: string | undefined = undefined;
      const authKey = Object.keys(sessionStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (authKey) {
        const sbData = JSON.parse(sessionStorage.getItem(authKey) || '{}');
        token = sbData?.access_token;
      }

      // Re-use connection if already active
      if (!apiClient.current!.isConnected) {
        await apiClient.current!.connect(token)
      }

      await mediaManager.current.startAudioCapture((pcm16) => {
        apiClient.current?.sendAudioChunk(pcm16)
      })

      captureInterval.current = window.setInterval(() => {
        const frame = mediaManager.current?.captureFrame()
        if (frame && apiClient.current) {
          apiClient.current.sendVideoFrame(frame)
        }

        // Parallel Edge Detection
        const videoElement = mediaManager.current?.getVideoElement();
        if (videoElement && mediaPipeManager.current) {
          // Clear previous masks before new detection cycle to avoid sticky blurring
          mediaManager.current?.setPrivacyMasks([]);
          mediaPipeManager.current.detect(videoElement, performance.now());
        }
      }, 1000)

    } catch (err) {
      updateStatus('error')
      playEarcon('error')
      setDirectorMessage('Connection failed')
      stopHeartbeat()
      mediaManager.current?.stop()
    }
  }, [startHeartbeat, stopHeartbeat, cameraEnabled])

  const stopRecording = useCallback(() => {
    if (captureInterval.current && !isHandsFreeRef.current) {
      clearInterval(captureInterval.current)
      captureInterval.current = null
    }

    const frame = mediaManager.current?.captureFrame()
    if (frame && apiClient.current) {
      apiClient.current.sendVideoFrame(frame)
    }

    apiClient.current?.sendTurnComplete()
    updateStatus('thinking')
    playEarcon('thinking')
    setDirectorMessage('Processing...')
    stopHeartbeat()
    if ('vibrate' in navigator) navigator.vibrate([50, 80, 50])
  }, [stopHeartbeat])

  const cancelSession = useCallback(() => {
    updateStatus('idle')
    setDirectorMessage(null)
    setIsHandsFree(false)
    isHandsFreeRef.current = false
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
              isHandsFree={isHandsFree}
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
