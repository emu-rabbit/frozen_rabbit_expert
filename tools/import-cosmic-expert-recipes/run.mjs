import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUTPUT_PATH = resolve(
  REPOSITORY_ROOT,
  'packages/data/src/generated/cosmicExpertRecipes.generated.ts',
)

const GITHUB_API = 'https://api.github.com'
const DATAMINING_REPOSITORY = 'xivapi/ffxiv-datamining'
const WKS_MISSION_RECIPE_PATH = 'csv/en/WKSMissionRecipe.csv'
const WKS_MISSION_UNIT_PATH = 'csv/en/WKSMissionUnit.csv'
const XIVAPI_SEARCH = 'https://v2.xivapi.com/api/search'
const USER_AGENT = 'FrozenRabbitExpert-CatalogImporter/0.1'

// Updating to a new game-data version is an explicit evidence change. Unknown
// versions/schemas fail closed instead of silently retaining the previous
// patch label or accepting a partial cross-source snapshot.
const SNAPSHOT_CONTRACT_BY_XIVAPI_VERSION = Object.freeze({
  '284bb7f44b9c0976': Object.freeze({
    schema: 'exdschema@2:rev:83e965d091116f895d5b17573cc5d12909a5f407',
    patch: '7.55',
    cosmicExpertRecipeCount: 432,
  }),
})

const WKS_MISSION_RECIPE_HEADERS = [
  '#',
  'Recipe[0]',
  'Recipe[1]',
  'Recipe[2]',
  'Recipe[3]',
  'Recipe[4]',
  'Unknown0',
]

const WKS_MISSION_UNIT_HEADERS = [
  '#',
  'Name',
  'SilverStarRequirement',
  'GoldStarRequirement',
  'WKSMissionText',
  'ClassJobCategory[0]',
  'ClassJobCategory[1]',
  'Unknown1',
  'MissionTime',
  'MissionReward',
  'MissionToDo[0]',
  'MissionToDo[1]',
  'MissionToDo[2]',
  'LockedBehind',
  'WKSMissionSupplyItem',
  'WKSMissionRecipe',
  'PlaceName',
  'SortKey',
  'WKSFunction',
  'LevelGroup',
  'MissionLotteryCond',
  'WKSMissionLotterySpecialCond',
  'IsSynced',
  'IsSpecialQuest',
  'Unknown2',
]

const RECIPE_FIELDS = [
  'IsExpert',
  'RequiredQuality',
  'ItemResult.Name',
  'ItemResult.Icon',
  'ItemResult.IsCollectable',
  'ItemResult.CanBeHq',
  'RecipeLevelTable.ClassJobLevel',
  'RecipeLevelTable.ConditionsFlag',
  'RecipeLevelTable.Difficulty',
  'RecipeLevelTable.Durability',
  'RecipeLevelTable.Quality',
  'RecipeLevelTable.ProgressDivider',
  'RecipeLevelTable.ProgressModifier',
  'RecipeLevelTable.QualityDivider',
  'RecipeLevelTable.QualityModifier',
  'RecipeLevelTable.SuggestedCraftsmanship',
  'CraftType.Name',
  'DifficultyFactor',
  'DurabilityFactor',
  'QualityFactor',
  'RequiredCraftsmanship',
  'RequiredControl',
].join(',')

const JOB_BY_CRAFT_TYPE = Object.freeze({
  Woodworking: 'carpenter',
  Smithing: 'blacksmith',
  Armorcraft: 'armorer',
  Goldsmithing: 'goldsmith',
  Leatherworking: 'leatherworker',
  Clothcraft: 'weaver',
  Alchemy: 'alchemist',
  Cooking: 'culinarian',
})

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`)
  return response.text()
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`)
  return response.json()
}

async function latestPathRevision(path) {
  const url = new URL(`/repos/${DATAMINING_REPOSITORY}/commits`, GITHUB_API)
  url.searchParams.set('path', path)
  url.searchParams.set('per_page', '1')
  const commits = await fetchJson(url)
  const sha = commits[0]?.sha
  const committedAt = commits[0]?.commit?.committer?.date
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error(`could not resolve a pinned ${path} revision`)
  }
  if (typeof committedAt !== 'string' || Number.isNaN(Date.parse(committedAt))) {
    throw new Error(`could not resolve ${path} commit date`)
  }
  return { sha, committedAt }
}

