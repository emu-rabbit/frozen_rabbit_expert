import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COSMIC_EXPERT_GENERATED_SOURCE,
  GENERATED_COSMIC_EXPERT_RECIPES,
} from '../../packages/data/src/generated/cosmicExpertRecipes.generated.ts'
import {
  COMMUNITY_HQ_CHANCE_PERCENT_BY_QUALITY_PERCENT,
} from '../../packages/domain/src/hqChance.ts'

export const OVERNIGHT_OVERVIEW_REPORT_VERSION = 'generic-cosmic-overnight-overview-v3'

const HISTORICAL_REPORT_SCHEMAS = new Set([
  'generic-cosmic-family-development-matrix-v2',
  'native-generic-cosmic-paired-matrix-v1',
  'native-generic-cosmic-paired-matrix-v2',
])
const CURRENT_REPORT_SCHEMAS = new Set(['native-generic-cosmic-paired-matrix-v3', 'native-generic-cosmic-paired-matrix-v4', 'native-generic-cosmic-paired-matrix-v5'])

const toolDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(toolDirectory, '..', '..')
const defaultOutputDirectory = path.join(repositoryRoot, 'reports', 'generic-cosmic-overnight')
const expectedCatalogVersion = [
  'cosmic-expert-catalog',
  COSMIC_EXPERT_GENERATED_SOURCE.xivapiVersion,
  COSMIC_EXPERT_GENERATED_SOURCE.catalogIdentitySha256.slice(0, 16),
  'v2',
].join('-')

const FOCUSED_RISK = 'balanced'
const FOCUSED_WORLD = 'balanced-iid'
const FOCUSED_EQUIPMENT = Object.freeze([
  Object.freeze({
    code: 'E02',
    id: 'player-food-medicine-cosmic-tool-v1',
    shortLabel: '720＋690 滿鑲嵌食藥非專家',
    panel: '作業 5,408／加工 5,237／CP 749',
  }),
  Object.freeze({
    code: 'E09',
    id: 'generic-i750-hq-five-meld-template-buffed-v1',
    shortLabel: 'i750 五鑲嵌食藥非專家',
    panel: '作業 5,811／加工 5,500／CP 776',
  }),
])

// F01-F19 use the Traditional Chinese data snapshot. F20-F50 use the
// Simplified Chinese snapshot with character conversion only, as requested.
const representativeNameZhByRecipeId = new Map([
  [36194, '改良設備用的隔熱材料'],
  [36195, '室外活動用的木炭'],
  [36196, '加工檢驗用的木材'],
  [36197, '加工檢驗用的木板'],
  [36198, '加工檢驗用的樹脂'],
  [36200, '基地托盤'],
  [36201, '基地雙層床'],
  [36202, '特製木工師工作台'],
  [36203, '特製金工師工作台'],
  [36204, '特製皮革師工作台'],
  [36205, '宇宙探索用的硬化木板'],
  [36206, '宇宙探索用的紡車'],
  [36208, '高空作業用的鷹架'],
  [36219, '宇宙琥珀'],
  [36220, '宇宙矽化木寶珠'],
  [36222, '宇宙愛情花油'],
  [36223, '宇宙蒸餾油'],
  [36225, '宇宙加工品'],
  [36227, '宇宙探索用的生物燃料'],
  [36979, '類植物提取的樹脂'],
  [36980, '記錄用的紙箱'],
  [36981, '特定用途的輕量木材'],
  [36982, '特定用途的高密度木材'],
  [36983, '特定用途的高級木材'],
  [36985, '特定用途的釣竿'],
  [36986, '特定用途的紡車'],
  [36987, '特定用途的砂輪機'],
  [36990, '輕量樹脂纖維'],
  [36997, '宇宙素材的室內燈'],
  [36999, '改善生活用的時髦窗簾'],
  [37001, '強化素材組合A'],
  [37002, '宇宙素材的高純度樹脂'],
  [37003, '強化素材組合B'],
  [37004, '宇宙素材的樹脂珠寶'],
  [37005, '強化素材組合C'],
  [37006, '宇宙素材的樹脂球'],
  [37519, '護盾板材的方形貨板'],
  [37520, '發掘工作用的防塵面具'],
  [37521, '發掘工作用的腳手架台階'],
  [37524, '改善生活用的吊床'],
  [37526, '俄匊斯基礎素材套裝'],
  [37527, '俄匊斯再利用材料'],
  [37528, '俄匊斯特殊素材套裝'],
  [37529, '俄匊斯壓縮木材'],
  [37530, '俄匊斯特級素材套裝'],
  [37531, '俄匊斯生物焦炭'],
  [37986, '高純度生物燃料'],
  [38198, '重機用的生物燃料'],
  [38199, '植物再生用的營養球'],
  [38200, '奧克塞西亞生物焦炭'],
])

