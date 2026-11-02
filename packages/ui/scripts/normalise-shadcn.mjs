#!/usr/bin/env node
/**
 * Rewrites the `@/` imports the shadcn CLI emits into relative ones.
 *
 * This package ships TypeScript source rather than a bundle, so a consuming
 * app resolves these imports with *its* alias table — where `@/` points at the
 * app's own `src`. The CLI has no way to know that, and it also resolves
 * `@/lib/utils` to an unrelated npm package called `cn`. Run this after every
 * `shadcn add`.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'

const DIR = new URL('../src/components/ui/', import.meta.url)

const REWRITES = [
  [/from ["']cn["']/g, `from "../../lib/utils.ts"`],
  [/from ["']@\/lib\/utils["']/g, `from "../../lib/utils.ts"`],
  [/from ["']@\/components\/ui\/([a-z-]+)["']/g, `from "./$1.tsx"`],
]

let changed = 0
for (const name of await readdir(DIR)) {
  if (!name.endsWith('.tsx')) continue
  const file = new URL(name, DIR)
  const before = await readFile(file, 'utf8')
  const after = REWRITES.reduce((text, [find, put]) => text.replace(find, put), before)
  if (after !== before) {
    await writeFile(file, after)
    console.log(`  rewrote ${name}`)
    changed++
  }
}

console.log(changed ? `normalised ${changed} file(s)` : 'nothing to normalise')
