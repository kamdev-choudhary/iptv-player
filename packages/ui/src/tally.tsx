import { clsx } from 'clsx'

/**
 * The signal indicator, and the one device this interface is built around.
 *
 * A source is in exactly one of four states, and the ring says which: filled
 * means the server reached it, half-filled means nobody has tried yet, hollow
 * means it has been failing, and a ring in violet means it plays only through
 * the proxy. The same mark means the same thing in the lineup, in the source
 * strip and beside a filter count — so the state can be read without a legend
 * once it has been learned once.
 */

export type TallyState = 'live' | 'hold' | 'fault' | 'routed' | 'off'

const COLOR: Record<TallyState, string> = {
  live: 'text-live',
  hold: 'text-hold',
  fault: 'text-fault',
  routed: 'text-routed',
  off: 'text-rail',
}

/** Said aloud by a screen reader, and used as the title on hover. */
export const TALLY_LABEL: Record<TallyState, string> = {
  live: 'Live',
  hold: 'Not checked yet',
  fault: 'Failing',
  routed: 'Plays through the server',
  off: 'Nothing playable',
}

export interface TallyProps {
  state: TallyState
  /** Flashes once, for a source that has just come good. */
  struck?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function Tally({ state, struck, size = 'sm', className }: TallyProps) {
  const box = size === 'sm' ? 'size-2' : 'size-2.5'
  return (
    <>
      {/* The state reaches a screen reader as words rather than as the label of
          a picture, since the mark itself is drawn in CSS. */}
      <span className="sr-only">{TALLY_LABEL[state]}</span>
      <span
        aria-hidden
        title={TALLY_LABEL[state]}
        className={clsx(
          'inline-block shrink-0 rounded-pill border',
          box,
          COLOR[state],
          // Filled, half, hollow. The fill carries the state, not the hue
          // alone, so it survives print, dimming and a colourblind eye.
          state === 'live' && 'border-current bg-current',
          state === 'hold' && 'border-current bg-current/35',
          state === 'fault' && 'border-current bg-transparent',
          state === 'routed' && 'border-current bg-current/60',
          state === 'off' && 'border-current bg-transparent opacity-60',
          struck && 'motion-safe:animate-[tally-strike_600ms_ease-out]',
          className,
        )}
      />
    </>
  )
}

/** A count beside its tally, for the state tallies in the filter panel. */
export function TallyCount({
  state,
  label,
  count,
  active,
  onClick,
}: {
  state: TallyState
  label: string
  count: number
  active?: boolean
  onClick?: () => void
}) {
  const Element = onClick ? 'button' : 'div'
  return (
    <Element
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? Boolean(active) : undefined}
      className={clsx(
        'flex w-full items-center gap-2 py-1 text-small',
        onClick && 'cursor-pointer hover:text-readout',
        active ? 'text-readout' : 'text-etch',
      )}
    >
      <Tally state={state} />
      <span className="flex-1 text-left">{label}</span>
      <span className="tabular text-micro">{count.toLocaleString()}</span>
    </Element>
  )
}
