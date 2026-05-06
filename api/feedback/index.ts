import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

interface FeedbackPayload {
  type: 'bug' | 'feature' | 'data' | 'general'
  message: string
  trailId?: string
  url?: string
  userAgent?: string
  createdAt: string
}

async function feedbackHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log('Feedback function triggered')

  const token   = process.env['GITHUB_TOKEN']
  const owner   = process.env['GITHUB_OWNER']
  const repo    = process.env['GITHUB_REPO']
  const labels  = (process.env['GITHUB_LABELS'] ?? 'feedback').split(',').map(l => l.trim())

  if (!token || !owner || !repo) {
    context.error('Missing GitHub env vars')
    return { status: 500, jsonBody: { ok: false, error: 'Server misconfiguration' } }
  }

  let body: FeedbackPayload
  try {
    body = await req.json() as FeedbackPayload
  } catch {
    return { status: 400, jsonBody: { ok: false, error: 'Invalid JSON' } }
  }

  if (!body.message?.trim()) {
    return { status: 400, jsonBody: { ok: false, error: 'Message is required' } }
  }

  const issueTitle = `[${body.type}] ${body.message.slice(0, 60)}${body.message.length > 60 ? '…' : ''}`
  const issueBody = [
    `**Type:** ${body.type}`,
    `**Message:**\n${body.message}`,
    body.trailId ? `**Trail ID:** ${body.trailId}` : null,
    body.url      ? `**URL:** ${body.url}` : null,
    `**Submitted:** ${body.createdAt}`,
    body.userAgent ? `**User Agent:** ${body.userAgent}` : null,
  ].filter(Boolean).join('\n\n')

  const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ title: issueTitle, body: issueBody, labels }),
  })

  if (!ghRes.ok) {
    const err = await ghRes.text()
    context.error('GitHub API error', err)
    return { status: 502, jsonBody: { ok: false, error: 'Failed to create GitHub issue' } }
  }

  const issue = await ghRes.json() as { html_url: string }
  return { status: 200, jsonBody: { ok: true, issueUrl: issue.html_url } }
}

app.http('feedback', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: feedbackHandler,
})