const recipesByFamilyId = new Map()
for (const recipe of GENERATED_COSMIC_EXPERT_RECIPES) {
  const recipes = recipesByFamilyId.get(recipe.mechanicsFamilyId) ?? []
  recipes.push(recipe)
  recipesByFamilyId.set(recipe.mechanicsFamilyId, recipes)
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`${label} is unreadable: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function record(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function array(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator
}

function integer(value) {
  return value === null ? '—' : Math.round(value).toLocaleString('en-US')
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function lengthDistribution(values) {
  if (values.length === 0) {
    return { count: 0, p50: null, maximum: null }
  }
  const sorted = [...values].sort((left, right) => left - right)
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    maximum: sorted.at(-1),
  }
}

function signedNumber(value, digits = 1, suffix = '') {
  if (value === null) return '—'
  const normalized = Math.abs(value) < (0.5 * (10 ** -digits)) ? 0 : value
  const sign = normalized > 0 ? '+' : ''
  return `${sign}${normalized.toFixed(digits)}${suffix}`
}

function signedInteger(value) {
  if (value === null) return '—'
  const rounded = Math.round(value)
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-US')}`
}

function comparisonCell(candidate, baseline, extract, formatters, deltaFormatters) {
  const candidateValues = candidate === null ? null : extract(candidate)
  const baselineValues = baseline === null ? null : extract(baseline)
  if (candidateValues === null) return '—'
  return candidateValues.map((value, index) => {
    const formatted = formatters[index](value)
    if (baselineValues === null || value === null || baselineValues[index] === null) {
      return formatted
    }
    const difference = value - baselineValues[index]
    return `${formatted} (${deltaFormatters[index](difference)})`
  }).join(' / ')
}

function preferredLength(summary) {
  if (summary === null) return null
  const completed = summary.craftLength?.completed
  const nonCompleted = summary.craftLength?.nonCompleted
  const advancingCount = (completed?.advancingSteps?.count ?? 0)
    + (nonCompleted?.advancingSteps?.count ?? 0)
  const field = advancingCount > 0 ? 'advancingSteps' : 'actions'
  return {
    label: field === 'advancingSteps' ? 'S' : 'A',
    completed: completed?.[field],
    nonCompleted: nonCompleted?.[field],
  }
}

function comparedLengthPair(candidate, baseline, outcome) {
  const candidateDistribution = candidate[outcome]
  if (candidateDistribution?.count === 0) return '—'
  const baselineDistribution = baseline?.label === candidate.label ? baseline[outcome] : null
  return [candidateDistribution.p50, candidateDistribution.maximum]
    .map((value, index) => {
      const formatted = integer(value)
      if (baselineDistribution?.count === 0) return formatted
      const baselineValue = index === 0 ? baselineDistribution?.p50 : baselineDistribution?.maximum
      return baselineValue === undefined || baselineValue === null
        ? formatted
        : `${formatted} (${signedInteger(value - baselineValue)})`
    })
    .join('/')
}

function lengthCell(summaries) {
  const candidate = preferredLength(summaries.candidate)
  const baseline = preferredLength(summaries.baseline)
  if (candidate === null) return '—'
  return `${candidate.label}：完 ${comparedLengthPair(candidate, baseline, 'completed')}`
    + `・未 ${comparedLengthPair(candidate, baseline, 'nonCompleted')}`
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
    '',
  ]
}

