import type { ReactNode } from 'react';
import { EditorialHeading } from '@/components/shared/EditorialHeading';

interface HomeSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

const getHeadingId = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`;

/**
 * Centered editorial section wrapper. Heading semantics are owned by
 * EditorialHeading (always an h2 here) so visual size never dictates level.
 */
export function HomeSection({ title, subtitle, children }: HomeSectionProps) {
  const headingId = getHeadingId(title);

  return (
    <section className="relative mt-8 border border-midnight-light/70 bg-midnight/20 px-4 py-10 sm:px-6 lg:mt-12 lg:px-10 lg:py-12" aria-labelledby={headingId}>
      <div className="mb-9 flex justify-center px-4 lg:mb-10">
        <EditorialHeading
          headingLevel={2}
          align="center"
          id={headingId}
          title={title}
          description={subtitle}
        />
      </div>

      {/* Fixed responsive columns reflow cleanly when a persistent dock narrows content. */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {children}
      </div>
    </section>
  );
}
