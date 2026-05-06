import { describe, it, expect, beforeEach } from 'vitest'

// Mock browser globals before importing
beforeEach(() => {
  Object.defineProperty(window, 'location', { value: { href: 'http://localhost:3000/test' }, writable: true })
  Object.defineProperty(navigator, 'userAgent', { value: 'TestAgent/1.0', writable: true })
})

// Dynamic import so mocks are in place
const { buildFeedbackPayload } = await import('../services/feedbackClient')

describe('buildFeedbackPayload', () => {
  it('includes required fields', () => {
    const p = buildFeedbackPayload('bug', 'Something broke')
    expect(p.type).toBe('bug')
    expect(p.message).toBe('Something broke')
    expect(p.url).toBeDefined()
    expect(p.createdAt).toBeDefined()
    expect(p.userAgent).toBeDefined()
  })

  it('trailId is included when provided', () => {
    const p = buildFeedbackPayload('data', 'Wrong pass info', 'wa-005')
    expect(p.trailId).toBe('wa-005')
  })

  it('trailId is undefined when not provided', () => {
    const p = buildFeedbackPayload('general', 'Great app')
    expect(p.trailId).toBeUndefined()
  })

  it('trims message whitespace', () => {
    const p = buildFeedbackPayload('feature', '  Add dark mode  ')
    expect(p.message).toBe('Add dark mode')
  })

  it('createdAt is a valid ISO string', () => {
    const p = buildFeedbackPayload('general', 'test')
    expect(() => new Date(p.createdAt)).not.toThrow()
    expect(new Date(p.createdAt).toISOString()).toBe(p.createdAt)
  })
})