function missionRank(recipe) {
  const missionName = recipe.missionNamesEn[0] ?? ''
  if (missionName.startsWith('Master:')) return 'Master'
  if (missionName.startsWith('EX+:')) return 'EX+'
  if (missionName.startsWith('EX:')) return 'EX'
  return 'A'
}

function collectabilityThresholds(recipe, rank) {
  if (rank === 'Master') return null
  const ratios = rank === 'EX+'
    ? [0.60, 0.70, 0.90]
    : rank === 'EX' ? [0.50, 0.60, 0.85] : [0.40, 0.55, 0.70]
  const maximumCollectability = Math.floor(recipe.qualityMax / 10)
  return ratios.map((ratio) => Math.floor(maximumCollectability * ratio) * 10)
}

function familyKind(recipe) {
  if (recipe.requiredQuality > 0) return 'hard-quality'
  if (recipe.qualityOutcome === 'hq-chance') return 'hq'
  if (recipe.qualityOutcome === 'collectability' && missionRank(recipe) === 'Master') {
    return 'master'
  }
  if (recipe.qualityOutcome === 'collectability') return 'collectability'
  throw new Error(`unsupported quality outcome for recipe ${recipe.recipeId}: ${recipe.qualityOutcome}`)
}

function completeDelivery(row, recipe) {
  return row.terminal === 'completed'
    && Number.isFinite(row.progress)
    && row.progress >= recipe.progressRequired
}

export function summarizeFamilyEquipmentRows(recipe, rows) {
  const episodes = rows.length
  if (episodes === 0) throw new Error(`recipe ${recipe.recipeId} has no focused rows`)
  const completedRows = rows.filter((row) => completeDelivery(row, recipe))
  const nonCompletedRows = rows.filter((row) => !completeDelivery(row, recipe))
  const fullQuality = completedRows.filter((row) => row.quality >= recipe.qualityMax).length
  const summarizeLengths = (selected) => ({
    actions: lengthDistribution(selected
      .filter((row) => Number.isSafeInteger(row.actions))
      .map((row) => row.actions)),
    advancingSteps: lengthDistribution(selected
      .filter((row) => Number.isSafeInteger(row.advancingSteps))
      .map((row) => row.advancingSteps)),
  })
  const summary = {
    episodes,
    deliveryRate: rate(completedRows.length, episodes),
    fullQualityRate: rate(fullQuality, episodes),
    craftLength: {
      completed: summarizeLengths(completedRows),
      nonCompleted: summarizeLengths(nonCompletedRows),
    },
  }
  const kind = familyKind(recipe)
  if (kind === 'hard-quality') {
    const completed = completedRows.filter((row) => row.quality >= recipe.requiredQuality).length
    return { ...summary, kind, completionRate: rate(completed, episodes) }
  }
  if (kind === 'hq') {
    const total = completedRows.reduce((sum, row) => {
      const qualityPercent = Math.min(100, Math.floor(row.quality * 100 / recipe.qualityMax))
      return sum + (COMMUNITY_HQ_CHANCE_PERCENT_BY_QUALITY_PERCENT[qualityPercent] ?? 100)
    }, 0)
    return {
      ...summary,
      kind,
      completedHqChanceMean: completedRows.length === 0 ? null : total / completedRows.length,
    }
  }
  if (kind === 'master') {
    const total = completedRows.reduce((sum, row) => sum + Math.floor(row.quality / 10), 0)
    return {
      ...summary,
      kind,
      completedCollectabilityMean: completedRows.length === 0 ? null : total / completedRows.length,
    }
  }
  const rank = missionRank(recipe)
  const [low, mid, high] = collectabilityThresholds(recipe, rank)
  return {
    ...summary,
    kind,
    rank,
    collectabilityLowRate: rate(completedRows.filter((row) => row.quality >= low).length, episodes),
    collectabilityMidRate: rate(completedRows.filter((row) => row.quality >= mid).length, episodes),
    collectabilityHighRate: rate(completedRows.filter((row) => row.quality >= high).length, episodes),
  }
}

