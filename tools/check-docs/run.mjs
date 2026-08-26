import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const decoder = new TextDecoder('utf-8', { fatal: true })
const errors = []

function repositoryMarkdownFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.md'],
    { cwd: repositoryRoot, encoding: 'utf8' },
  )

  return [...new Set(output.split(/\r?\n/u).filter(Boolean))]
    .filter((path) => existsSync(resolve(repositoryRoot, path)))
    .sort()
}

function displayPath(path) {
  return path.replaceAll('\\', '/')
}

function isArchive(path) {
  return displayPath(path).startsWith('.agents/archive/')
}

function isStyleExempt(path) {
  const portable = displayPath(path)
  return isArchive(path)
    || portable === 'README.md'
    || portable === 'THIRD_PARTY_NOTICES.md'
}

function report(path, message) {
  errors.push(displayPath(path) + ': ' + message)
}

function decodeMarkdown(path) {
  const bytes = readFileSync(resolve(repositoryRoot, path))
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    report(path, 'UTF-8 BOM is not allowed')
  }

  try {
    return decoder.decode(bytes)
  } catch (error) {
    report(path, 'invalid UTF-8: ' + (error instanceof Error ? error.message : String(error)))
    return ''
  }
}

function checkRelativeLinks(path, text) {
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu
  for (const match of text.matchAll(linkPattern)) {
    let target = match[1].trim()
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
    if (!target || /^(?:https?:|mailto:|data:|#)/iu.test(target)) continue

    const pathPart = target.split('#', 1)[0]
    if (!pathPart || isAbsolute(pathPart)) continue

    let decoded
    try {
      decoded = decodeURIComponent(pathPart)
    } catch {
      report(path, 'link has invalid percent encoding: ' + target)
      continue
    }

    const resolved = normalize(resolve(repositoryRoot, dirname(path), decoded))
    if (!resolved.startsWith(repositoryRoot) || !existsSync(resolved)) {
      report(path, 'broken relative link: ' + target)
      continue
    }

    if (target.endsWith('/') && !statSync(resolved).isDirectory()) {
      report(path, 'directory link points to a file: ' + target)
    }
  }
}

function checkStyle(path, text) {
  if (isStyleExempt(path)) return

  const lines = text.replaceAll('\r\n', '\n').split('\n')
  let h1Count = 0
  let openFence = null
  lines.forEach((line, index) => {
    if (/[ \t]+$/u.test(line)) report(path, 'trailing whitespace on line ' + (index + 1))

    const match = line.match(/^\s*((?:\x60){3,}|~{3,})/u)
    if (match) {
      const marker = match[1][0]
      const length = match[1].length
      if (!openFence) openFence = { marker, length, line: index + 1 }
      else if (openFence.marker === marker && length >= openFence.length) openFence = null
      return
    }

    if (!openFence && /^# (?!#)/u.test(line)) h1Count += 1
  })

  if (h1Count !== 1) report(path, 'expected exactly one H1, found ' + h1Count)
  if (openFence) report(path, 'unclosed code fence opened on line ' + openFence.line)
}

function checkArchive(path, text) {
  if (!isArchive(path) || displayPath(path) === '.agents/archive/README.md') return
  if (!text.startsWith('<!-- doc-status: archived -->')) {
    report(path, 'archive file must start with <!-- doc-status: archived -->')
  }
}

function checkVolatileStatus(path, text) {
  const portable = displayPath(path)
  if (portable === '.agents/current_state.md' || isArchive(path) || portable === 'README.md') return
  if (/last_verified\s*:/u.test(text)) {
    report(path, 'repository-wide last_verified belongs only in .agents/current_state.md')
  }
}

const redirectPaths = [
  '.agents/research/solver_growth_scorecard.md',
  '.agents/roadmaps/poc_implementation_plan.md',
  'cosmic-expert-crafting-solver-poc-handoff.md',
  'expert-crafting-training-handoff-2026-08-11.md',
  'solver-productization-handoff-2026-08-14.md',
]

const requiredPaths = [
  'AGENTS.md',
  '.agents/current_state.md',
  '.agents/glossary.md',
  '.agents/skills/core/operating_contract.md',
  '.agents/skills/core/documentation_governance.md',
  '.agents/archive/README.md',
]

for (const required of requiredPaths) {
  if (!existsSync(resolve(repositoryRoot, required))) report(required, 'required document is missing')
}

const files = repositoryMarkdownFiles()
for (const path of files) {
  const text = decodeMarkdown(path)
  checkRelativeLinks(path, text)
  checkStyle(path, text)
  checkArchive(path, text)
  checkVolatileStatus(path, text)
}

for (const path of redirectPaths) {
  const resolved = resolve(repositoryRoot, path)
  if (!existsSync(resolved)) {
    report(path, 'archive redirect is missing')
    continue
  }
  const text = decodeMarkdown(path)
  if (!text.includes('已封存') || !text.includes('archive')) {
    report(path, 'archive redirect must identify itself and link to archive')
  }
}

if (errors.length > 0) {
  process.stderr.write('docs:check failed with ' + errors.length + ' error(s):\n')
  for (const error of errors) process.stderr.write('- ' + error + '\n')
  process.exitCode = 1
} else {
  process.stdout.write('docs:check passed (' + files.length + ' Markdown files)\n')
}
