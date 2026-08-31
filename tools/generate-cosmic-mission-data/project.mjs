export const FORMAT_VERSION = 2
const XIVAPI_JOB_ICON_BASE = 'https://xivapi.com/cj/1/'

export const JOB_ID = {
  carpenter: 8, blacksmith: 9, armorer: 10, goldsmith: 11,
  leatherworker: 12, weaver: 13, alchemist: 14, culinarian: 15,
}

export const CRAFT_ACTION_NAMES = {
  basicSynthesis: 'Basic Synthesis',
  rapidSynthesis: 'Rapid Synthesis',
  carefulSynthesis: 'Careful Synthesis',
  groundwork: 'Groundwork',
  prudentSynthesis: 'Prudent Synthesis',
  intensiveSynthesis: 'Intensive Synthesis',
  muscleMemory: 'Muscle Memory',
  basicTouch: 'Basic Touch',
  hastyTouch: 'Hasty Touch',
  standardTouch: 'Standard Touch',
  advancedTouch: 'Advanced Touch',
  prudentTouch: 'Prudent Touch',
  preparatoryTouch: 'Preparatory Touch',
  preciseTouch: 'Precise Touch',
  byregotsBlessing: "Byregot's Blessing",
  trainedFinesse: 'Trained Finesse',
  refinedTouch: 'Refined Touch',
  daringTouch: 'Daring Touch',
  reflect: 'Reflect',
  delicateSynthesis: 'Delicate Synthesis',
  tricksOfTheTrade: 'Tricks of the Trade',
  trainedPerfection: 'Trained Perfection',
  mastersMend: "Master's Mend",
  immaculateMend: 'Immaculate Mend',
  wasteNot: 'Waste Not',
  wasteNot2: 'Waste Not II',
  veneration: 'Veneration',
  innovation: 'Innovation',
  greatStrides: 'Great Strides',
  manipulation: 'Manipulation',
  observe: 'Observe',
  finalAppraisal: 'Final Appraisal',
  carefulObservation: 'Careful Observation',
  heartAndSoul: 'Heart and Soul',
  quickInnovation: 'Quick Innovation',
}

const PLANET_RANGES = [
  { id: 'sinus-ardorum', firstRecipeId: 36194, lastRecipeId: 36668 },
  { id: 'phaenna', firstRecipeId: 36979, lastRecipeId: 37405 },
  { id: 'oizys', firstRecipeId: 37519, lastRecipeId: 37783 },
  { id: 'auxesia', firstRecipeId: 37981, lastRecipeId: 38221 },
]

function parseCsvLine(line, lineNumber, sourceName = 'CSV') {
  const values = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') { value += '"'; index += 1 }
      else if (character === '"') quoted = false
      else value += character
    } else if (character === ',') { values.push(value); value = '' }
    else if (character === '"') {
      if (value.length !== 0) throw new Error(`${sourceName}:${lineNumber}: invalid quote`)
      quoted = true
    } else value += character
  }
  if (quoted) throw new Error(`${sourceName}:${lineNumber}: unterminated quote`)
  values.push(value)
  return values
}

function parseCsvRecords(csv, sourceName) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') { value += '"'; index += 1 }
      else if (character === '"') quoted = false
      else value += character
    } else if (character === ',') { row.push(value); value = '' }
    else if (character === '"') {
      if (value.length !== 0) throw new Error(`${sourceName}: invalid quote`)
      quoted = true
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1
      row.push(value)
      if (row.some(field => field.length !== 0)) rows.push(row)
      row = []
      value = ''
    } else value += character
  }
  if (quoted) throw new Error(`${sourceName}: unterminated quote`)
  row.push(value)
  if (row.some(field => field.length !== 0)) rows.push(row)
  return rows
}

function parseCraftActionRows(csv, sourceName) {
  const records = parseCsvRecords(csv.replace(/^\uFEFF/, ''), sourceName)
  const header = records.shift()
  for (const name of ['#', 'Name', 'Icon', 'ClassJob']) {
    if (!header.includes(name)) throw new Error(`${sourceName}: missing ${name}`)
  }
  return records.flatMap((row, index) => {
    if (row.length !== header.length) throw new Error(`${sourceName}:record ${index + 2}: row width mismatch`)
    const name = row[header.indexOf('Name')]
    if (!name) return []
    const id = Number(row[header.indexOf('#')])
    const iconId = Number(row[header.indexOf('Icon')])
    const classJobId = Number(row[header.indexOf('ClassJob')])
    if (![id, iconId, classJobId].every(Number.isSafeInteger) || id < 0 || iconId <= 0 || classJobId < -1) {
      throw new Error(`${sourceName}:record ${index + 2}: invalid action identity`)
    }
    return [{ id, name, iconId, classJobId }]
  })
}

