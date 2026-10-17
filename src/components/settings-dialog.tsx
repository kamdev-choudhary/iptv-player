import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { store, type Settings } from '@/lib/store'

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onClearData,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: Settings
  onClearData: () => void
}) {
  const [proxy, setProxy] = useState(settings.proxy)
  useEffect(() => {
    if (open) setProxy(settings.proxy)
  }, [open, settings.proxy])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) store.setSettings({ proxy: proxy.trim() })
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Everything here stays in this browser. Tuner has no account and no server.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="s-proxy">CORS proxy</Label>
          <Input
            id="s-proxy"
            type="url"
            value={proxy}
            onChange={(e) => setProxy(e.target.value)}
            placeholder="https://your-proxy.example/?url="
            autoComplete="off"
          />
          <p className="text-muted-foreground text-xs leading-relaxed">
            Many broadcasters don't let a browser on another site read their streams. Run your own
            proxy, put its prefix here, and Tuner will offer it as a retry when a stream is refused.
            The channel URL is appended to the prefix.
          </p>
        </div>

        <Separator />

        <div className="grid gap-4">
          <Toggle
            id="s-autoproxy"
            label="Use the proxy automatically"
            hint="Retry through the proxy as soon as a stream is refused, without asking."
            checked={settings.autoProxy}
            onChange={(v) => store.setSettings({ autoProxy: v })}
          />
          <Toggle
            id="s-autonext"
            label="Move to the next source on failure"
            hint="Most channels list several sources. This walks them until one plays."
            checked={settings.autoNext}
            onChange={(v) => store.setSettings({ autoNext: v })}
          />
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={onClearData} className="text-destructive">
            Clear saved data
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-muted-foreground text-xs leading-snug">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  )
}