function currentFamilyMetadata(configFamilies) {
  const seen = new Set()
  return configFamilies.map(({ familyId, representativeRecipeId }, index) => {
    if (seen.has(familyId)) throw new Error(`duplicate family in config: ${familyId}`)
    seen.add(familyId)
    const recipes = recipesByFamilyId.get(familyId)
    const representative = recipes?.find((recipe) => recipe.recipeId === representativeRecipeId)
    if (representative === undefined) {
      throw new Error(`current catalog does not contain configured representative ${familyId}/${representativeRecipeId}`)
    }
    const nameZh = representativeNameZhByRecipeId.get(representativeRecipeId)
    if (nameZh === undefined) {
      throw new Error(`Chinese representative name is missing for recipe ${representativeRecipeId}`)
    }
    return {
      code: `F${String(index + 1).padStart(2, '0')}`,
      familyId,
      representativeRecipeId,
      representative,
      nameZh,
    }
  })
}

function solverIdentities(config) {
  const evaluator = record(config.payload?.evaluator, 'config.payload.evaluator')
  const candidate = typeof evaluator.execution?.candidateSolver === 'string'
    ? evaluator.execution.candidateSolver
    : evaluator.policyVersion
  if (typeof candidate !== 'string') throw new Error('config does not identify the candidate solver')
  const baseline = typeof evaluator.execution?.baselineSolver === 'string'
    ? evaluator.execution.baselineSolver
    : null
  return { baseline, candidate, historicalBaseline: evaluator.execution?.baselineMode === 'historical-candidate' }
}

function validateCompleteRun(manifest, config) {
  const summary = record(manifest.summary, 'manifest.summary')
  if (!['completed', 'status-complete'].includes(manifest.outcome)
    || summary.completed !== summary.totalShards
    || summary.running !== 0
    || summary.failed !== 0
    || summary.pending !== 0) {
    throw new Error('overview report requires a fully completed overnight manifest')
  }
  if (manifest.runId !== config.runId || manifest.configFingerprint !== config.configFingerprint) {
    throw new Error('manifest and config identities do not match')
  }
  if (typeof manifest.runId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(manifest.runId)) {
    throw new Error('run ID is not a safe report filename')
  }
}

function reportEligibility(config) {
  const payload = record(config.payload, 'config.payload')
  const evaluator = record(payload.evaluator, 'config.payload.evaluator')
  const axes = record(payload.axes, 'config.payload.axes')
  const configFamilies = array(axes.families, 'config.payload.axes.families')
  const reasons = []
  if (evaluator.catalogVersion !== expectedCatalogVersion) {
    throw new Error(
      `run catalog ${evaluator.catalogVersion} does not match current ${expectedCatalogVersion}`,
    )
  }
  if (configFamilies.length !== recipesByFamilyId.size) {
    reasons.push(`requires all ${recipesByFamilyId.size} families, found ${configFamilies.length}`)
  }
  if (!array(axes.risks, 'config.payload.axes.risks').includes(FOCUSED_RISK)) {
    reasons.push(`missing risk ${FOCUSED_RISK}`)
  }
  if (!array(axes.worldIds, 'config.payload.axes.worldIds').includes(FOCUSED_WORLD)) {
    reasons.push(`missing world ${FOCUSED_WORLD}`)
  }
  const equipmentIds = array(axes.equipmentIds, 'config.payload.axes.equipmentIds')
  for (const equipment of FOCUSED_EQUIPMENT) {
    if (!equipmentIds.includes(equipment.id)) reasons.push(`missing equipment ${equipment.id}`)
  }
  return reasons
}

function rowsFromShard(shard, shardFileName) {
  const report = record(shard.report, `${shardFileName}.report`)
  if (!CURRENT_REPORT_SCHEMAS.has(report.schemaVersion)
    && !HISTORICAL_REPORT_SCHEMAS.has(report.schemaVersion)) {
    throw new Error(`${shardFileName}.report has unsupported schema ${report.schemaVersion}`)
  }
  const rows = report.rows ?? report.comparisonRows
  return {
    requiresAdvancingSteps: CURRENT_REPORT_SCHEMAS.has(report.schemaVersion),
    rows: array(rows, `${shardFileName}.report rows`),
  }
}

