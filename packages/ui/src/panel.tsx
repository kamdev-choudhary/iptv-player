import type { ComponentProps, ReactNode } from 'react'
import { cn } from './lib/utils.ts'
import { Checkbox } from './components/ui/checkbox.tsx'
import { Label } from './components/ui/label.tsx'
import { Separator } from './components/ui/separator.tsx'
import { Skeleton } from './components/ui/skeleton.tsx'
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select.tsx'

/**
 * The panel layer: this application's own vocabulary, composed from the
 * shadcn/ui primitives rather than from raw elements.
 *
 * Everything here exists because a call site was repeating itself. A labelled
 * field, a filter checkbox, a section rule, a numeric readout — four things the
 * console does hundreds of times, each with one spelling.
 */

/**
 * A select that takes its options as data.
 *
 * shadcn's Select is a composition of five parts, which is the right shape for
 * a bespoke menu and the wrong one for a filter rendered from a facet list.
 * This wraps it, keeps the Radix behaviour — keyboard, typeahead, portalled
 * listbox — and takes an array.
 */
export interface PanelSelectOption {
  value: string
  label: string
  /** Shown right-aligned; the number of channels behind a filter value. */
  count?: number
}

export interface PanelSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: PanelSelectOption[]
  /** Offered as the first entry, and the label when nothing is chosen. */
  placeholder?: string
  id?: string
  className?: string
  'aria-label'?: string
  disabled?: boolean
}

/** Radix rejects an empty option value, so "no filter" needs a real one. */
export const ANY_OPTION = '__any__'

export function PanelSelect({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  className,
  disabled,
  ...rest
}: PanelSelectProps) {
  return (
    <SelectRoot
      value={value === '' ? ANY_OPTION : value}
      onValueChange={(next) => onValueChange(next === ANY_OPTION ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={rest['aria-label']}
        className={cn('h-8 w-full text-small', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {placeholder ? <SelectItem value={ANY_OPTION}>{placeholder}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex w-full items-center gap-2">
              <span className="flex-1 truncate">{option.label}</span>
              {option.count === undefined ? null : (
                <span className="tabular text-micro text-muted-foreground">
                  {option.count.toLocaleString()}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
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
      <Label htmlFor={htmlFor} className="text-micro font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-micro text-muted-foreground/80">{hint}</p> : null}
    </div>
  )
}

/** A filter toggle: a checkbox, its name, and how many rows it would leave. */
export function Check({
  id,
  label,
  checked,
  onChange,
  count,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  count?: number
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
        className="size-3.5"
      />
      <Label
        htmlFor={id}
        className="flex-1 cursor-pointer text-small font-normal text-muted-foreground hover:text-foreground"
      >
        {label}
      </Label>
      {count === undefined ? null : (
        <span className="tabular text-micro text-muted-foreground">{count.toLocaleString()}</span>
      )}
    </div>
  )
}

/**
 * A rule carrying a section name — the panel's structural device. The line
 * does the work that a capitalised eyebrow label would otherwise do.
 */
export function Rule({ children }: { children?: ReactNode }) {
  if (!children) return <Separator />
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-micro text-muted-foreground">{children}</span>
      <Separator className="flex-1" />
    </div>
  )
}

/** Small factual text set beside a value: resolution, latency, source count. */
export function Readout({
  value,
  unit,
  tone = 'muted',
  className,
}: {
  value: string | number
  unit?: string
  tone?: 'muted' | 'foreground' | 'live' | 'hold' | 'fault' | 'signal'
  className?: string
}) {
  return (
    <span
      className={cn(
        'tabular text-micro',
        tone === 'muted' && 'text-muted-foreground',
        tone === 'foreground' && 'text-foreground',
        tone === 'live' && 'text-live',
        tone === 'hold' && 'text-hold',
        tone === 'fault' && 'text-fault',
        tone === 'signal' && 'text-signal',
        className,
      )}
    >
      {value}
      {unit ? <span className="text-muted-foreground/70">{unit}</span> : null}
    </span>
  )
}

/** A placeholder row while the lineup loads, matching a row's exact height. */
export function RowSkeleton() {
  return (
    <div className="flex h-12 items-center gap-3 border-b px-3">
      <Skeleton className="size-7" />
      <Skeleton className="h-3 w-40" />
      <Skeleton className="ml-auto h-3 w-10" />
    </div>
  )
}

/**
 * An empty panel is an instruction, not a mood. Every use of this names the
 * action that fills it.
 */
export function Empty({ head, body, action }: { head: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-10">
      <p className="text-small text-foreground">{head}</p>
      <p className="max-w-[46ch] text-small text-muted-foreground">{body}</p>
      {action}
    </div>
  )
}

/** A scrollable region that keeps its own scroll from reaching the page. */
export function PanelScroll({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div {...rest} className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)} />
  )
}
