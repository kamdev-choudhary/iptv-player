import { useState } from 'react'
import { Button, Check, Dialog, Field, Input, Readout, Rule } from '@tuner/ui'
import type { ChannelDetail } from '@tuner/shared'
import { prefs, type Prefs } from '@/lib/prefs.ts'
import { useJobRuns, usePatchSource, useProbe, useRunJob } from '@/api/hooks.ts'
import { latencyLabel } from '@/lib/signal.ts'

/**
 * Settings, and the operator's console.
 *
 * The second half is the whole point of the move off a build-time catalog: a
 * stream address can be corrected here and takes effect on the next request.
 * It is gated on the admin token, which lives only in this browser — so an
 * ordinary viewer sees settings and nothing else.
 */

function PlaybackSettings({ settings }: { settings: Prefs }) {
  return (
    <div className="flex flex-col gap-3">
      <Check
        label="Move to the next source when one fails"
        checked={settings.autoNext}
        onChange={(autoNext) => prefs.set({ autoNext })}
      />
      <Check
        label="Retry through the server when a direct fetch fails"
        checked={settings.autoProxy}
        onChange={(autoProxy) => prefs.set({ autoProxy })}
      />
      <p className="max-w-[56ch] text-micro text-muted-foreground">
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
          onChange={(e) => prefs.set({ streamToken: e.target.value })}
          placeholder="Leave empty for an open player"
        />
      </Field>
    </div>
  )
}

/** Change a stream address and have it live immediately. */
function SourceEditor({ channel, token }: { channel: ChannelDetail; token: string }) {
  const [sourceId, setSourceId] = useState<number | null>(channel.sources[0]?.id ?? null)
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
    <div className="flex flex-col gap-3">
      <Field label={`Source for ${channel.name}`} htmlFor="edit-source">
        <select
          id="edit-source"
          value={String(source.id)}
          onChange={(e) => {
            const next = Number(e.target.value)
            setSourceId(next)
            setUrl(channel.sources.find((s) => s.id === next)?.url ?? '')
          }}
          className="h-8 w-full rounded-md border  bg-card px-2 text-small"
        >
          {channel.sources.map((s, i) => (
            <option key={s.id} value={String(s.id)}>
              {i + 1}. {new URL(s.url).hostname} {s.play === 'proxy' ? '(server)' : ''}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Stream address" htmlFor="edit-url">
        <Input
          id="edit-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="User-Agent" htmlFor="edit-ua" hint="Sent by the server, not the browser.">
          <Input
            id="edit-ua"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
            placeholder="Leave empty to keep"
          />
        </Field>
        <Field label="Referer" htmlFor="edit-referer">
          <Input
            id="edit-referer"
            value={referrer}
            onChange={(e) => setReferrer(e.target.value)}
            placeholder="Leave empty to keep"
          />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!url || probe.isPending}
          onClick={() =>
            probe.mutate({
              url,
              userAgent: userAgent || null,
              referrer: referrer || null,
            })
          }
        >
          {probe.isPending ? 'Checking' : 'Check address'}
        </Button>
        <Button
          variant="primary"
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
            {'—'}
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
      <div className="flex gap-2">
        <Button size="sm" disabled={run.isPending} onClick={() => run.mutate('sync')}>
          Pull from iptv-org
        </Button>
        <Button size="sm" disabled={run.isPending} onClick={() => run.mutate('health')}>
          Probe stale sources
        </Button>
      </div>
      <p className="max-w-[56ch] text-micro text-muted-foreground">
        A pull rewrites only what it owns. Anything you have edited here is left alone, so a
        corrected address survives tonight&rsquo;s run.
      </p>

      {run.error ? <p className="text-small text-fault">{run.error.message}</p> : null}

      <Rule>Recent runs</Rule>
      {runs.data?.items.length ? (
        <ul className="flex flex-col">
          {runs.data.items.slice(0, 8).map((item) => (
            <li
              key={item.id}
              className="flex items-baseline gap-2 border-b  py-1.5 text-micro last:border-b-0"
            >
              <span className="w-14 text-foreground">{item.job}</span>
              <span
                className={
                  item.status === 'ok'
                    ? 'text-live'
                    : item.status === 'failed'
                      ? 'text-fault'
                      : 'text-hold'
                }
              >
                {item.status}
              </span>
              <span className="tabular ml-auto text-muted-foreground">
                {new Intl.DateTimeFormat(undefined, {
                  timeStyle: 'short',
                  dateStyle: 'short',
                }).format(new Date(item.startedAt))}
              </span>
              {item.stats ? (
                <Readout
                  value={Object.entries(item.stats)
                    .slice(0, 3)
                    .map(([k, v]) => `${k} ${v}`)
                    .join('')}
                />
              ) : null}
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
  settings: Prefs
  channel: ChannelDetail | null
}) {
  const [tab, setTab] = useState<'playback' | 'operate'>('playback')
  const token = settings.adminToken

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      description="Stored in this browser only."
      width="lg"
      footer={
        <>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              prefs.clear()
              onClose()
            }}
          >
            Clear everything
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <nav className="mb-4 flex gap-1" aria-label="Settings sections">
        <Button
          size="sm"
          variant={tab === 'playback' ? 'primary' : 'ghost'}
          onClick={() => setTab('playback')}
          aria-pressed={tab === 'playback'}
        >
          Playback
        </Button>
        <Button
          size="sm"
          variant={tab === 'operate' ? 'primary' : 'ghost'}
          onClick={() => setTab('operate')}
          aria-pressed={tab === 'operate'}
        >
          Operate
        </Button>
      </nav>

      {tab === 'playback' ? (
        <PlaybackSettings settings={settings} />
      ) : (
        <div className="flex flex-col gap-4">
          <Field
            label="Admin token"
            htmlFor="admin-token"
            hint="The ADMIN_TOKEN from your server's .env. Without it this section is read-only."
          >
            <Input
              id="admin-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => prefs.set({ adminToken: e.target.value })}
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
                  Tune a channel first, then come back here to edit its sources.
                </p>
              )}

              <Rule>Jobs</Rule>
              <JobsPanel token={token} />
            </>
          ) : null}
        </div>
      )}
    </Dialog>
  )
}
