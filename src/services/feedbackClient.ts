import type { FeedbackPayload } from '../domain/types'

export function buildFeedbackPayload(
  type: string,
  message: string,
  trailId?: string
): FeedbackPayload {
  return {
    type: type as FeedbackPayload['type'],
    message: message.trim(),
    trailId: trailId ?? undefined,
    url: window.location.href,
    userAgent: navigator.userAgent,
    createdAt: new Date().toISOString(),
  }
}

export async function submitFeedback(payload: FeedbackPayload): Promise<{ ok: boolean; issueUrl?: string; error?: string }> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json() as { ok: boolean; issueUrl?: string; error?: string }
  return data
}
