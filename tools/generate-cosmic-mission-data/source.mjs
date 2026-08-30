import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { inflateSync } from 'node:zlib'

export const TEAMCRAFT_REPOSITORY = 'ffxiv-teamcraft/ffxiv-teamcraft'
export const TEAMCRAFT_DATA_PATH = 'libs/data/src/lib/json'
export const DATAMINING_REPOSITORY = 'xivapi/ffxiv-datamining'
export const DATAMINING_TC_REPOSITORY = 'thewakingsands/ffxiv-datamining-tc'
export const DATAMINING_TC_COMMIT = 'e203c7e46dd80fd2a967e5741b30e3c9fad0c767'
export const DATAMINING_CN_REPOSITORY = 'thewakingsands/ffxiv-datamining-cn'
export const DATAMINING_CN_COMMIT = '991071b8fb6c56c00417ad60d72a4b1556e2ccff'
export const SOURCE_FILES = ['item-search.index', 'foods.json', 'medicines.json', 'LICENSE']
const MISSION_SOURCE_FILES = ['WKSMissionUnit.csv', 'WKSMissionLotterySpecialCond.csv']
export const SHA_PATTERN = /^[a-f0-9]{40}$/
export const HASH_PATTERN = /^[a-f0-9]{64}$/

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function decodeTeamcraft(file, bytes) {
  if (file === 'LICENSE') {
    const license = bytes.toString('utf8')
    if (!license.includes('MIT License') || !license.includes('Permission is hereby granted')) {
      throw new Error('Teamcraft LICENSE changed; review it before packaging.')
    }
    return license
  }
  const json = file.endsWith('.index')
    ? inflateSync(bytes, { maxOutputLength: 128 * 1024 * 1024 })
    : bytes
  const value = JSON.parse(json.toString('utf8'))
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${file}: expected a nonempty array`)
  return value
}

async function fetchBytes(url, token) {
  const headers = { 'User-Agent': 'FrozenRabbitExpert-mission-data-generator' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(45_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

async function resolveCommit(repository, ref, token) {
  if (SHA_PATTERN.test(ref)) return ref
  const bytes = await fetchBytes(
    `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`,
    token,
  )
  const commit = JSON.parse(bytes.toString('utf8')).sha
  if (!SHA_PATTERN.test(commit)) throw new Error(`GitHub did not resolve ${repository}@${ref} to a full commit`)
  return commit
}

async function verifiedFile(directory, file, descriptor) {
  if (!descriptor || !HASH_PATTERN.test(descriptor.sha256)) return null
  const bytes = await readFile(path.join(directory, file))
  if (bytes.length !== descriptor.bytes || sha256(bytes) !== descriptor.sha256) {
    throw new Error(`snapshot checksum mismatch: ${file}`)
  }
  return bytes
}

export async function readSnapshot(directory) {
  const metadata = JSON.parse(await readFile(path.join(directory, 'source.json'), 'utf8'))
  if (metadata.teamcraft?.repository !== TEAMCRAFT_REPOSITORY
    || !SHA_PATTERN.test(metadata.teamcraft?.commit)
    || metadata.missions?.repository !== DATAMINING_REPOSITORY
    || !SHA_PATTERN.test(metadata.missions?.commit)
    || metadata.missionLocales?.ja?.repository !== DATAMINING_REPOSITORY
    || metadata.missionLocales?.ja?.commit !== metadata.missions?.commit
    || metadata.missionLocales?.tw?.repository !== DATAMINING_TC_REPOSITORY
    || metadata.missionLocales?.tw?.commit !== DATAMINING_TC_COMMIT
    || metadata.missionLocales?.cn?.repository !== DATAMINING_CN_REPOSITORY
    || metadata.missionLocales?.cn?.commit !== DATAMINING_CN_COMMIT) {
    throw new Error('invalid mission-data source identity')
  }
  const sources = {}
  for (const file of SOURCE_FILES) {
    sources[file] = decodeTeamcraft(file, await verifiedFile(directory, file, metadata.files[file]))
  }
  sources.missionCsv = (await verifiedFile(directory, 'WKSMissionUnit.csv', metadata.files['WKSMissionUnit.csv'])).toString('utf8')
  sources.missionSpecialConditionCsv = (await verifiedFile(
    directory,
    'WKSMissionLotterySpecialCond.csv',
    metadata.files['WKSMissionLotterySpecialCond.csv'],
  )).toString('utf8')
  sources.missionLocaleCsv = {
    en: sources.missionCsv,
    ja: (await verifiedFile(directory, 'WKSMissionUnit.ja.csv', metadata.files['WKSMissionUnit.ja.csv'])).toString('utf8'),
    tw: (await verifiedFile(directory, 'WKSMissionUnit.tw.csv', metadata.files['WKSMissionUnit.tw.csv'])).toString('utf8'),
    cn: (await verifiedFile(directory, 'WKSMissionUnit.cn.csv', metadata.files['WKSMissionUnit.cn.csv'])).toString('utf8'),
  }
  return { metadata, sources, directory: path.resolve(directory) }
}

export async function downloadSnapshot({
  ref = 'staging', cacheRoot, missionRevision, token, log = console.log,
}) {
  if (!SHA_PATTERN.test(missionRevision)) throw new Error('catalog mission revision must be a full commit SHA')
  const commit = await resolveCommit(TEAMCRAFT_REPOSITORY, ref, token)
  const directory = path.resolve(cacheRoot, commit)
  await mkdir(directory, { recursive: true })
  let metadata
  try { metadata = JSON.parse(await readFile(path.join(directory, 'source.json'), 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  metadata ||= {
    teamcraft: { repository: TEAMCRAFT_REPOSITORY, commit },
    missions: { repository: DATAMINING_REPOSITORY, commit: missionRevision },
    files: {},
  }
  metadata.missionLocales ||= {
    ja: { repository: DATAMINING_REPOSITORY, commit: missionRevision },
    tw: { repository: DATAMINING_TC_REPOSITORY, commit: DATAMINING_TC_COMMIT },
    cn: { repository: DATAMINING_CN_REPOSITORY, commit: DATAMINING_CN_COMMIT },
  }
  if (metadata.teamcraft?.commit !== commit || metadata.missions?.commit !== missionRevision) throw new Error('snapshot identity mismatch')
  if (metadata.missionLocales.ja?.commit !== missionRevision
    || metadata.missionLocales.tw?.commit !== DATAMINING_TC_COMMIT
    || metadata.missionLocales.cn?.commit !== DATAMINING_CN_COMMIT) throw new Error('localized mission snapshot identity mismatch')

  const downloads = [
    ...SOURCE_FILES.map(file => ({
      file,
      url: `https://raw.githubusercontent.com/${TEAMCRAFT_REPOSITORY}/${commit}/${file === 'LICENSE' ? file : `${TEAMCRAFT_DATA_PATH}/${file}`}`,
    })),
    ...MISSION_SOURCE_FILES.map(file => ({
      file,
      url: `https://raw.githubusercontent.com/${DATAMINING_REPOSITORY}/${missionRevision}/csv/en/${file}`,
    })),
    {
      file: 'WKSMissionUnit.ja.csv',
      url: `https://raw.githubusercontent.com/${DATAMINING_REPOSITORY}/${missionRevision}/csv/ja/WKSMissionUnit.csv`,
    },
    {
      file: 'WKSMissionUnit.tw.csv',
      url: `https://raw.githubusercontent.com/${DATAMINING_TC_REPOSITORY}/${DATAMINING_TC_COMMIT}/WKSMissionUnit.csv`,
    },
    {
      file: 'WKSMissionUnit.cn.csv',
      url: `https://raw.githubusercontent.com/${DATAMINING_CN_REPOSITORY}/${DATAMINING_CN_COMMIT}/WKSMissionUnit.csv`,
    },
  ]
  for (const entry of downloads) {
    const descriptor = metadata.files[entry.file]
    if (descriptor) {
      await verifiedFile(directory, entry.file, descriptor)
      continue
    }
    const bytes = await fetchBytes(entry.url, token)
    if (SOURCE_FILES.includes(entry.file)) decodeTeamcraft(entry.file, bytes)
    if (entry.file === 'WKSMissionUnit.csv' && !bytes.toString('utf8', 0, 64).startsWith('#,Name,')) {
      throw new Error('unrecognized WKSMissionUnit.csv')
    }
    if (entry.file === 'WKSMissionLotterySpecialCond.csv'
      && !bytes.toString('utf8', 0, 64).startsWith('#,WeatherRequired,StartTimeHour,EndTimeHour')) {
      throw new Error('unrecognized WKSMissionLotterySpecialCond.csv')
    }
    if (entry.file.startsWith('WKSMissionUnit.')
      && !bytes.toString('utf8', 0, 64).replace(/^\uFEFF/, '').match(/^(#,Name|key,0),/)) {
      throw new Error(`unrecognized ${entry.file}`)
    }
    const target = path.join(directory, entry.file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes)
    metadata.files[entry.file] = { bytes: bytes.length, sha256: sha256(bytes) }
    log(`Downloaded ${entry.file}: ${bytes.length.toLocaleString('en-US')} bytes`)
  }
  await writeFile(path.join(directory, 'source.json'), `${JSON.stringify(metadata, null, 2)}\n`)
  return readSnapshot(directory)
}
