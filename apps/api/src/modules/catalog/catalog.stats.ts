import { sql } from 'kysely'
import { db } from '../../core/db/index.ts'

/** Failures after which a source is treated as written off rather than flaky. */
export const DEAD_AFTER_FAILURES = 3

/**
 * Recomputes the denormalised per-channel counts.
 *
 * Run after a sync, after a probe sweep and after an admin write. The
 * `is distinct from` guard means an unchanged channel is not rewritten, which
 * keeps `updated_at` meaningful and the sort indexes from churning over rows
 * nothing happened to.
 */
export async function refreshChannelStats(channelIds?: readonly string[]) {
  const scope = channelIds?.length ? sql`where c.id = any(${sql.val(channelIds)}::text[])` : sql``

  const result = await sql<{ id: string }>`
    with agg as (
      select
        c.id,
        count(s.id)::int as total,
        count(s.id) filter (where h.ok is true)::int as live,
        count(s.id) filter (
          where not s.is_dash
            and (h.source_id is null or h.ok or h.failures < ${DEAD_AFTER_FAILURES})
        )::int as playable,
        coalesce(max(greatest(coalesce(h.height, 0), coalesce(s.height, 0))), 0)::int as best
      from channels c
      left join sources s on s.channel_id = c.id and s.enabled
      left join source_health h on h.source_id = s.id
      ${scope}
      group by c.id
    )
    update channels c
    set source_count = agg.total,
        live_count = agg.live,
        playable_count = agg.playable,
        best_height = agg.best
    from agg
    where agg.id = c.id
      and (c.source_count, c.live_count, c.playable_count, c.best_height)
          is distinct from (agg.total, agg.live, agg.playable, agg.best)
    returning c.id
  `.execute(db)

  return result.rows.length
}

/**
 * The folded haystack the trigram index covers. Country and category names are
 * resolved in so that "india" and "news" find channels whose own name says
 * neither.
 */
export async function refreshSearchText(channelIds?: readonly string[]) {
  const scope = channelIds?.length ? sql`and c.id = any(${sql.val(channelIds)}::text[])` : sql``

  await sql`
    update channels c
    set search_text = lower(
      concat_ws(' ',
        c.name,
        array_to_string(c.alt_names, ' '),
        (select l.name from lookups l where l.kind = 'country' and l.code = c.country),
        (select string_agg(l.name, ' ') from lookups l
          where l.kind = 'category' and l.code = any(c.categories)),
        (select string_agg(l.name, ' ') from lookups l
          where l.kind = 'language' and l.code = any(c.languages))
      )
    )
    where true ${scope}
      and c.search_text is distinct from lower(
        concat_ws(' ',
          c.name,
          array_to_string(c.alt_names, ' '),
          (select l.name from lookups l where l.kind = 'country' and l.code = c.country),
          (select string_agg(l.name, ' ') from lookups l
            where l.kind = 'category' and l.code = any(c.categories)),
          (select string_agg(l.name, ' ') from lookups l
            where l.kind = 'language' and l.code = any(c.languages))
        )
      )
  `.execute(db)
}
