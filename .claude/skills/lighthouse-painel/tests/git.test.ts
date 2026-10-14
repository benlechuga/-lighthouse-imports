import { describe, expect, test } from 'claude-code/testing'

import { parseAheadBehind, parseStatus } from '../hooks/git'

describe('lighthouse-painel: leitura do git', () => {
  test('parseStatus traduz o porcelain em mudanças legíveis', () => {
    const changes = parseStatus(' M index.html\n?? novo.png\n D robots.txt\nA  styles.css\n')
    expect(changes).toEqual([
      { kind: 'alterado', path: 'index.html' },
      { kind: 'novo', path: 'novo.png' },
      { kind: 'apagado', path: 'robots.txt' },
      { kind: 'novo', path: 'styles.css' },
    ])
  })

  test('parseStatus com árvore limpa devolve lista vazia', () => {
    expect(parseStatus('')).toEqual([])
    expect(parseStatus('\n')).toEqual([])
  })

  test('parseAheadBehind lê os dois números e tolera a falta de upstream', () => {
    expect(parseAheadBehind('2\t0\n')).toEqual({ ahead: 2, behind: 0 })
    expect(parseAheadBehind('')).toEqual({ ahead: null, behind: null })
  })
})