function parseCsvLine(line, label, lineNumber) {
  const columns = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      columns.push(value)
      value = ''
    } else {
      value += character
    }
  }
  if (quoted) throw new Error(`${label} line ${lineNumber} has an unterminated quoted field`)
  columns.push(value)
  return columns
}

function parseCsv(csv, label) {
  const lines = csv.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/)
  if (lines.length === 0 || lines[0].length === 0) throw new Error(`${label} is empty`)
  return lines.map((line, index) => parseCsvLine(line, label, index + 1))
}

function assertExactHeader(actual, expected, label) {
  if (
    actual.length !== expected.length
    || actual.some((column, index) => column !== expected[index])
  ) {
    throw new Error(`unexpected ${label} schema: ${actual.join(',')}`)
  }
}

function missionMemberships(csv) {
  const rows = parseCsv(csv, 'WKSMissionRecipe.csv')
  const header = rows.shift() ?? []
  assertExactHeader(header, WKS_MISSION_RECIPE_HEADERS, 'WKSMissionRecipe.csv')
  const recipeIndexes = header
    .map((column, index) => (/^Recipe\[\d+\]$/.test(column) ? index : -1))
    .filter((index) => index >= 0)

  const memberships = new Map()
  for (const columns of rows) {
    if (columns.length !== header.length) throw new Error('WKSMissionRecipe.csv row width mismatch')
    const missionId = Number(columns[0])
    if (!Number.isSafeInteger(missionId)) throw new Error(`invalid WKS mission id: ${columns[0]}`)
    for (const index of recipeIndexes) {
      const recipeId = Number(columns[index])
      if (recipeId === 0) continue
      if (!Number.isSafeInteger(recipeId) || recipeId < 0) {
        throw new Error(`invalid recipe id in WKS mission ${missionId}: ${columns[index]}`)
      }
      const missionIds = memberships.get(recipeId) ?? []
      missionIds.push(missionId)
      memberships.set(recipeId, missionIds)
    }
  }
  return memberships
}

function normalizeMissionName(value) {
  return value.replace(/[\uE000-\uF8FF]/g, '').trim()
}

function missionNamesByRecipeRowId(csv) {
  const rows = parseCsv(csv, 'WKSMissionUnit.csv')
  const header = rows.shift() ?? []
  assertExactHeader(header, WKS_MISSION_UNIT_HEADERS, 'WKSMissionUnit.csv')
  const unitIdIndex = header.indexOf('#')
  const nameIndex = header.indexOf('Name')
  const missionRecipeIndex = header.indexOf('WKSMissionRecipe')
  const identities = new Map()
  const unitIds = new Set()

  for (const columns of rows) {
    if (columns.length !== header.length) throw new Error('WKSMissionUnit.csv row width mismatch')
    const unitId = Number(columns[unitIdIndex])
    const missionRecipeId = Number(columns[missionRecipeIndex])
    if (!Number.isSafeInteger(unitId) || unitId < 0) {
      throw new Error(`invalid WKS mission unit id: ${columns[unitIdIndex]}`)
    }
    if (unitIds.has(unitId)) throw new Error(`duplicate WKS mission unit id: ${unitId}`)
    unitIds.add(unitId)
    if (!Number.isSafeInteger(missionRecipeId) || missionRecipeId < 0) {
      throw new Error(`invalid WKSMissionRecipe reference in mission unit ${unitId}`)
    }
    if (missionRecipeId === 0) continue
    const nameEn = normalizeMissionName(columns[nameIndex])
    if (nameEn.length === 0) {
      throw new Error(`WKS mission unit ${unitId} references recipe row ${missionRecipeId} without a display name`)
    }
    const entries = identities.get(missionRecipeId) ?? []
    entries.push({ unitId, nameEn })
    identities.set(missionRecipeId, entries)
  }
  return identities
}

