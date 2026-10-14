import { describe, expect, test } from 'claude-code/testing'

import { judge } from '../hooks/rules'

describe('lighthouse-guardiao: regras', () => {
  test('bloqueia o que destrói', () => {
    for (const command of [
      'git push --force origin main',
      'git push -f',
      'git push origin main --force-with-lease',
      'git reset --hard HEAD~1',
      'git checkout -- .',
      'git restore .',
      'git clean -fd',
      'git branch -D main',
      'rm -rf node_modules',
      'rm -rf /',
      'cd x && rm -r build',
      'rm index.html',
      'rm -f styles.css script.js',
      'git rm sitemap.xml',
    ]) {
      expect(judge(command), command).toBeDefined()
    }
  })

  test('deixa passar o trabalho normal', () => {
    for (const command of [
      'git status',
      'git push -u origin feature',
      'git push origin main',
      'git checkout -b nova',
      'git restore --staged index.html',
      'git branch -d velha',
      'rm -rf /tmp/claude-0/scratch/build',
      'rm notas.txt',
      'ls -la',
      'grep -rf padrao.txt .',
      'echo "rm -rf" > /dev/null',
    ]) {
      expect(judge(command), command).toBeUndefined()
    }
  })
})

describe('lighthouse-guardiao: no motor', () => {
  test('um push forçado não chega ao fundo, um push normal chega', async ($, on) => {
    on('tool.call', { tool: 'Bash' }, () => ({ deny: 'fundo alcançado' }))

    const blocked = await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })
    expect(String(blocked.deny ?? blocked.text ?? '')).toContain('Guardião Lighthouse')

    const passed = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
    expect(String(passed.deny ?? passed.text ?? '')).toContain('fundo alcançado')
  })
})
