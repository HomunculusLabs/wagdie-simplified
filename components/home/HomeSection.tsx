import type { ReactNode } from 'react';
import { Separator } from '@/components/ui';

interface HomeSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

const getHeadingId = (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`;

export function HomeSection({ title, subtitle, children }: HomeSectionProps) {
  const headingId = getHeadingId(title);

  return (
    <section className="py-24 relative" aria-labelledby={headingId}>
      <div className="flex flex-col items-center mb-16 text-center space-y-4">
        <div className="flex items-center gap-4 w-full max-w-md opacity-50" aria-hidden="true">
          <Separator className="flex-1" />
          <div className="w-2 h-2 rotate-45 border border-soul-accent" />
          <Separator className="flex-1" />
        </div>
        <h2 id={headingId} className="text-h2 font-display text-neutral-200">
          {title}
        </h2>
        {subtitle && (
          <p className="text-soul-accent/60 italic text-body max-w-2xl font-eskapade">
            {subtitle}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {children}
      </div>
    </section>
  );
}
