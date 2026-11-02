import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster, TooltipProvider } from '@tuner/ui'
import { AppGuard } from './components/guard.tsx'
import App from './App.tsx'
import './index.css'

/**
 * The catalog is server-side now, so the cache policy is the client's whole
 * data layer. Sources are refetched rarely on purpose: a probe sweep runs
 * every few hours, so asking more often than that only costs requests.
 */
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: (failureCount, error) => {
        // A contract or client error will fail the same way every time.
        const status = (error as { status?: number }).status
        if (status && status < 500) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('No #root element to mount into')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={400}>
        <AppGuard>
          <App />
        </AppGuard>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
)
