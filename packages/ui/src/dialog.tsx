import { useEffect, useRef, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { Button } from './controls.tsx'

/**
 * A panel dialog built on the native `<dialog>` element, which brings the
 * focus trap, the backdrop, Escape to close and the top layer with it. Doing
 * that by hand with divs is how keyboard users end up stranded behind a modal.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  width?: 'md' | 'lg'
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      // `cancel` is Escape; `close` covers every other way it ended.
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClose={onClose}
      // Clicking the backdrop means the dialog element itself, not its panel.
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-labelledby="dialog-title"
      className={clsx(
        'm-auto w-[calc(100vw-2rem)] border border-rail bg-panel p-0 text-readout',
        'backdrop:bg-rack/80 backdrop:backdrop-blur-sm',
        width === 'md' ? 'max-w-lg' : 'max-w-3xl',
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-rail px-4 py-3">
        <div>
          <h2 id="dialog-title" className="text-section leading-tight">
            {title}
          </h2>
          {description ? <p className="mt-1 max-w-[52ch] text-small text-etch">{description}</p> : null}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>

      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-rail px-4 py-3">{footer}</div>
      ) : null}
    </dialog>
  )
}
