import { useState } from 'react'
import { clsx } from 'clsx'
import { initials, markHue } from '@/lib/signal.ts'

/**
 * A channel's logo, or its initials when there is none.
 *
 * Broadcaster logos are hotlinked from hundreds of unrelated hosts and a good
 * share of them 404, so the fallback is not an edge case — it is the second
 * most common outcome, and it has to look deliberate rather than broken.
 */
export function ChannelMark({
  name,
  logo,
  size = 'md',
}: {
  name: string
  logo: string | null
  size?: 'sm' | 'md'
}) {
  const [failed, setFailed] = useState(false)
  const box = size === 'sm' ? 'size-7 text-micro' : 'size-9 text-small'

  if (!logo || failed) {
    return (
      <span
        aria-hidden
        className={clsx(
          'flex shrink-0 items-center justify-center rounded-control font-medium text-readout/85',
          box,
        )}
        style={{ background: markHue(name) }}
      >
        {initials(name)}
      </span>
    )
  }

  return (
    <img
      src={logo}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={clsx('shrink-0 rounded-control bg-panel-lift object-contain p-0.5', box)}
    />
  )
}
