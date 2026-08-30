import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createPackages, verifyPackages, writePackages } from './package.mjs'
import { downloadSnapshot, readSnapshot } from './source.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CATALOG_PATH = path.join(ROOT, 'packages/data/src/generated/cosmicExpertRecipes.generated.ts')

function parseCatalog(text) {
  const sourceMatch = text.match(/COSMIC_EXPERT_GENERATED_SOURCE = (\{[\s\S]*?\}) as const/)
  const recipesMatch = text.match(/GENERATED_COSMIC_EXPERT_RECIPES = (\[[\s\S]*\]) as const/)
  if (!sourceMatch || !recipesMatch) throw new Error('unrecognized generated Cosmic catalog module')
  return { source: JSON.parse(sourceMatch[1]), recipes: JSON.parse(recipesMatch[1]) }
}

function summary(manifest) {
  console.log(`Data version: ${manifest.version}`)
  console.log(`Teamcraft source: ${manifest.sources.teamcraft.commit}`)
  console.log(`Missions: ${manifest.bundle.records}; gzip ${(manifest.bundle.bytes / 1000).toFixed(1)} KB`)
  console.log(`Teamcraft item names: ${manifest.diagnostics.teamcraftItems}; canonical fallbacks: ${manifest.diagnostics.canonicalFallbackItems}`)
  console.log(`Crafting consumables: ${manifest.diagnostics.craftingFoods} foods; ${manifest.diagnostics.craftingMedicines} medicines`)
  console.log(`Mission names: ${Object.entries(manifest.diagnostics.missionLocaleNames).map(([locale, count]) => `${locale} ${count}`).join('; ')}`)
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    ref: { type: 'string' }, output: { type: 'string' }, 'source-dir': { type: 'string' },
    verify: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } })
  if (values.ref && values['source-dir']) throw new Error('use either --ref or --source-dir')
  if (values.verify && (values.ref || values['source-dir'])) throw new Error('--verify is offline and takes no source')
  if (values.help) {
    console.log(`Usage: npm run data:generate:missions -- [options]
  --ref <branch-or-commit> Teamcraft ref; defaults to staging and resolves to a full SHA.
  --source-dir <directory> Rebuild from a verified local snapshot.
  --output <directory> Dedicated output; defaults to apps/web/public/mission-data.
  --verify Verify the current manifest, hashes and gzip bundle offline.`)
    return
  }
  const output = values.output ? path.resolve(values.output) : path.join(ROOT, 'apps/web/public/mission-data')
  if (values.verify) {
    const manifest = await verifyPackages(output)
    summary(manifest)
    console.log('Package verification passed.')
    return
  }
  const catalog = parseCatalog(await readFile(CATALOG_PATH, 'utf8'))
  const snapshot = values['source-dir']
    ? await readSnapshot(path.resolve(values['source-dir']))
    : await downloadSnapshot({
        ref: values.ref ?? 'staging',
        cacheRoot: path.join(ROOT, '.cache/mission-data'),
        missionRevision: catalog.source.wksMissionUnitRevision,
        token: process.env.GITHUB_TOKEN,
      })
  const packages = createPackages(snapshot, catalog)
  await writePackages(output, packages)
  summary(packages.manifest)
  console.log(`Written and verified: ${output}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`[mission-data] ${error.message}`); process.exitCode = 1 })
}
