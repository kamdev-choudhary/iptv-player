import { useState } from 'react'
import {
  Button,
  Check,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  PanelSelect,
  Readout,
  Rule,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@tuner/ui'
import type { ChannelDetail } from '@tuner/shared'
import { prefs, type Persisted } from '@/lib/prefs.ts'
import { useJobRuns, usePatchSource, useProbe, useRunJob } from '@/api/hooks.ts'
import { latencyLabel } from '@/lib/signal.ts'

/**
 * Settings, and the operator's console.
 *
 * The second tab is the whole point of the move off a build-time catalog: a
 * stream address can be corrected here and takes effect on the next request.
 * It is gated on the admin token, which lives only in this browser — so an
 * ordinary viewer sees playback settings and nothing else.
 */

function PlaybackSettings({ settings }: { settings: Persisted }) {
  return (
    <div className="flex flex-col gap-4">
      <Check
        id="setting-auto-next"
        label="Move to the next source when one fails"
        checked={settings.autoNext}
        onChange={(autoNext) => prefs.set({ autoNext })}
      />
      <Check
        id="setting-auto-proxy"
        label="Retry through the server when a direct fetch fails"
        checked={settings.autoProxy}
        onChange={(autoProxy) => prefs.set({ autoProxy })}
      />
      <p className="max-w-[58ch] text-small text-muted-foreground">
        A browser cannot fetch a plain http stream from an https page, cannot read a server that
        refuses cross-origin requests, and cannot send the User-Agent some broadcasters insist on.
        Your server can do all three, so routing a failed source through it is usually what makes it
        play. Every byte then crosses your box, which is why it is a fallback rather than the
        default.
      </p>

      <Field
        label="Stream token"
        htmlFor="stream-token"
        hint="Only needed if this deployment sets STREAM_TOKEN."
      >
        <Input
          id="stream-token"
          type="password"
          autoComplete="off"
          value={settings.streamToken}
          onChange={(event) => prefs.set({ streamToken: event.target.value })}
          placeholder="Leave empty for an open player"
        />
      </Field>
    </div>
  )
}

/** Change a stream address and have it live immediately. */
function SourceEditor({ channel, token }: { channel: ChannelDetail; token: string }) {
  const [sourceId, setSourceId] = useState(channel.sources[0]?.id ?? 0)
  const source = channel.sources.find((s) => s.id === sourceId) ?? channel.sources[0]
  const [url, setUrl] = useState(source?.url ?? '')
  const [userAgent, setUserAgent] = useState('')
  const [referrer, setReferrer] = useState('')

  const probe = useProbe(token)
  const patch = usePatchSource(token)

  if (!source) {
    return <p className="text-small text-muted-foreground">This channel has no sources to edit.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label={`Source for ${channel.name}`} htmlFor="edit-source">
        <PanelSelect
          id="edit-source"
          value={String(source.id)}
          onValueChange={(value) => {
            const next = Number(value)
            setSourceId(next)
            setUrl(channel.sources.find((s) => s.id === next)?.url ?? '')
          }}
          options={channel.sources.map((s, index) => ({
            value: String(s.id),
            label: `${index + 1}. ${s.feed ?? s.url.slice(0, 48)}${
              s.play === 'proxy' ? ' (server)' : ''
            }`,
          }))}
        />
      </Field>

      <Field label="Stream address" htmlFor="edit-url">
        <Input
          id="edit-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          spellCheck={false}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="User-Agent" htmlFor="edit-ua" hint="Sent by the server, not the browser.">
          <Input
            id="edit-ua"
            value={userAgent}
            onChange={(event) => setUserAgent(event.target.value)}
            placeholder="Leave empty to keep"
          />
        </Field>
        <Field label="Referer" htmlFor="edit-referer">
          <Input
            id="edit-referer"
            value={referrer}
            onChange={(event) => setReferrer(event.target.value)}
            placeholder="Leave empty to keep"
          />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="panel"
          size="sm"
          disabled={!url || probe.isPending}
          onClick={() =>
            probe.mutate({ url, userAgent: userAgent || null, referrer: referrer || null })
          }
        >
          {probe.isPending ? 'Checking' : 'Check address'}
        </Button>
        <Button
          size="sm"
          disabled={!url || patch.isPending}
          onClick={() =>
            patch.mutate({
              id: source.id,
              patch: {
                url,
                ...(userAgent ? { userAgent } : {}),
                ...(referrer ? { referrer } : {}),
              },
            })
          }
        >
          {patch.isPending ? 'Saving' : 'Save address'}
        </Button>
      </div>

      {probe.data ? (
        <p className="text-small">
          <span className={probe.data.ok ? 'text-live' : 'text-fault'}>
            {probe.data.ok ? 'Reached it' : `Failed: ${probe.data.reason}`}
          </span>
          <span className="text-muted-foreground">
            {' — '}
            {probe.data.height ? `${probe.data.height}p, ` : ''}
            {latencyLabel(probe.data.latencyMs)}
            {probe.data.cors === false ? ', needs the server to play in a browser' : ''}
            {probe.data.variants.length ? `, ${probe.data.variants.length} renditions` : ''}
          </span>
        </p>
      ) : null}

      {probe.error ? <p className="text-small text-fault">{probe.error.message}</p> : null}
      {patch.error ? <p className="text-small text-fault">{patch.error.message}</p> : null}
      {patch.isSuccess ? (
        <p className="text-small text-live">Saved. The next request serves the new address.</p>
      ) : null}
    </div>
  )
}

function JobsPanel({ token }: { token: string }) {
  const runs = useJobRuns(token)
  const run = useRunJob(token)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="panel"
          size="sm"
          disabled={run.isPending}
          onClick={() => run.mutate('sync')}
        >
          Pull from iptv-org
        </Button>
        <Button
          variant="panel"
          size="sm"
          disabled={run.isPending}
          onClick={() => run.mutate('health')}
        >
          Probe stale sources
        </Button>
      </div>
      <p className="max-w-[58ch] text-small text-muted-foreground">
        A pull rewrites only what it owns. Anything you have edited here is left alone, so a
        corrected address survives tonight&rsquo;s run.
      </p>

      {run.error ? <p className="text-small text-fault">{run.error.message}</p> : null}

      <Rule>Recent runs</Rule>
      {runs.data?.items.length ? (
        <ul className="flex flex-col">
          {runs.data.items.slice(0, 6).map((item) => (
            <li key={item.id} className="flex items-baseline gap-2 border-b py-2 last:border-b-0">
              <span className="w-14 text-small">{item.job}</span>
              <span
                className={
                  item.status === 'ok'
                    ? 'text-small text-live'
                    : item.status === 'failed'
                      ? 'text-small text-fault'
                      : 'text-small text-hold'
                }
              >
                {item.status}
              </span>
              <Readout
                className="ml-auto"
                value={new Intl.DateTimeFormat(undefined, {
                  timeStyle: 'short',
                  dateStyle: 'short',
                }).format(new Date(item.startedAt))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted-foreground">
          {runs.error ? runs.error.message : 'No runs recorded yet.'}
        </p>
      )}
    </div>
  )
}

export function SettingsDialog({
  open,
  onClose,
  settings,
  channel,
}: {
  open: boolean
  onClose: () => void
  settings: Persisted
  channel: ChannelDetail | null
}) {
  const token = settings.adminToken

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Stored in this browser only.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="playback">
          <TabsList>
            <TabsTrigger value="playback">Playback</TabsTrigger>
            <TabsTrigger value="operate">Operate</TabsTrigger>
          </TabsList>

          <TabsContent value="playback" className="pt-4">
            <PlaybackSettings settings={settings} />
          </TabsContent>

          <TabsContent
            value="operate"
            className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pt-4"
          >
            <Field
              label="Admin token"
              htmlFor="admin-token"
              hint="The ADMIN_TOKEN from your server's .env. Without it this tab stays locked."
            >
              <Input
                id="admin-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => prefs.set({ adminToken: event.target.value })}
                placeholder="Paste to unlock"
              />
            </Field>

            {token ? (
              <>
                <Rule>Fix a stream address</Rule>
                {channel ? (
                  <SourceEditor channel={channel} token={token} />
                ) : (
                  <p className="text-small text-muted-foreground">
                    Pick a channel first, then come back here to edit its sources.
                  </p>
                )}

                <Rule>Jobs</Rule>
                <JobsPanel token={token} />
              </>
            ) : null}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              prefs.clear()
              onClose()
            }}
          >
            Clear everything
          </Button>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
