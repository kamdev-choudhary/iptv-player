import { z } from 'zod'

/**
 * Keyset pagination. Offsets would be simpler, but `offset 9000` makes
 * Postgres walk nine thousand rows it then discards, and a catalog that
 * changes under a scrolling client silently skips and repeats rows. A cursor
 * carries the last row's sort position instead.
 */
const cursorSchema = z.object({
  /** The sort column's value on the last row returned. */
  v: z.number().int(),
  /** Name and id, the tie-breakers every sort order ends with. */
  n: z.string(),
  i: z.string(),
})

export type Cursor = z.infer<typeof cursorSchema>

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    )
    return parsed.success ? parsed.data : null
  } catch {
    // A cursor from an older build, or a hand-edited one: start over rather
    // than fail the request.
    return null
  }
}
