/**
 * 404 Not Found Page
 */

import Link from 'next/link'
import { EditorialHeading } from '@/components/shared/EditorialHeading'

const linkClassName = 'inline-flex min-h-11 items-center justify-center border px-6 py-2 font-ui transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment focus-visible:ring-offset-2 focus-visible:ring-offset-soul-950'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-soul-950 px-4 py-16 text-bone">
      <section className="w-full max-w-2xl border border-midnight-light/60 bg-midnight/45 px-5 py-10 text-center shadow-2xl sm:px-10 sm:py-14" aria-labelledby="not-found-heading">
        <p className="font-display text-7xl leading-none text-parchment sm:text-8xl" aria-hidden="true">404</p>
        <EditorialHeading
          eyebrow="Lost in the abyss"
          title="Page Not Found"
          description="The page you’re looking for has ventured too deep into the abyss. Return home or continue with the NFT collection."
          id="not-found-heading"
          align="center"
          className="mt-6"
        />

        <nav className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:gap-4" aria-label="Not found recovery">
          <Link
            href="/"
            className={`${linkClassName} border-parchment/50 bg-soul-900/80 text-parchment hover:border-parchment hover:bg-parchment/10`}
          >
            Return Home
          </Link>
          <Link
            href="/characters"
            className={`${linkClassName} border-arcane-muted/60 text-ash hover:border-arcane-bright hover:text-parchment`}
          >
            Browse Characters
          </Link>
        </nav>
      </section>
    </div>
  )
}