function loadFocusedRows(runDirectory, manifest, families, seedCount, arms) {
  const familyById = new Map(families.map((family) => [family.familyId, family]))
  const focused = new Map(families.map((family) => [family.familyId, new Map(
    FOCUSED_EQUIPMENT.map((equipment) => [equipment.id, new Map(
      arms.map((arm) => [arm, []]),
    )]),
  )]))
  const balancedShards = array(manifest.shards, 'manifest.shards').filter(
    (shard) => shard.risk === FOCUSED_RISK,
  )
  if (balancedShards.length !== families.length) {
    throw new Error(`expected ${families.length} balanced shards, found ${balancedShards.length}`)
  }
  for (const entry of balancedShards) {
    if (entry.status !== 'completed' || !familyById.has(entry.familyId)) {
      throw new Error(`invalid balanced manifest shard ${entry.fileName}`)
    }
    const shardPath = path.join(runDirectory, 'shards', entry.fileName)
    const shard = record(readJson(shardPath, `shard ${entry.fileName}`), `shard ${entry.fileName}`)
    if (shard.status !== 'completed'
      || shard.familyId !== entry.familyId
      || shard.risk !== FOCUSED_RISK) {
      throw new Error(`shard identity mismatch: ${entry.fileName}`)
    }
    const reportRows = rowsFromShard(shard, entry.fileName)
    for (const row of reportRows.rows) {
      if (!arms.includes(row.arm)
        || row.familyId !== entry.familyId
        || row.risk !== FOCUSED_RISK
        || row.worldId !== FOCUSED_WORLD
        || !FOCUSED_EQUIPMENT.some((equipment) => equipment.id === row.equipmentId)) {
        continue
      }
      if (!Number.isSafeInteger(row.seedIndex)
        || !Number.isFinite(row.progress)
        || !Number.isFinite(row.quality)
        || !Number.isSafeInteger(row.actions)
        || row.actions < 0
        || (row.advancingSteps !== undefined
          && (!Number.isSafeInteger(row.advancingSteps)
            || row.advancingSteps < 0
            || row.advancingSteps > row.actions))
        || (reportRows.requiresAdvancingSteps && row.advancingSteps === undefined)) {
        throw new Error(`focused row has invalid outcome fields in ${entry.fileName}`)
      }
      focused.get(entry.familyId).get(row.equipmentId).get(row.arm).push(row)
    }
  }
  for (const family of families) {
    for (const equipment of FOCUSED_EQUIPMENT) {
      const rowsByArm = focused.get(family.familyId).get(equipment.id)
      let referenceSeeds = null
      for (const arm of arms) {
        const rows = rowsByArm.get(arm)
        const seeds = new Set(rows.map((row) => row.seedIndex))
        if (rows.length !== seedCount || seeds.size !== seedCount) {
          throw new Error(
            `focused cell ${family.familyId}/${equipment.id}/${arm} has ${rows.length} rows and ${seeds.size} unique seeds; expected ${seedCount}`,
          )
        }
        if (referenceSeeds !== null
          && (seeds.size !== referenceSeeds.size
            || [...seeds].some((seed) => !referenceSeeds.has(seed)))) {
          throw new Error(`focused cell ${family.familyId}/${equipment.id} does not have paired seeds`)
        }
        referenceSeeds = seeds
      }
    }
  }
  return focused
}

function score(summary, kind) {
  if (kind === 'hard-quality') return summary.completionRate
  if (kind === 'collectability') return summary.collectabilityHighRate
  if (kind === 'hq') return summary.completedHqChanceMean === null
    ? Number.NEGATIVE_INFINITY
    : summary.completedHqChanceMean / 100
  return summary.fullQualityRate
}