function xivapiIconUrl(iconId) {
  const padded = String(iconId).padStart(6, '0')
  const folder = `${padded.slice(0, 3)}000`
  return `https://v2.xivapi.com/api/asset?path=ui/icon/${folder}/${padded}_hr1.tex&format=png`
}

export function projectCraftActionIcons(actionCsv, craftActionCsv) {
  const rows = [
    ...parseCraftActionRows(actionCsv, 'Action.csv'),
    ...parseCraftActionRows(craftActionCsv, 'CraftAction.csv'),
  ]
  const byName = new Map()
  for (const row of rows) {
    const matches = byName.get(row.name) ?? []
    matches.push(row)
    byName.set(row.name, matches)
  }
  const result = {}
  for (const [job, classJobId] of Object.entries(JOB_ID)) {
    result[job] = {}
    for (const [action, name] of Object.entries(CRAFT_ACTION_NAMES)) {
      const candidates = byName.get(name) ?? []
      const exactIcons = [...new Set(candidates
        .filter(row => row.classJobId === classJobId)
        .map(row => row.iconId))]
      const fallbackIcons = [...new Set(candidates
        .filter(row => row.classJobId === 0)
        .map(row => row.iconId))]
      const icons = exactIcons.length ? exactIcons : fallbackIcons
      if (icons.length !== 1) {
        throw new Error(`${job}/${action}: expected one ${name} icon relation, received ${icons.length}`)
      }
      result[job][action] = xivapiIconUrl(icons[0])
    }
  }
  return result
}

function parseSpecialConditions(csv) {
  const sourceName = 'WKSMissionLotterySpecialCond.csv'
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  const header = parseCsvLine(lines.shift(), 1, sourceName)
  const required = ['#', 'WeatherRequired', 'StartTimeHour', 'EndTimeHour']
  for (const name of required) if (!header.includes(name)) throw new Error(`${sourceName}: missing ${name}`)
  const result = new Map()
  lines.forEach((line, index) => {
    const row = parseCsvLine(line, index + 2, sourceName)
    if (row.length !== header.length) throw new Error(`${sourceName}:${index + 2}: row width mismatch`)
    const get = name => Number(row[header.indexOf(name)])
    const id = get('#')
    if (![id, get('WeatherRequired'), get('StartTimeHour'), get('EndTimeHour')].every(Number.isSafeInteger)) {
      throw new Error(`${sourceName}:${index + 2}: invalid condition`)
    }
    result.set(id, {
      weatherRequired: get('WeatherRequired'),
      startTimeHour: get('StartTimeHour'),
      endTimeHour: get('EndTimeHour'),
    })
  })
  return result
}

function parseMissionRows(csv, specialConditionCsv) {
  const specialConditions = parseSpecialConditions(specialConditionCsv)
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  const header = parseCsvLine(lines.shift(), 1)
  const required = ['#', 'Name', 'WKSMissionRecipe', 'WKSMissionLotterySpecialCond']
  for (const name of required) if (!header.includes(name)) throw new Error(`WKSMissionUnit.csv: missing ${name}`)
  const result = new Map()
  lines.forEach((line, index) => {
    const row = parseCsvLine(line, index + 2)
    if (row.length !== header.length) throw new Error(`WKSMissionUnit.csv:${index + 2}: row width mismatch`)
    const get = name => row[header.indexOf(name)]
    const missionId = Number(get('WKSMissionRecipe'))
    if (!Number.isSafeInteger(missionId) || missionId < 0) throw new Error('invalid mission recipe identity')
    if (missionId === 0) return
    if (result.has(missionId)) throw new Error(`ambiguous mission unit for mission recipe ${missionId}`)
    const specialConditionId = Number(get('WKSMissionLotterySpecialCond'))
    const specialCondition = specialConditions.get(specialConditionId)
    if (!specialCondition) throw new Error(`mission ${missionId}: missing special condition ${specialConditionId}`)
    result.set(missionId, {
      nameEn: get('Name').replace(/[\uE000-\uF8FF]/g, '').trim(),
      timed: specialCondition.startTimeHour !== 0 || specialCondition.endTimeHour !== 0,
      weather: specialCondition.weatherRequired !== 0,
    })
  })
  return result
}

