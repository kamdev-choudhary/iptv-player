import { clsx } from 'clsx'
import type { ComponentPropsWithRef, ReactNode } from 'react'

/**
 * Panel controls. Flush surfaces with hairline rails, and a 2px radius only on
 * the things you press — equipment is ruled, not carded, so there are no
 * shadows and no uniform corner radius here.
 */

const CONTROL_BASE =
  'rounded-control border border-rail bg-panel text-readout transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-45'

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: 'primary' | 'panel' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'panel', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-control border font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-7 px-2 text-micro' : 'h-8 px-3 text-small',
        variant === 'primary' &&
          'border-signal/50 bg-signal/15 text-signal hover:bg-signal/25 hover:border-signal',
        variant === 'panel' && 'border-rail bg-panel-lift text-readout hover:border-etch/50',
        variant === 'ghost' && 'border-transparent bg-transparent text-etch hover:text-readout',
        variant === 'danger' && 'border-fault/40 bg-fault/10 text-fault hover:bg-fault/20',
        className,
      )}
    />
  )
}

/**
 * A label and its control. The label sits above in sentence case rather than
 * as a tracked-out caps eyebrow; the panel's rails already carry the structure.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-micro text-etch">
        {label}
      </label>
      {children}
      {hint ? <p className="text-micro text-etch/80">{hint}</p> : null}
    </div>
  )
}

export function Input({ className, ...rest }: ComponentPropsWithRef<'input'>) {
  return (
    <input
      {...rest}
      className={clsx(
        CONTROL_BASE,
        'h-8 w-full px-2 text-small placeholder:text-etch/60 focus:border-signal/60',
        className,
      )}
    />
  )
}

export interface SelectProps extends ComponentPropsWithRef<'select'> {
  options: Array<{ value: string; label: string; count?: number }>
  /** Shown as the first option when nothing is chosen. */
  placeholder?: string
}

export function Select({ options, placeholder, className, ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      className={clsx(
        CONTROL_BASE,
        'h-8 w-full appearance-none bg-[length:12px] bg-no-repeat px-2 pr-7 text-small focus:border-signal/60',
        className,
      )}
      style={{
        // An inline chevron, so no icon dependency reaches into this package.
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%238c949e' stroke-width='1.4'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 8px center',
      }}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.count === undefined ? o.label : `${o.label} (${o.count.toLocaleString()})`}
        </option>
      ))}
    </select>
  )
}

/** A labelled checkbox, used for the lineup's filters. */
export function Check({
  label,
  checked,
  onChange,
  count,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  count?: number
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-small text-etch hover:text-readout">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 shrink-0 appearance-none rounded-control border border-rail bg-panel
                   checked:border-signal checked:bg-signal/70"
      />
      <span className="flex-1">{label}</span>
      {count === undefined ? null : <span className="tabular text-micro">{count.toLocaleString()}</span>}
    </label>
  )
}

/** A horizontal rule carrying a section name, the panel's structural device. */
export function Rule({ children }: { children?: ReactNode }) {
  if (!children) return <hr className="border-0 border-t border-rail" />
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-micro text-etch">{children}</span>
      <hr className="h-0 flex-1 border-0 border-t border-rail" />
    </div>
  )
}

/** Small factual text set beside a value: resolution, latency, source count. */
export function Readout({
  value,
  unit,
  tone = 'etch',
  className,
}: {
  value: string | number
  unit?: string
  tone?: 'etch' | 'readout' | 'live' | 'hold' | 'fault'
  className?: string
}) {
  return (
    <span
      className={clsx(
        'tabular text-micro',
        tone === 'etch' && 'text-etch',
        tone === 'readout' && 'text-readout',
        tone === 'live' && 'text-live',
        tone === 'hold' && 'text-hold',
        tone === 'fault' && 'text-fault',
        className,
      )}
    >
      {value}
      {unit ? <span className="text-etch/70">{unit}</span> : null}
    </span>
  )
}

export function Badge({
  children,
  tone = 'rail',
}: {
  children: ReactNode
  tone?: 'rail' | 'signal' | 'routed' | 'fault' | 'live' | 'hold'
}) {
  return (
    <span
      className={clsx(
        'inline-flex h-4 items-center rounded-control border px-1 text-micro',
        tone === 'rail' && 'border-rail text-etch',
        tone === 'signal' && 'border-signal/40 text-signal',
        tone === 'routed' && 'border-routed/40 text-routed',
        tone === 'fault' && 'border-fault/40 text-fault',
        tone === 'live' && 'border-live/40 text-live',
        tone === 'hold' && 'border-hold/40 text-hold',
      )}
    >
      {children}
    </span>
  )
}

/** A placeholder row while the lineup loads, matching a row's exact height. */
export function RowSkeleton() {
  return (
    <div className="flex h-12 items-center gap-3 border-b border-rail px-3">
      <div className="size-7 animate-pulse rounded-control bg-rail" />
      <div className="h-3 w-40 animate-pulse rounded-control bg-rail" />
      <div className="ml-auto h-3 w-10 animate-pulse rounded-control bg-rail" />
    </div>
  )
}

/**
 * An empty panel is an instruction, not a mood. Every use of this names the
 * action that fills it.
 */
export function Empty({
  head,
  body,
  action,
}: {
  head: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-10">
      <p className="text-small text-readout">{head}</p>
      <p className="max-w-[46ch] text-small text-etch">{body}</p>
      {action}
    </div>
  )
}
