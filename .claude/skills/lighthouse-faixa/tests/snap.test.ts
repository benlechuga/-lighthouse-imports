import { describe as group, expect, test } from 'claude-code/testing'

import { countPending, countUnpushed, describe } from '../hooks/snap'

group('lighthouse-faixa: texto da faixa', () => {
  test('conta mudanças e commits sem push', () => {
    expect(countPending(' M index.html\n?? x.png\n')).toBe(2)
    expect(countPending('')).toBe(0)
    expect(countUnpushed('3\t1')).toBe(3)
    expect(countUnpushed('')).toBe(0)
  })

  test('árvore limpa e publicada lê como publicado', () => {
    const { text, isClean } = describe({ branch: 'main', pending: 0, unpushed: 0, lastCommit: '2 hours ago', at: 0 })
    expect(isClean).toBe(true)
    expect(text).toBe('⚓ main · publicado ✅ · último: 2 hours ago')
  })

  test('mudanças pendentes lêem como não publicado', () => {
    const { text, isClean } = describe({ branch: 'main', pending: 2, unpushed: 1, lastCommit: '', at: 0 })
    expect(isClean).toBe(false)
    expect(text).toBe('⚓ main · 2 mudanças · 1 commit sem push · não publicado ⏳')
  })
})