function sortedFamilies(families, kind) {
  return families
    .filter((family) => family.kind === kind)
    .sort((left, right) => {
      for (const equipmentIndex of [1, 0]) {
        const difference = score(right.summaries[equipmentIndex].candidate, kind)
          - score(left.summaries[equipmentIndex].candidate, kind)
        if (Math.abs(difference) > 1e-12) return difference
      }
      return left.code.localeCompare(right.code)
    })
}

function fullRequirements(family) {
  return [family.representative.progressRequired, family.representative.qualityMax]
    .map((value) => value.toLocaleString('en-US'))
    .join(' / ')
}

const percentageFormatter = (value) => value === null ? '—' : `${value.toFixed(1)}%`
const percentageDeltaFormatter = (value) => signedNumber(value, 1, '%')
const integerFormatter = (value) => integer(value)

function hardQualityCell(summaries) {
  return comparisonCell(
    summaries.candidate,
    summaries.baseline,
    (summary) => [summary.completionRate * 100],
    [percentageFormatter],
    [percentageDeltaFormatter],
  )
}

function collectabilityCell(summaries) {
  return comparisonCell(
    summaries.candidate,
    summaries.baseline,
    (summary) => [
      summary.deliveryRate * 100,
      summary.collectabilityLowRate * 100,
      summary.collectabilityMidRate * 100,
      summary.collectabilityHighRate * 100,
      summary.fullQualityRate * 100,
    ],
    Array(5).fill(percentageFormatter),
    Array(5).fill(percentageDeltaFormatter),
  )
}

function hqCell(summaries) {
  return comparisonCell(
    summaries.candidate,
    summaries.baseline,
    (summary) => [
      summary.deliveryRate * 100,
      summary.completedHqChanceMean,
      summary.fullQualityRate * 100,
    ],
    Array(3).fill(percentageFormatter),
    Array(3).fill(percentageDeltaFormatter),
  )
}

function masterCell(summaries) {
  return comparisonCell(
    summaries.candidate,
    summaries.baseline,
    (summary) => [
      summary.deliveryRate * 100,
      summary.completedCollectabilityMean,
      summary.fullQualityRate * 100,
    ],
    [percentageFormatter, integerFormatter, percentageFormatter],
    [percentageDeltaFormatter, signedInteger, percentageDeltaFormatter],
  )
}