async function fetchExpertLevel100Recipes() {
  const rows = []
  let cursor = null
  let schema = null
  let version = null

  do {
    const url = new URL(XIVAPI_SEARCH)
    url.searchParams.set('sheets', 'Recipe')
    url.searchParams.set('query', '+IsExpert=true +RecipeLevelTable.ClassJobLevel=100')
    url.searchParams.set('fields', RECIPE_FIELDS)
    url.searchParams.set('limit', '100')
    if (cursor !== null) url.searchParams.set('cursor', cursor)

    const page = await fetchJson(url)
    if (!Array.isArray(page.results)) throw new Error('unexpected XIVAPI search response')
    schema ??= page.schema
    version ??= page.version
    if (schema !== page.schema || version !== page.version) {
      throw new Error('XIVAPI version changed while catalog pages were being read')
    }
    rows.push(...page.results)
    cursor = typeof page.next === 'string' && page.next.length > 0 ? page.next : null
  } while (cursor !== null)

  if (typeof schema !== 'string' || typeof version !== 'string') {
    throw new Error('XIVAPI did not return schema/version identity')
  }
  return { rows, schema, version }
}

function requiredNumber(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`)
  return value
}

function requiredPositiveNumber(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
  return value
}

function nestedFields(value, label) {
  if (value === null || typeof value !== 'object' || value.fields === null || typeof value.fields !== 'object') {
    throw new Error(`${label} is missing nested fields`)
  }
  return value.fields
}

function familyIdentity(record) {
  const identity = [
    record.recipeLevel,
    record.progressRequired,
    record.qualityMax,
    record.requiredQuality,
    record.durabilityMax,
    record.progressDivider,
    record.qualityDivider,
    record.progressModifier,
    record.qualityModifier,
    record.requiredCraftsmanship,
    record.requiredControl,
    record.conditionsFlag,
    record.qualityOutcome,
  ].join(':')
  return `cosmic-expert-mechanics-${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`
}

function normalizeRecipe(row, missionIds, missionIdentities) {
  const fields = row.fields
  if (fields?.IsExpert !== true) throw new Error(`Recipe ${row.row_id} is not expert`)
  const itemLink = fields.ItemResult
  const item = nestedFields(itemLink, `Recipe ${row.row_id} ItemResult`)
  const levelLink = fields.RecipeLevelTable
  const level = nestedFields(levelLink, `Recipe ${row.row_id} RecipeLevelTable`)
  const craftType = nestedFields(fields.CraftType, `Recipe ${row.row_id} CraftType`)
  const job = JOB_BY_CRAFT_TYPE[craftType.Name]
  if (job === undefined) throw new Error(`unsupported CraftType.Name: ${String(craftType.Name)}`)

  const difficultyBase = requiredPositiveNumber(level.Difficulty, 'Difficulty')
  const qualityBase = requiredPositiveNumber(level.Quality, 'Quality')
  const durabilityBase = requiredPositiveNumber(level.Durability, 'Durability')
  const difficultyFactor = requiredPositiveNumber(fields.DifficultyFactor, 'DifficultyFactor')
  const qualityFactor = requiredPositiveNumber(fields.QualityFactor, 'QualityFactor')
  const durabilityFactor = requiredPositiveNumber(fields.DurabilityFactor, 'DurabilityFactor')
  const requiredQuality = requiredNumber(fields.RequiredQuality, 'RequiredQuality')
  const isCollectable = item.IsCollectable === true
  const canBeHq = item.CanBeHq === true
  const qualityOutcome = requiredQuality > 0
    ? 'required-quality'
    : canBeHq
      ? 'hq-chance'
      : 'collectability'

  const normalizedMissionIds = [...new Set(missionIds)].sort((a, b) => a - b)
  const missionNamesEn = normalizedMissionIds.map((missionId) => {
    const identities = missionIdentities.get(missionId)
    if (identities === undefined || identities.length === 0) {
      throw new Error(`Recipe ${row.row_id} WKS mission recipe row ${missionId} has no mission identity`)
    }
    if (identities.length !== 1) {
      throw new Error(
        `Recipe ${row.row_id} WKS mission recipe row ${missionId} has ambiguous mission identities: `
        + identities.map((identity) => `${identity.unitId}:${identity.nameEn}`).join(', '),
      )
    }
    return identities[0].nameEn
  })

  const record = {
    recipeId: requiredPositiveNumber(row.row_id, 'Recipe row_id'),
    itemId: requiredPositiveNumber(itemLink.row_id, 'ItemResult row_id'),
    itemIconId: requiredPositiveNumber(item.Icon?.id, 'ItemResult.Icon.id'),
    nameEn: String(item.Name ?? '').trim(),
    job,
    missionIds: normalizedMissionIds,
    missionNamesEn,
    recipeLevelTableId: requiredPositiveNumber(levelLink.row_id, 'RecipeLevelTable row_id'),
    recipeLevel: requiredPositiveNumber(level.ClassJobLevel, 'ClassJobLevel'),
    difficultyBase,
    difficultyFactor,
    progressRequired: Math.floor(difficultyBase * difficultyFactor / 100),
    qualityBase,
    qualityFactor,
    qualityMax: Math.floor(qualityBase * qualityFactor / 100),
    requiredQuality,
    durabilityBase,
    durabilityFactor,
    durabilityMax: Math.floor(durabilityBase * durabilityFactor / 100),
    progressDivider: requiredPositiveNumber(level.ProgressDivider, 'ProgressDivider'),
    qualityDivider: requiredPositiveNumber(level.QualityDivider, 'QualityDivider'),
    progressModifier: requiredPositiveNumber(level.ProgressModifier, 'ProgressModifier'),
    qualityModifier: requiredPositiveNumber(level.QualityModifier, 'QualityModifier'),
    recommendedCraftsmanship: requiredPositiveNumber(level.SuggestedCraftsmanship, 'SuggestedCraftsmanship'),
    requiredCraftsmanship: requiredNumber(fields.RequiredCraftsmanship, 'RequiredCraftsmanship'),
    requiredControl: requiredNumber(fields.RequiredControl, 'RequiredControl'),
    conditionsFlag: requiredPositiveNumber(level.ConditionsFlag, 'ConditionsFlag'),
    isCollectable,
    canBeHq,
    qualityOutcome,
  }
  if (record.nameEn.length === 0) throw new Error(`Recipe ${record.recipeId} has no English item name`)
  if (record.missionIds.length === 0) throw new Error(`Recipe ${record.recipeId} has no WKS mission membership`)
  if (record.missionNamesEn.length === 0) throw new Error(`Recipe ${record.recipeId} has no WKS mission display name`)
  if (record.requiredQuality > record.qualityMax) {
    throw new Error(`Recipe ${record.recipeId} required quality exceeds quality maximum`)
  }
  return { ...record, mechanicsFamilyId: familyIdentity(record) }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function renderGeneratedModule({
  recipes,
  missionRecipeRevision,
  missionUnitRevision,
  schema,
  version,
  patch,
  verifiedAt,
}) {
  const canonicalContentSha256 = sha256(JSON.stringify(recipes))
  const catalogIdentitySha256 = sha256(JSON.stringify({
    xivapiVersion: version,
    xivapiSchema: schema,
    wksMissionRecipeRevision: missionRecipeRevision,
    wksMissionUnitRevision: missionUnitRevision,
    canonicalContentSha256,
  }))
  const source = {
    xivapiSchema: schema,
    xivapiVersion: version,
    wksMissionRecipeRevision: missionRecipeRevision,
    wksMissionRecipePath: WKS_MISSION_RECIPE_PATH,
    wksMissionUnitRevision: missionUnitRevision,
    wksMissionUnitPath: WKS_MISSION_UNIT_PATH,
    patch,
    verifiedAt,
    canonicalContentSha256,
    catalogIdentitySha256,
    recipeCount: recipes.length,
    mechanicsFamilyCount: new Set(recipes.map((recipe) => recipe.mechanicsFamilyId)).size,
  }
  return `/* eslint-disable */\n/**\n * GENERATED FILE. Run \`npm run data:import:cosmic-expert\` to refresh.\n * Do not hand-edit recipe rows.\n */\n\nexport const COSMIC_EXPERT_GENERATED_SOURCE = ${JSON.stringify(source, null, 2)} as const\n\nexport const GENERATED_COSMIC_EXPERT_RECIPES = ${JSON.stringify(recipes, null, 2)} as const\n`
}

async function main() {
  const [missionRecipeRevision, missionUnitRevision] = await Promise.all([
    latestPathRevision(WKS_MISSION_RECIPE_PATH),
    latestPathRevision(WKS_MISSION_UNIT_PATH),
  ])
  const missionRecipeUrl = `https://raw.githubusercontent.com/${DATAMINING_REPOSITORY}/${missionRecipeRevision.sha}/${WKS_MISSION_RECIPE_PATH}`
  const missionUnitUrl = `https://raw.githubusercontent.com/${DATAMINING_REPOSITORY}/${missionUnitRevision.sha}/${WKS_MISSION_UNIT_PATH}`
  const [missionRecipeCsv, missionUnitCsv] = await Promise.all([
    fetchText(missionRecipeUrl),
    fetchText(missionUnitUrl),
  ])
  const memberships = missionMemberships(missionRecipeCsv)
  const missionIdentities = missionNamesByRecipeRowId(missionUnitCsv)
  const { rows, schema, version } = await fetchExpertLevel100Recipes()
  const snapshotContract = SNAPSHOT_CONTRACT_BY_XIVAPI_VERSION[version]
  if (snapshotContract === undefined) {
    throw new Error(`unsupported XIVAPI game-data version: ${version}`)
  }
  if (schema !== snapshotContract.schema) {
    throw new Error(`unsupported XIVAPI schema ${schema} for game-data ${version}`)
  }
  const recipes = rows
    .filter((row) => memberships.has(row.row_id))
    .map((row) => normalizeRecipe(row, memberships.get(row.row_id), missionIdentities))
    .sort((a, b) => a.recipeId - b.recipeId)

  const uniqueIds = new Set(recipes.map((recipe) => recipe.recipeId))
  if (uniqueIds.size !== recipes.length) throw new Error('duplicate recipe id in generated catalog')
  if (recipes.length !== snapshotContract.cosmicExpertRecipeCount) {
    const excluded = rows
      .filter((row) => !memberships.has(row.row_id))
      .map((row) => `${row.row_id}:${String(row.fields?.ItemResult?.fields?.Name ?? 'unknown')}`)
      .join(', ')
    throw new Error(
      `expected exactly ${snapshotContract.cosmicExpertRecipeCount} Cosmic expert recipes for ${version}, got ${recipes.length}; `
      + `level-100 expert recipes outside WKSMissionRecipe: ${excluded}`,
    )
  }

  const verifiedAt = [missionRecipeRevision.committedAt, missionUnitRevision.committedAt]
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0]
    .slice(0, 10)
  const output = renderGeneratedModule({
    recipes,
    missionRecipeRevision: missionRecipeRevision.sha,
    missionUnitRevision: missionUnitRevision.sha,
    schema,
    version,
    patch: snapshotContract.patch,
    verifiedAt,
  })
  if (process.argv.includes('--check')) {
    const current = await readFile(OUTPUT_PATH, 'utf8').catch(() => '')
    if (current !== output) {
      throw new Error('generated Cosmic expert recipe catalog is stale; run npm run data:import:cosmic-expert')
    }
    console.log(`verified ${recipes.length} recipes across ${new Set(recipes.map((recipe) => recipe.mechanicsFamilyId)).size} mechanics families`)
    return
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, output, 'utf8')
  console.log(`wrote ${recipes.length} recipes across ${new Set(recipes.map((recipe) => recipe.mechanicsFamilyId)).size} mechanics families`)
  console.log(
    `XIVAPI ${version}; schema ${schema}; WKSMissionRecipe ${missionRecipeRevision.sha}; WKSMissionUnit ${missionUnitRevision.sha}`,
  )
}

await main()
