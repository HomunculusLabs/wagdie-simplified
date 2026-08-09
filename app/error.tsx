/**
 * Error Boundary
 * Catches component errors and provides reset functionality
 */

'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { EditorialHeading } from '@/components/shared/EditorialHeading'
import { Button } from '@/components/ui'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Error boundary caught:', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-soul-950 px-4 py-16 text-bone">
      <section className="w-full max-w-2xl border border-midnight-light/60 bg-midnight/45 px-5 py-10 shadow-2xl sm:px-10 sm:py-14" aria-labelledby="error-heading">
        <EditorialHeading
          eyebrow="The path was interrupted"
          title="Something went wrong"
          description="An unexpected error occurred. Try this view again, or return home without changing your wallet or saved state."
          id="error-heading"
          align="center"
        />

        {error.message && (
          <div className="mx-auto mt-8 max-h-40 max-w-xl overflow-auto border border-blood/35 bg-black/35 p-4">
            <p className="break-words font-mono text-sm leading-6 text-ash">{error.message}</p>
          </div>
        )}

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
          <Button onClick={reset} className="min-h-11 font-ui">
            Try Again
          </Button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center border border-midnight-light px-6 py-2 font-ui text-ash transition-colors hover:border-parchment/60 hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment focus-visible:ring-offset-2 focus-visible:ring-offset-soul-950"
          >
            Go Home
          </Link>
        </div>
      </section>
    </div>
  )
}
