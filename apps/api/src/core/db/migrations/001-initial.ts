import { sql, type Kysely } from 'kysely'

/**
 * The catalog, as runtime data rather than a build artifact.
 *
 * Two columns carry most of the design: `origin` records who put a row here,
 * and `locked` records that an operator has touched it. Upstream sync rewrites
 * only unlocked rows it owns, which is what lets a hand-corrected stream
 * address survive the next nightly pull.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Trigram search over channel names. Cheaper than a tsvector here: the
  // haystack is short, and callers want substring and fuzzy matches.
  await sql`create extension if not exists pg_trgm`.execute(db)

  await sql`
    create or replace function touch_updated_at() returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$ language plpgsql
  `.execute(db)

  await db.schema
    .createTable('channels')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('alt_names', sql`text[]`, (c) => c.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('country', sql`char(2)`)
    .addColumn('categories', sql`text[]`, (c) => c.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('languages', sql`text[]`, (c) => c.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('logo', 'text')
    .addColumn('website', 'text')
    .addColumn('origin', 'text', (c) => c.notNull().defaultTo('iptv-org'))
    .addColumn('hidden', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('retired', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('unmatched', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('search_text', 'text', (c) => c.notNull().defaultTo(''))
    // Denormalised counts, recomputed after every sync and probe sweep. The
    // lineup sorts and pages on these, and keyset pagination over an
    // aggregate computed per request would mean a full scan each page.
    .addColumn('source_count', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('live_count', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('playable_count', 'integer', (c) => c.notNull().defaultTo(0))
    // 0 means unknown. Kept non-null so `best_height desc, name, id`
    // matches the index without a coalesce the planner would ignore.
    .addColumn('best_height', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('locked', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('channels_origin_known', sql`origin in ('iptv-org', 'manual', 'm3u')`)
    .execute()

  await db.schema
    .createTable('sources')
    .addColumn('id', 'serial', (c) => c.primaryKey())
    .addColumn('channel_id', 'text', (c) =>
      c.notNull().references('channels.id').onDelete('cascade'),
    )
    .addColumn('url', 'text', (c) => c.notNull())
    // Signed CDN URLs run long enough that (channel_id, url) overflows a btree
    // index tuple, so uniqueness is enforced on a digest instead. Generated and
    // stored, so it cannot drift from the URL it describes.
    .addColumn('url_key', 'text', (c) =>
      c
        .notNull()
        .generatedAlwaysAs(sql`md5(url)`)
        .stored(),
    )
    .addColumn('quality', 'text')
    .addColumn('height', 'integer')
    .addColumn('feed', 'text')
    .addColumn('labels', sql`text[]`, (c) => c.notNull().defaultTo(sql`'{}'::text[]`))
    .addColumn('user_agent', 'text')
    .addColumn('referrer', 'text')
    .addColumn('insecure', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('needs_headers', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('is_dash', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('origin', 'text', (c) => c.notNull().defaultTo('iptv-org'))
    .addColumn('enabled', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('locked', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('sources_channel_url_key', ['channel_id', 'url_key'])
    .addCheckConstraint('sources_origin_known', sql`origin in ('iptv-org', 'manual', 'm3u')`)
    .execute()

  await db.schema
    .createTable('source_health')
    .addColumn('source_id', 'integer', (c) =>
      c.primaryKey().references('sources.id').onDelete('cascade'),
    )
    .addColumn('checked_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('ok', 'boolean', (c) => c.notNull())
    .addColumn('reason', 'text', (c) => c.notNull())
    .addColumn('status', 'integer')
    .addColumn('latency_ms', 'integer')
    .addColumn('height', 'integer')
    .addColumn('cors', 'boolean')
    .addColumn('failures', 'integer', (c) => c.notNull().defaultTo(0))
    .execute()

  await db.schema
    .createTable('lookups')
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('code', 'text', (c) => c.notNull())
    .addColumn('name', 'text', (c) => c.notNull())
    .addColumn('extra', 'text')
    .addPrimaryKeyConstraint('lookups_pkey', ['kind', 'code'])
    .addCheckConstraint('lookups_kind_known', sql`kind in ('country', 'category', 'language')`)
    .execute()

  await db.schema
    .createTable('job_runs')
    .addColumn('id', 'serial', (c) => c.primaryKey())
    .addColumn('job', 'text', (c) => c.notNull())
    .addColumn('status', 'text', (c) => c.notNull())
    .addColumn('started_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn('finished_at', 'timestamptz')
    .addColumn('stats', 'jsonb')
    .addColumn('error', 'text')
    .addCheckConstraint('job_runs_status_known', sql`status in ('running', 'ok', 'failed')`)
    .execute()

  // The lineup is always filtered to visible channels, so every index is partial.
  const visible = sql`not hidden and not retired`
  await sql`create index channels_name_idx on channels (name, id) where ${visible}`.execute(db)
  await sql`create index channels_country_idx on channels (country) where ${visible}`.execute(db)
  await sql`create index channels_categories_idx on channels using gin (categories)`.execute(db)
  await sql`create index channels_languages_idx on channels using gin (languages)`.execute(db)
  await sql`create index channels_search_idx on channels using gin (search_text gin_trgm_ops)`.execute(
    db,
  )
  await sql`create index channels_updated_idx on channels (updated_at desc)`.execute(db)
  // One index per sort order, each matching the cursor's tie-breakers exactly.
  await sql`
    create index channels_quality_idx
    on channels (best_height desc, name, id) where ${visible}
  `.execute(db)
  await sql`
    create index channels_sources_idx
    on channels (source_count desc, name, id) where ${visible}
  `.execute(db)
  await sql`
    create index channels_live_idx
    on channels (live_count desc, name, id) where ${visible}
  `.execute(db)

  await sql`create index sources_channel_idx on sources (channel_id) where enabled`.execute(db)
  await sql`create index sources_origin_idx on sources (origin, enabled)`.execute(db)
  // The health sweep asks for the least recently checked rows; this orders them.
  await sql`create index source_health_stale_idx on source_health (checked_at asc)`.execute(db)
  await sql`create index source_health_ok_idx on source_health (ok) where ok`.execute(db)
  await sql`create index job_runs_recent_idx on job_runs (job, started_at desc)`.execute(db)

  for (const table of ['channels', 'sources']) {
    await sql`
      create trigger ${sql.raw(table)}_touch before update on ${sql.raw(table)}
      for each row execute function touch_updated_at()
    `.execute(db)
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('job_runs').ifExists().execute()
  await db.schema.dropTable('source_health').ifExists().execute()
  await db.schema.dropTable('sources').ifExists().execute()
  await db.schema.dropTable('channels').ifExists().execute()
  await db.schema.dropTable('lookups').ifExists().execute()
  await sql`drop function if exists touch_updated_at()`.execute(db)
}
