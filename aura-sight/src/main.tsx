import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from 'react-error-boundary'
import './index.css'
import App from './App.tsx'

import { FallbackProps } from 'react-error-boundary'

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#050505] p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
        <div className="w-8 h-8 rounded-full bg-red-500" />
      </div>
      <h1 className="text-white text-4xl font-bold tracking-tight mb-4">Aura System Error</h1>
      <pre className="text-red-400 text-lg font-mono bg-red-900/10 p-4 rounded-xl border border-red-500/20 max-w-lg overflow-x-auto whitespace-pre-wrap">
        {((error as any)?.message || 'Unknown Error')}
      </pre>
      <p className="mt-8 text-slate-500 text-lg max-w-md">
        This is typically due to a configuration gap on the server. Please check your environment variables.
      </p>
      <button 
        onClick={resetErrorBoundary}
        className="mt-8 px-8 py-4 bg-white text-black font-bold rounded-xl active:scale-95 transition-all text-xl"
      >
        Retry Initialization
      </button>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
