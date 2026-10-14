import { describe, expect, test } from 'claude-code/testing'

import { checkSite, localRefs, report, sitemapLocs } from '../hooks/checks'
import type { Site } from '../hooks/checks'

const GOOD_HTML = `<!doctype html><html lang="pt-BR"><head>
<meta name="viewport" content="width=device-width">
<title>Lighthouse Imports</title>
<meta name="description" content="Calcule o valor final nacionalizado">
<link rel="canonical" href="https://lighthouseimports.com.br/">
<meta property="og:title" content="Lighthouse Imports">
<meta property="og:image" content="https://lighthouseimports.com.br/og-image.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="styles.css?v=3">
<link rel="icon" href="/favicon.svg">
</head><body><img src="./icon-192.png"><a href="https://calc.lighthouseimports.com.br">Calcular</a>
<a href="#planos">Planos</a><a href="mailto:oi@x.com">x</a><script src="script.js"></script></body></html>`

function fake(files: Record<string, string>): Site {
  return {
    read: async path => files[path] ?? null,
    exists: async path => path in files,
    checkJs: async () => null,
  }
}

const FULL: Record<string, string> = {
  'index.html': GOOD_HTML,
  'styles.css': 'body{}',
  'favicon.svg': '<svg/>',
  'icon-192.png': 'x',
  'icon-512.png': 'x',
  'site.webmanifest': '{"icons":[{"src":"/icon-192.png"},{"src":"/icon-512.png"}]}',
  'script.js': 'console.log(1)',
  'sitemap.xml': '<urlset><url><loc>https://lighthouseimports.com.br/</loc></url></urlset>',
  'robots.txt': 'User-agent: *\nAllow: /\nSitemap: https://lighthouseimports.com.br/sitemap.xml',
  'vercel.json': '{"headers":[]}',
}

describe('lighthouse-site-check', () => {
  test('localRefs pega só os arquivos locais', () => {
    expect(localRefs(GOOD_HTML).sort()).toEqual(['favicon.svg', 'icon-192.png', 'script.js', 'site.webmanifest', 'styles.css'])
  })

  test('sitemapLocs lê as URLs', () => {
    expect(sitemapLocs(FULL['sitemap.xml'] ?? '')).toEqual(['https://lighthouseimports.com.br/'])
  })

  test('um site completo não tem erro nem aviso', async () => {
    const findings = await checkSite(fake(FULL))
    expect(findings.filter(f => f.level !== 'ok')).toEqual([])
    expect(report(findings)).toContain('Site OK')
  })

  test('arquivo referenciado que sumiu e JSON quebrado viram erro', async () => {
    const files: Record<string, string> = { ...FULL, 'vercel.json': '{oops' }
    delete files['styles.css']
    const findings = await checkSite(fake(files))
    const errors = findings.filter(f => f.level === 'erro').map(f => f.text)
    expect(errors.some(t => t.includes('styles.css'))).toBe(true)
    expect(errors.some(t => t.startsWith('vercel.json não é JSON'))).toBe(true)
    expect(report(findings)).toContain('2 erros')
  })

  test('robots que bloqueia tudo é erro', async () => {
    const findings = await checkSite(fake({ ...FULL, 'robots.txt': 'User-agent: *\nDisallow: /\nSitemap: https://x.com/sitemap.xml' }))
    expect(findings.some(f => f.level === 'erro' && f.text.includes('Disallow'))).toBe(true)
  })
})