function parseNamedMissionNames(csv, locale) {
  const sourceName = `WKSMissionUnit.${locale}.csv`
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  const header = parseCsvLine(lines.shift(), 1, sourceName)
  for (const name of ['Name', 'WKSMissionRecipe']) if (!header.includes(name)) throw new Error(`${sourceName}: missing ${name}`)
  const result = new Map()
  lines.forEach((line, index) => {
    const row = parseCsvLine(line, index + 2, sourceName)
    const missionId = Number(row[header.indexOf('WKSMissionRecipe')])
    const name = row[header.indexOf('Name')]?.replace(/[\uE000-\uF8FF]/g, '').trim()
    if (missionId > 0 && name) result.set(missionId, name)
  })
  return result
}

function parseNumericMissionNames(csv, locale, recipeColumn) {
  const sourceName = `WKSMissionUnit.${locale}.csv`
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  const header = parseCsvLine(lines.shift(), 1, sourceName)
  const nameIndex = header.indexOf('0')
  const recipeIndex = header.indexOf(recipeColumn)
  if (nameIndex < 0 || recipeIndex < 0) throw new Error(`${sourceName}: unsupported numeric schema`)
  const result = new Map()
  lines.slice(2).forEach((line, index) => {
    const row = parseCsvLine(line, index + 4, sourceName)
    const missionId = Number(row[recipeIndex])
    const name = row[nameIndex]?.replace(/[\uE000-\uF8FF]/g, '').trim()
    if (missionId > 0 && name) result.set(missionId, name)
  })
  return result
}

function localizedMissionNames(sources) {
  return {
    en: parseNamedMissionNames(sources.missionLocaleCsv.en, 'en'),
    ja: parseNamedMissionNames(sources.missionLocaleCsv.ja, 'ja'),
    tw: parseNumericMissionNames(sources.missionLocaleCsv.tw, 'tw', '19'),
    cn: parseNumericMissionNames(sources.missionLocaleCsv.cn, 'cn', '21'),
  }
}

function rank(name) {
  if (name.startsWith('Master:')) return 'master'
  if (name.startsWith('EX+:')) return 'ex-plus'
  if (name.startsWith('EX:')) return 'ex'
  return 'a'
}

function planetForRecipe(recipeId) {
  const match = PLANET_RANGES.find(range => recipeId >= range.firstRecipeId && recipeId <= range.lastRecipeId)
  if (!match) throw new Error(`recipe ${recipeId}: no reviewed planet range`)
  return match.id
}

function names(entry, fallback) {
  const result = {}
  for (const locale of ['tw', 'zh', 'en', 'ja']) {
    if (typeof entry?.[locale] === 'string' && entry[locale].trim()) {
      result[locale === 'zh' ? 'cn' : locale] = entry[locale].trim()
    }
  }
  if (!result.en) result.en = fallback
  return result
}

function iconUrl(entry, iconId) {
  if (entry?.data?.icon) return `https://v2.xivapi.com${entry.data.icon}`
  const padded = String(iconId).padStart(6, '0')
  const folder = `${padded.slice(0, 3)}000`
  return `https://v2.xivapi.com/api/asset?path=ui/icon/${folder}/${padded}_hr1.tex&format=png`
}

const CRAFT_BONUSES = {
  Craftsmanship: 'craftsmanship',
  Control: 'control',
  CP: 'maxCp',
}

