export function LoadingSpinner({ message = 'Loading trails…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 bg-trail-bg">
      <div className="w-10 h-10 border-4 border-trail-green/20 border-t-trail-green rounded-full animate-spin" />
      <p className="text-sm text-trail-stone font-body">{message}</p>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 bg-trail-bg px-6 text-center">
      <span className="text-4xl">⚠️</span>
      <p className="font-display font-semibold text-trail-dark">Something went wrong</p>
      <p className="text-sm text-trail-stone font-body">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-2 bg-trail-green text-white font-body font-medium text-sm rounded-full px-5 py-2.5">
          Try again
        </button>
      )}
    </div>
  )
}