export function renderOvernightOverviewMarkdown({
  runId,
  configFingerprint,
  solvers,
  seedCount,
  families,
}) {
  const lines = [
    `# Overnight 四表總覽：${runId}`,
    '',
    `> 由 ${OVERNIGHT_OVERVIEW_REPORT_VERSION} 直接從 completed shards 生成；只呈現固定切片的結果，不含策略判讀。這是 synthetic／assumed-world evaluation，不是真實遊戲自然成功率。`,
    '',
    '## 固定切片與量尺',
    '',
    `- Candidate：\`${solvers.candidate}\`。`,
    `- Baseline：${solvers.baseline === null ? '此歷史 run 未保存 baseline arm' : `\`${solvers.baseline}\``}；config fingerprint：\`${configFingerprint}\`。`,
    ...(solvers.historicalBaseline ? ['- 本次只執行 Candidate；Baseline 沿用歷史 run 的 candidate 結果，逐案例／來源 hash 核對後配對。Baseline 時間是歷史量測，不是本次運算；這是共同 benchmark，不是新的獨立保留集。'] : []),
    `- 條件：Balanced × \`${FOCUSED_WORLD}\`（無壓力、合理球色分布假設）× 每格 ${seedCount} seeds。`,
    ...FOCUSED_EQUIPMENT.map((equipment) => (
      `- ${equipment.code}：${equipment.shortLabel}（${equipment.panel}）。`
    )),
    '- `滿作業／滿品質` 是配方的作業需求／品質上限。一般收藏品欄位為 `交貨 / 100 / 300 / 700 / 滿品質`；一般製作為 `交貨 / 完成品平均 HQ 機率 / 滿品質`；Master 為 `交貨 / 完成品平均收藏價值 / 滿品質`。',
    '- 表格預設只顯示 Candidate 數值；若 run 保存 baseline arm，數值後的小括號顯示 `Candidate − Baseline`，例如 `93.8% (+2.1%)`。單臂歷史 run 不顯示括號差值。',
    '- 長度欄是觀察值，不是成敗門檻，只顯示 Candidate 完成（完）／未完成（未）的 `p50/max`，括號同樣是相對 Baseline 的差值。優先使用推進遊戲工序數 `S`；舊 evidence 沒保存 `S` 時，整列回退使用全部技能數 `A`。長度差為負代表 Candidate 使用較少工序。',
    '- 四表依 E09 的主要品質量尺由高到低排序，再以 E02 解同分：hard-quality 用完成率、一般收藏品用 700 分檔、一般製作用平均 HQ 機率、Master 用滿品質率。',
    '- 代表配方：F01–F19 使用繁中服資料字串；F20–F50 使用簡中服資料字串直接簡轉繁，不附物品 ID。',
    '',
  ]

  const hard = sortedFamilies(families, 'hard-quality')
  lines.push(`## ${hard.length} 個 hard-quality 家族`, '')
  lines.push(...table(
    ['Family', '代表配方', '滿作業／滿品質', 'E02 完成率', 'E02 長度', 'E09 完成率', 'E09 長度'],
    hard.map((family) => [
      family.code,
      family.nameZh,
      fullRequirements(family),
      hardQualityCell(family.summaries[0]),
      lengthCell(family.summaries[0]),
      hardQualityCell(family.summaries[1]),
      lengthCell(family.summaries[1]),
    ]),
  ))

  const collectability = sortedFamilies(families, 'collectability')
  lines.push(`## ${collectability.length} 個一般收藏品家族`, '')
  lines.push(...table(
    ['Family', '代表配方', '滿作業／滿品質', '任務級別', 'E02 交/100/300/700/滿', 'E02 長度', 'E09 交/100/300/700/滿', 'E09 長度'],
    collectability.map((family) => [
      family.code,
      family.nameZh,
      fullRequirements(family),
      missionRank(family.representative),
      collectabilityCell(family.summaries[0]),
      lengthCell(family.summaries[0]),
      collectabilityCell(family.summaries[1]),
      lengthCell(family.summaries[1]),
    ]),
  ))

  const hq = sortedFamilies(families, 'hq')
  lines.push(`## ${hq.length} 個一般 HQ 成品家族`, '')
  lines.push(...table(
    ['Family', '代表配方', '滿作業／滿品質', 'E02 交貨/HQ/滿', 'E02 長度', 'E09 交貨/HQ/滿', 'E09 長度'],
    hq.map((family) => [
      family.code,
      family.nameZh,
      fullRequirements(family),
      hqCell(family.summaries[0]),
      lengthCell(family.summaries[0]),
      hqCell(family.summaries[1]),
      lengthCell(family.summaries[1]),
    ]),
  ))

  const master = sortedFamilies(families, 'master')
  lines.push(`## ${master.length} 個 Auxesia Master 收藏品家族`, '')
  lines.push(...table(
    ['Family', '代表配方', '滿作業／滿品質', 'E02 交貨/平均收藏/滿', 'E02 長度', 'E09 交貨/平均收藏/滿', 'E09 長度'],
    master.map((family) => [
      family.code,
      family.nameZh,
      fullRequirements(family),
      masterCell(family.summaries[0]),
      lengthCell(family.summaries[0]),
      masterCell(family.summaries[1]),
      lengthCell(family.summaries[1]),
    ]),
  ))

  lines.push(
    '## 換算來源',
    '',
    '- 一般收藏品的 100／300／700 分檔依任務級別使用 A 40%／55%／70%、EX 50%／60%／85%、EX+ 60%／70%／90%，先把品質上限換成整數收藏價值再回推品質門檻；未完成列入分母且視為未達檔。',
    '- 一般 HQ 機率直接查 `packages/domain/src/hqChance.ts` 保存的 101 格社群曲線；先將品質百分比向下取整，滿品質對應 100% HQ。平均值只取已完成成品。',
    '- Master 不套用一般三檔；平均收藏價值為已完成列的 `floor(quality / 10)` 平均值，滿品質率仍以全部 seeds 為分母。',
    '- 名稱快照：繁中 F01–F19 `ffxiv-datamining-tc@e203c7e46dd80fd2a967e5741b30e3c9fad0c767`；簡中 F20–F50 `ffxiv-datamining-mixed@f9f98935b88bd762fe5452eecd3511ab186d8842`。',
  )
  return `${lines.join('\n')}\n`
}

