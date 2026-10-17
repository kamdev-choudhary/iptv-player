import { useRef, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
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
import { Separator } from '@/components/ui/separator'
import { parseM3U } from '@/lib/m3u'
import { store } from '@/lib/store'
import type { Channel } from '@/lib/types'

const BLOCKED =
  "That host doesn't let browsers on other sites read the playlist. Download the file and load it here, or set a proxy in Settings."

export function PlaylistDialog({
  open,
  onOpenChange,
  onLoaded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLoaded: (name: string, channels: Channel[]) => void
}) {
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setError(null)
    setBusy(true)
    try {
      const file = fileInput.current?.files?.[0]
      let text: string
      let name: string

      if (file) {
        text = await file.text()
        name = file.name.replace(/\.(m3u8?|txt)$/i, '')
      } else if (url.trim()) {
        const target = url.trim()
        const { proxy } = store.settings
        const res = await fetch(target).catch(() =>
          proxy ? fetch(proxy + encodeURIComponent(target)) : Promise.reject(new Error('blocked')),
        )
        if (!res.ok) throw new Error(`The server answered ${res.status}.`)
        text = await res.text()
        name = new URL(target).hostname
      } else {
        throw new Error('Choose a file, or paste a playlist URL.')
      }

      onLoaded(name || 'My playlist', parseM3U(text))
      setUrl('')
      if (fileInput.current) fileInput.current.value = ''
      onOpenChange(false)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'That playlist could not be read.'
      setError(message === 'blocked' ? BLOCKED : message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setError(null)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a playlist</DialogTitle>
          <DialogDescription>
            Load your own M3U lineup. It browses and plays like the public list, and it stays in
            this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="p-file">Playlist file</Label>
          <Input
            id="p-file"
            ref={fileInput}
            type="file"
            accept=".m3u,.m3u8,text/plain"
            onChange={() => setError(null)}
            className="file:text-foreground cursor-pointer file:mr-3 file:cursor-pointer"
          />
          <p className="text-muted-foreground text-xs">
            The reliable route — nothing has to be fetched across origins.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-muted-foreground text-xs">or</span>
          <Separator className="flex-1" />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="p-url">Playlist URL</Label>
          <Input
            id="p-url"
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setError(null)
            }}
            placeholder="https://example.com/playlist.m3u"
            autoComplete="off"
          />
          <p className="text-muted-foreground text-xs">
            Works when the host allows cross-origin reads, or through your proxy.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="text-destructive flex items-start gap-2 rounded-md border border-current/25 bg-current/5 p-2.5 text-xs leading-snug"
          >
            <AlertCircle className="mt-px size-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={load} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Load playlist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
