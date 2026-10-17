import { useEffect, useState } from 'react'
import { hueFor, initials } from '@/lib/channels'
import { cn } from '@/lib/utils'
import type { Channel } from '@/lib/types'

/**
 * A channel's logo, or its initials on the channel's own bar colour. Public
 * logo URLs rot constantly, so the fallback is the common case, not the edge.
 */
export function ChannelLogo({
  channel,
  className,
  imgClassName,
}: {
  channel: Channel
  className?: string
  imgClassName?: string
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [channel.o])

  const hue = hueFor(channel.n)
  const showImage = channel.o && !broken

  return (
    <span
      className={cn('hue-bg hue-ring grid place-items-center overflow-hidden', className)}
      style={{ '--hue': hue } as React.CSSProperties}
    >
      {showImage ? (
        <img
          src={channel.o}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className={cn('max-h-full max-w-full object-contain', imgClassName)}
        />
      ) : (
        <span className="ident hue-text text-sm font-bold" aria-hidden>
          {initials(channel.n)}
        </span>
      )}
    </span>
  )
}
