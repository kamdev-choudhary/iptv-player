import type { ReactNode } from 'react'
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { Button, Empty } from '@tuner/ui'

/**
 * What the panel does when its own code throws.
 *
 * React unmounts the whole tree on an unhandled render error, so without a
 * boundary one bad field in one API response is a white screen. There are two
 * here, at the two places where that distinction is worth drawing:
 *
 *   - around the stage, so a player fault leaves the lineup usable and lets
 *     someone pick a different channel;
 *   - around everything, as the last resort.
 *
 * Neither swallows the error. It is still logged, because a boundary that
 * hides the cause is worse than the white screen it replaced.
 */

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'No cause was reported.'
}

function StageFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <section
      aria-label="Player"
      className="flex h-full items-center justify-center rounded-xl border bg-card"
    >
      <Empty
        head="The player stopped"
        body={`Something in the picture failed rather than the stream: ${describe(error)}`}
        action={
          <Button size="sm" onClick={resetErrorBoundary}>
            Try this channel again
          </Button>
        }
      />
    </section>
  )
}

function AppFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex h-dvh items-center justify-center p-6">
      <Empty
        head="Tuner could not draw this screen"
        body={`${describe(error)} Trying again is usually enough; if it is not, reloading starts from a clean slate.`}
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={resetErrorBoundary}>
              Try again
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        }
      />
    </div>
  )
}

/** Reported to the console as an error, so it is never silently absorbed. */
function report(error: unknown) {
  console.error('render failed', error)
}

export function StageGuard({
  children,
  resetKey,
}: {
  children: ReactNode
  resetKey: string | null
}) {
  return (
    <ErrorBoundary
      FallbackComponent={StageFallback}
      onError={report}
      // Tuning a different channel is itself a retry, so the fallback clears
      // when the channel changes rather than stranding the next pick behind it.
      resetKeys={[resetKey]}
    >
      {children}
    </ErrorBoundary>
  )
}

export function AppGuard({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={AppFallback} onError={report}>
      {children}
    </ErrorBoundary>
  )
}
