import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { CRAFT_ACTION_NAMES, FORMAT_VERSION, JOB_ID, projectMissionData } from './project.mjs'
import { HASH_PATTERN, sha256 } from './source.mjs'

export const GENERATOR = 'frozen-rabbit-expert-mission-data'
const GENERATED_FILE = /^(missions|NOTICE)\.[a-f0-9]{64}\.(bin|txt)$/

export function createPackages(snapshot, catalog) {
  const assets = new Map()
  const projected = projectMissionData({ ...catalog, sources: snapshot.sources })
  const json = Buffer.from(JSON.stringify(projected.bundle))
  const bytes = gzipSync(json, { level: 9 })
  const hash = sha256(bytes)
  const file = `missions.${hash}.bin`
  assets.set(file, bytes)
  const bundle = { file, sha256: hash, bytes: bytes.length, jsonBytes: json.length, encoding: 'gzip', records: projected.bundle.missions.length }
  const notice = Buffer.from([
    'Frozen Rabbit Expert mission catalog',
    `Teamcraft data: https://github.com/${snapshot.metadata.teamcraft.repository}/tree/${snapshot.metadata.teamcraft.commit}`,
    `Mission identity: https://github.com/${snapshot.metadata.missions.repository}/tree/${snapshot.metadata.missions.commit}`,
    `Japanese mission names: https://github.com/${snapshot.metadata.missionLocales.ja.repository}/tree/${snapshot.metadata.missionLocales.ja.commit}`,
    `Traditional Chinese mission names: https://github.com/${snapshot.metadata.missionLocales.tw.repository}/tree/${snapshot.metadata.missionLocales.tw.commit}`,
    `Simplified Chinese mission names: https://github.com/${snapshot.metadata.missionLocales.cn.repository}/tree/${snapshot.metadata.missionLocales.cn.commit}`,
    'Class/job, crafting-action and item icons: https://xivapi.com (loaded by URL; not repackaged).',
    'Modified: selected Cosmic Exploration missions, localized item names, icon references and gzip packaging.',
    'Game content and trademarks remain the property of their respective owners.',
    'FINAL FANTASY XIV © SQUARE ENIX',
    '',
    'Original Teamcraft license follows:',
    snapshot.sources.LICENSE.trim(),
    '',
  ].join('\n'))
  const noticeHash = sha256(notice)
  const noticeFile = `NOTICE.${noticeHash}.txt`
  assets.set(noticeFile, notice)
  const identity = {
    formatVersion: FORMAT_VERSION,
    sources: {
      teamcraft: snapshot.metadata.teamcraft,
      missions: snapshot.metadata.missions,
      missionLocales: snapshot.metadata.missionLocales,
      jobIcons: { provider: 'xivapi', baseUrl: 'https://xivapi.com/cj/1/' },
      actionIcons: {
        provider: 'xivapi',
        repository: snapshot.metadata.missions.repository,
        commit: snapshot.metadata.missions.commit,
        assetBaseUrl: 'https://v2.xivapi.com/api/asset',
      },
      catalog: { identity: catalog.source.catalogIdentitySha256, xivapiVersion: catalog.source.xivapiVersion },
    },
    bundle,
    notice: { file: noticeFile, sha256: noticeHash, bytes: notice.length },
  }
  return {
    manifest: { generator: GENERATOR, version: sha256(Buffer.from(JSON.stringify(identity))), ...identity, diagnostics: projected.diagnostics },
    assets,
  }
}

