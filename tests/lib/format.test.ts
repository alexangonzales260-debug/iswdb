import { describe, expect, it } from 'vitest'
import { truncarEmail } from '@/lib/format'

describe('truncarEmail (RES-08)', () => {
  it('inicial + *** + @dominio', () => {
    expect(truncarEmail('someone@iswdb.local')).toBe('s***@iswdb.local')
    expect(truncarEmail('Leonardo@Example.com')).toBe('L***@Example.com')
  })

  it('local part corto (1-2 chars)', () => {
    expect(truncarEmail('a@x.com')).toBe('a***@x.com')
    expect(truncarEmail('ab@iswdb.local')).toBe('a***@iswdb.local')
  })

  it('email sin local part o sin @ → ***', () => {
    expect(truncarEmail('@iswdb.local')).toBe('***')
    expect(truncarEmail('sin-arroba')).toBe('***')
    expect(truncarEmail('')).toBe('***')
  })
})
