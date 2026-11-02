import { useState } from 'react'
import { cn } from '@tuner/ui'
import { initials, markTone } from '@/lib/signal.ts'

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
  const box = size === 'sm' ? 'size-8 text-micro' : 'size-10 text-small'

  if (!logo || failed) {
    return (
      <span
        aria-hidden
        className={cn('flex shrink-0 items-center justify-center rounded-lg font-medium', box)}
        style={{
          background: markTone(name),
          color: 'color-mix(in oklab, #eef1f5 80%, transparent)',
        }}
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
      className={cn('shrink-0 rounded-lg bg-panel-lift object-contain p-1', box)}
    />
  )
}
