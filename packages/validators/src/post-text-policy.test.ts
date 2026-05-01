import { describe, expect, it } from 'bun:test'

import { analyzePostPlaintext } from './post-text-policy.ts'

describe('analyzePostPlaintext', () => {
  it('allows casual profanity', () => {
    expect(analyzePostPlaintext(['ugh fuck this deploy'])).toEqual({ action: 'allow' })
    expect(analyzePostPlaintext(['stfu and ship'])).toEqual({ action: 'allow' })
  })

  it('flags standalone jew but not jewish jewelry', () => {
    expect(analyzePostPlaintext(['jew'])).toEqual({ action: 'flag', reason: 'policy_slur_or_hate' })
    expect(analyzePostPlaintext(['jewish deli'])).toEqual({ action: 'allow' })
    expect(analyzePostPlaintext(['jewelry shop'])).toEqual({ action: 'allow' })
  })

  it('allows discussion that references the phenomenon without spelling the word', () => {
    expect(analyzePostPlaintext(["they condemned the racial slur"])).toEqual({ action: 'allow' })
    expect(analyzePostPlaintext(['nigger']).action).toBe('block')
  })

  it('flags reclaimed / soft variant without blocking', () => {
    expect(analyzePostPlaintext(['nigga']).action).toBe('flag')
  })

  it('blocks csam-associated stems broadly', () => {
    expect(analyzePostPlaintext(['anything pedophilia-related']).action).toBe('block')
  })

  it('combines poll options when joining parts', () => {
    expect(
      analyzePostPlaintext(["hello", "", "jew"]).action,
    ).toBe('flag')
    expect(analyzePostPlaintext(["fine", "", "jewish"]).action).toBe('allow')
  })

  it('does not falsely flag bastard via tard heuristic', () => {
    expect(analyzePostPlaintext(['you bastard']).action).toBe('allow')
  })
})
