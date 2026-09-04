import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../..', import.meta.url))
const webRoot = path.join(root, 'apps', 'web')
const canonicalUrl = 'https://emu-rabbit.github.io/frozen_rabbit_cosmic/'
const publicRoot = path.join(webRoot, 'public')

function requireText(content, expected, label) {
  if (!content.includes(expected)) {
    throw new Error(`${label} is missing: ${expected}`)
  }
}

async function verifyHtml(file) {
  const html = await readFile(file, 'utf8')
  const required = [
    '<meta name="robots" content="index, follow"',
    `<link rel="canonical" href="${canonicalUrl}"`,
    '<link rel="alternate" hreflang="en"',
    '<link rel="alternate" hreflang="zh-TW"',
    '<link rel="alternate" hreflang="zh-Hans"',
    '<link rel="alternate" hreflang="ja"',
    '<link rel="alternate" hreflang="x-default"',
    'property="og:title"',
    'property="og:description"',
    'property="og:image"',
    '<meta name="twitter:card" content="summary_large_image"',
    '<script type="application/ld+json">',
    '<noscript>',
    'Frozen Rabbit\'s Cosmic',
  ]

  for (const item of required) requireText(html, item, path.relative(root, file))

  const structuredData = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
  if (!structuredData) throw new Error(`${path.relative(root, file)} has no JSON-LD payload`)
  const parsed = JSON.parse(structuredData)
  if (parsed['@type'] !== 'WebApplication' || parsed.url !== canonicalUrl) {
    throw new Error(`${path.relative(root, file)} has unexpected JSON-LD identity`)
  }
}

async function verifyPngSize(file, expectedWidth, expectedHeight) {
  const bytes = await readFile(file)
  const pngSignature = '89504e470d0a1a0a'
  if (bytes.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`${path.relative(root, file)} is not a PNG file`)
  }

  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${path.relative(root, file)} must be ${expectedWidth}x${expectedHeight}, got ${width}x${height}`)
  }
}

await verifyHtml(path.join(webRoot, 'index.html'))

const robots = await readFile(path.join(publicRoot, 'robots.txt'), 'utf8')
requireText(robots, 'User-agent: *', 'robots.txt')
requireText(robots, 'Allow: /', 'robots.txt')
requireText(robots, `Sitemap: ${canonicalUrl}sitemap.xml`, 'robots.txt')

const sitemap = await readFile(path.join(publicRoot, 'sitemap.xml'), 'utf8')
requireText(sitemap, `<loc>${canonicalUrl}</loc>`, 'sitemap.xml')
for (const language of ['en', 'zh-TW', 'zh-Hans', 'ja']) {
  requireText(sitemap, `hreflang="${language}"`, 'sitemap.xml')
}

await verifyPngSize(path.join(publicRoot, 'og-cover.png'), 1200, 630)

if (process.argv.includes('--dist')) {
  const distRoot = path.join(webRoot, 'dist')
  await access(distRoot)
  await verifyHtml(path.join(distRoot, 'index.html'))
  await access(path.join(distRoot, 'robots.txt'))
  await access(path.join(distRoot, 'sitemap.xml'))
  await verifyPngSize(path.join(distRoot, 'og-cover.png'), 1200, 630)
}

console.log('SEO metadata, crawler files, and social preview verified.')