export async function verifyPackages(directory, suppliedManifest) {
  const manifest = suppliedManifest ?? JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'))
  const supportedFormat = manifest.formatVersion === FORMAT_VERSION
    || (suppliedManifest && [FORMAT_VERSION - 1, FORMAT_VERSION - 2].includes(manifest.formatVersion))
  if (manifest.generator !== GENERATOR || !supportedFormat || !HASH_PATTERN.test(manifest.version)) {
    throw new Error('unrecognized mission-data manifest')
  }
  const identity = { formatVersion: manifest.formatVersion, sources: manifest.sources, bundle: manifest.bundle, notice: manifest.notice }
  if (sha256(Buffer.from(JSON.stringify(identity))) !== manifest.version) throw new Error('manifest checksum mismatch')
  for (const descriptor of [manifest.bundle, manifest.notice]) {
    if (!descriptor || !HASH_PATTERN.test(descriptor.sha256)) throw new Error('invalid asset descriptor')
    const bytes = await readFile(path.join(directory, descriptor.file))
    if (bytes.length !== descriptor.bytes || sha256(bytes) !== descriptor.sha256) throw new Error(`asset checksum mismatch: ${descriptor.file}`)
  }
  const decoded = JSON.parse(gunzipSync(await readFile(path.join(directory, manifest.bundle.file))).toString('utf8'))
  if (decoded.formatVersion !== manifest.formatVersion || !Array.isArray(decoded.missions)
    || decoded.missions.length !== manifest.bundle.records) throw new Error('invalid mission bundle contents')
  if (manifest.formatVersion === FORMAT_VERSION) {
    const missionIds = new Set(decoded.missions.map(mission => mission.id))
    if (missionIds.size !== decoded.missions.length || decoded.missions.some(mission => (
      !Array.isArray(mission.items)
      || mission.items.length === 0
      || (mission.nextMissionId !== undefined && (
        !Number.isSafeInteger(mission.nextMissionId)
        || !missionIds.has(mission.nextMissionId)
        || mission.nextMissionId === mission.id
      ))
    ))) throw new Error('invalid mission progression')
    const validActionIcons = Object.keys(JOB_ID).every(job => (
      decoded.actionIcons?.[job]
      && Object.keys(CRAFT_ACTION_NAMES).every(action => (
        typeof decoded.actionIcons[job][action] === 'string'
        && decoded.actionIcons[job][action].startsWith('https://v2.xivapi.com/api/asset?')
      ))
    ))
    if (!validActionIcons) throw new Error('invalid crafting-action icons')
  }
  if (!suppliedManifest) {
    try { await verifyPackages(directory, JSON.parse(await readFile(path.join(directory, 'previous-manifest.json'), 'utf8'))) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return manifest
}

async function atomicWrite(target, bytes) {
  const temporary = `${target}.${randomUUID()}.tmp`
  try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, target) }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
}

export async function writePackages(outputDirectory, packages) {
  const directory = path.resolve(outputDirectory)
  await mkdir(directory, { recursive: true })
  const existing = await readdir(directory)
  if (existing.some(file => !['manifest.json', 'previous-manifest.json'].includes(file) && !GENERATED_FILE.test(file))) {
    throw new Error('output directory contains unrelated files')
  }
  const current = existing.includes('manifest.json')
    ? await verifyPackages(directory, JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')))
    : null
  let previous = existing.includes('previous-manifest.json')
    ? await verifyPackages(directory, JSON.parse(await readFile(path.join(directory, 'previous-manifest.json'), 'utf8')))
    : null
  for (const [file, bytes] of packages.assets) {
    if (!GENERATED_FILE.test(file)) throw new Error(`unsafe generated filename: ${file}`)
    try {
      const existingBytes = await readFile(path.join(directory, file))
      if (!existingBytes.equals(bytes)) throw new Error(`corrupted content-addressed asset: ${file}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      await atomicWrite(path.join(directory, file), bytes)
    }
  }
  await verifyPackages(directory, packages.manifest)
  if (current && current.version !== packages.manifest.version) {
    previous = current
    await atomicWrite(path.join(directory, 'previous-manifest.json'), `${JSON.stringify(current, null, 2)}\n`)
  }
  await atomicWrite(path.join(directory, 'manifest.json'), `${JSON.stringify(packages.manifest, null, 2)}\n`)
  const keep = new Set(['manifest.json', 'previous-manifest.json', ...packages.assets.keys()])
  if (previous) [previous.bundle, previous.notice].forEach(entry => keep.add(entry.file))
  for (const file of await readdir(directory)) if (GENERATED_FILE.test(file) && !keep.has(file)) await unlink(path.join(directory, file))
}