function writeTextAtomically(outputPath, content) {
  mkdirSync(path.dirname(outputPath), { recursive: true })
  if (existsSync(outputPath) && readFileSync(outputPath, 'utf8') === content) return
  const temporaryPath = `${outputPath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, content, 'utf8')
  try {
    renameSync(temporaryPath, outputPath)
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code) || !existsSync(outputPath)) throw error
    unlinkSync(outputPath)
    renameSync(temporaryPath, outputPath)
  }
}

export function generateOvernightOverviewReport({
  runDirectory,
  outputDirectory = defaultOutputDirectory,
}) {
  const resolvedRunDirectory = path.resolve(runDirectory)
  const manifest = record(
    readJson(path.join(resolvedRunDirectory, 'manifest.json'), 'overnight manifest'),
    'overnight manifest',
  )
  const config = record(
    readJson(path.join(resolvedRunDirectory, 'config.json'), 'overnight config'),
    'overnight config',
  )
  validateCompleteRun(manifest, config)
  const reasons = reportEligibility(config)
  if (reasons.length > 0) {
    return { status: 'skipped', runId: manifest.runId, reason: reasons.join('; ') }
  }

  const axes = config.payload.axes
  const families = currentFamilyMetadata(axes.families)
  const seedCount = axes.seedCountPerCell
  if (!Number.isSafeInteger(seedCount) || seedCount <= 0) {
    throw new Error('config seedCountPerCell must be a positive integer')
  }
  const solvers = solverIdentities(config)
  const arms = solvers.baseline === null ? ['candidate'] : ['baseline', 'candidate']
  const focusedRows = loadFocusedRows(
    resolvedRunDirectory,
    manifest,
    families,
    seedCount,
    arms,
  )
  const summarizedFamilies = families.map((family) => ({
    ...family,
    kind: familyKind(family.representative),
    summaries: FOCUSED_EQUIPMENT.map((equipment) => {
      const rowsByArm = focusedRows.get(family.familyId).get(equipment.id)
      return {
        candidate: summarizeFamilyEquipmentRows(
          family.representative,
          rowsByArm.get('candidate'),
        ),
        baseline: solvers.baseline === null
          ? null
          : summarizeFamilyEquipmentRows(family.representative, rowsByArm.get('baseline')),
      }
    }),
  }))
  if (summarizedFamilies.length !== 50
    || new Set(summarizedFamilies.map((family) => family.kind)).size !== 4) {
    throw new Error('current catalog does not produce the expected four-table 50-family partition')
  }
  const markdown = renderOvernightOverviewMarkdown({
    runId: manifest.runId,
    configFingerprint: manifest.configFingerprint,
    solvers,
    seedCount,
    families: summarizedFamilies,
  })
  const outputPath = path.resolve(outputDirectory, `${manifest.runId}.md`)
  writeTextAtomically(outputPath, markdown)
  return {
    status: 'generated',
    runId: manifest.runId,
    outputPath,
    familyCount: summarizedFamilies.length,
  }
}

const directInvocation = process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (directInvocation) {
  const runDirectories = process.argv.slice(2)
  if (runDirectories.length === 0) {
    process.stderr.write('Usage: node overview-report.mjs RUN_DIRECTORY [RUN_DIRECTORY...]\n')
    process.exitCode = 2
  } else {
    for (const runDirectory of runDirectories) {
      const result = generateOvernightOverviewReport({ runDirectory })
      if (result.status === 'generated') {
        process.stdout.write(`[overnight] overview report: ${result.outputPath}\n`)
      } else {
        process.stdout.write(`[overnight] overview report skipped for ${result.runId}: ${result.reason}\n`)
      }
    }
  }
}
