import { useState } from 'react'
import { buildFeedbackPayload, submitFeedback } from '../../services/feedbackClient'
import { useUiStore } from '../../state/useUiStore'
import type { FeedbackType } from '../../domain/types'

type Status = 'idle' | 'submitting' | 'success' | 'error'

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { selectedTrailId } = useUiStore()
  const [type, setType] = useState<FeedbackType>('general')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [issueUrl, setIssueUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const submit = async () => {
    if (!message.trim()) return
    setStatus('submitting')
    try {
      const payload = buildFeedbackPayload(type, message, selectedTrailId ?? undefined)
      const result = await submitFeedback(payload)
      if (result.ok) {
        setStatus('success')
        setIssueUrl(result.issueUrl ?? null)
      } else {
        setStatus('error')
        setErrorMsg(result.error ?? 'Something went wrong')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Could not reach the server')
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-display font-bold text-trail-dark text-lg">Send Feedback</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">✕</button>
        </div>

        {status === 'success' ? (
          <div className="p-6 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <p className="font-display font-semibold text-trail-dark mb-1">Thanks for the feedback!</p>
            {issueUrl && (
              <a href={issueUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm text-trail-green underline break-all">View issue on GitHub →</a>
            )}
            <button onClick={onClose} className="mt-4 w-full bg-trail-green text-white rounded-2xl py-3 font-display font-semibold">
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-sm font-body font-medium text-trail-dark block mb-1.5">Type</label>
              <select value={type} onChange={e => setType(e.target.value as FeedbackType)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-trail-green/30">
                <option value="general">General</option>
                <option value="bug">Bug</option>
                <option value="feature">Feature request</option>
                <option value="data">Trail data issue</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-body font-medium text-trail-dark block mb-1.5">Message <span className="text-red-500">*</span></label>
              <textarea
                value={message} onChange={e => setMessage(e.target.value)}
                placeholder="Describe the issue or idea..."
                rows={4}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-trail-green/30 resize-none"
              />
            </div>
            {status === 'error' && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">⚠️ {errorMsg}</p>
            )}
            <button
              onClick={submit}
              disabled={!message.trim() || status === 'submitting'}
              className="w-full bg-trail-green text-white font-display font-semibold rounded-2xl py-3.5 disabled:opacity-50 hover:bg-trail-dark transition-colors"
            >
              {status === 'submitting' ? '⏳ Sending…' : 'Send Feedback'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[60] bg-trail-dark text-white font-body font-medium text-sm rounded-full px-4 py-2.5 shadow-lg hover:bg-trail-green transition-colors flex items-center gap-1.5"
      >
        💬 Feedback
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  )
}