function projectConsumables(rows, kind, searchByItem) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${kind}: expected a nonempty source array`)
  return rows.flatMap((row) => {
    if (!Number.isSafeInteger(row.ID) || row.ID <= 0 || !Number.isSafeInteger(row.LevelItem) || row.LevelItem < 0
      || !row.Bonuses || typeof row.Bonuses !== 'object' || Array.isArray(row.Bonuses)) {
      throw new Error(`${kind}: invalid consumable row`)
    }
    const bonuses = Object.entries(CRAFT_BONUSES).flatMap(([sourceKey, stat]) => {
      const bonus = row.Bonuses[sourceKey]
      if (!bonus) return []
      if (![11, 70, 71].includes(bonus.ID) || bonus.Relative !== true
        || !Number.isFinite(bonus.Value) || !Number.isFinite(bonus.ValueHQ)
        || !Number.isFinite(bonus.Max) || !Number.isFinite(bonus.MaxHQ)) {
        throw new Error(`${kind} ${row.ID}: invalid ${sourceKey} bonus`)
      }
      return [{
        stat,
        relative: true,
        nq: { percent: bonus.Value, max: bonus.Max },
        hq: { percent: bonus.ValueHQ, max: bonus.MaxHQ },
      }]
    })
    if (!bonuses.length) return []
    const upstream = searchByItem.get(row.ID)
    if (!upstream) throw new Error(`${kind} ${row.ID}: missing Teamcraft item-search metadata`)
    return [{
      itemId: row.ID,
      itemLevel: row.LevelItem,
      names: names(upstream, String(upstream.en ?? row.ID)),
      icon: iconUrl(upstream, Number(upstream.iconId)),
      bonuses,
    }]
  }).sort((a, b) => a.itemLevel - b.itemLevel || a.itemId - b.itemId)
}

export function projectMissionData({ recipes, source, sources }) {
  if (!Array.isArray(recipes) || recipes.length !== source.recipeCount) throw new Error('invalid canonical catalog')
  const searchByItem = new Map()
  for (const entry of sources['item-search.index']) {
    const id = Number(entry.data?.itemId ?? entry.id)
    if (!Number.isSafeInteger(id)) continue
    const previous = searchByItem.get(id)
    if (!previous || entry.data?.recipe) searchByItem.set(id, entry)
  }
  const missionRows = parseMissionRows(sources.missionCsv, sources.missionSpecialConditionCsv)
  const missionNames = localizedMissionNames(sources)
  const groups = new Map()
  const teamcraftItemIds = new Set()
  for (const recipe of recipes) {
    for (let index = 0; index < recipe.missionIds.length; index += 1) {
      const missionId = recipe.missionIds[index]
      const missionRow = missionRows.get(missionId)
      if (!missionRow) throw new Error(`mission ${missionId}: missing WKSMissionUnit row`)
      const expectedName = recipe.missionNamesEn[index]
      if (missionRow.nameEn !== expectedName) throw new Error(`mission ${missionId}: canonical name mismatch`)
      const planet = planetForRecipe(recipe.recipeId)
      const group = groups.get(missionId) ?? {
        id: missionId,
        names: Object.fromEntries(Object.entries(missionNames).flatMap(([locale, values]) => {
          const name = values.get(missionId)
          return name ? [[locale, name]] : []
        })),
        job: recipe.job,
        jobId: JOB_ID[recipe.job],
        jobIcon: `${XIVAPI_JOB_ICON_BASE}${recipe.job}.png`,
        rank: rank(expectedName),
        planet,
        types: [
          ...(missionRow.timed ? ['timed'] : []),
          ...(missionRow.weather ? ['weather'] : []),
        ],
        items: [],
      }
      if (group.job !== recipe.job || group.planet !== planet) {
        throw new Error(`mission ${missionId}: recipes disagree on job or planet`)
      }
      const upstream = searchByItem.get(recipe.itemId)
      if (upstream) teamcraftItemIds.add(recipe.itemId)
      group.items.push({
        recipeId: recipe.recipeId,
        itemId: recipe.itemId,
        names: names(upstream, recipe.nameEn),
        icon: iconUrl(upstream, recipe.itemIconId),
      })
      groups.set(missionId, group)
    }
  }
  const missions = [...groups.values()].sort((a, b) => a.id - b.id)
  for (const mission of missions) mission.items.sort((a, b) => a.recipeId - b.recipeId)
  const catalogItemIds = new Set(recipes.map(recipe => recipe.itemId))
  const food = projectConsumables(sources['foods.json'], 'food', searchByItem)
  const medicine = projectConsumables(sources['medicines.json'], 'medicine', searchByItem)
  const actionIcons = projectCraftActionIcons(sources.actionCsv, sources.craftActionCsv)
  return {
    bundle: {
      formatVersion: FORMAT_VERSION,
      catalogIdentity: source.catalogIdentitySha256,
      missions,
      consumables: { food, medicine },
      actionIcons,
    },
    diagnostics: {
      missionCount: missions.length,
      itemCount: catalogItemIds.size,
      teamcraftItems: teamcraftItemIds.size,
      canonicalFallbackItems: catalogItemIds.size - teamcraftItemIds.size,
      craftingFoods: food.length,
      craftingMedicines: medicine.length,
      craftingActionIcons: Object.values(actionIcons).reduce((count, icons) => count + Object.keys(icons).length, 0),
      missionLocaleNames: Object.fromEntries(Object.entries(missionNames).map(([locale, values]) => [
        locale,
        missions.filter(mission => values.has(mission.id)).length,
      ])),
    },
  }
}
