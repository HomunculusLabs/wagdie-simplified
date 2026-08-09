import type { ReactNode } from 'react';

export interface EditorialHeadingProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  align?: 'left' | 'center';
  id?: string;
  className?: string;
}

/**
 * Semantic editorial heading shared by redesigned public surfaces.
 * Visual treatment is intentionally independent from the chosen heading level.
 */
export function EditorialHeading({
  eyebrow,
  title,
  description,
  headingLevel = 1,
  align = 'left',
  id,
  className = '',
}: EditorialHeadingProps) {
  const Heading = `h${headingLevel}` as const;
  const alignment = align === 'center'
    ? 'mx-auto items-center text-center'
    : 'items-start text-left';

  return (
    <div className={`flex max-w-4xl flex-col ${alignment} ${className}`}>
      {eyebrow && (
        <div className="mb-3 font-ui text-xs uppercase tracking-[0.3em] text-arcane-bright">
          {eyebrow}
        </div>
      )}
      <Heading
        id={id}
        className="text-balance font-display text-4xl leading-tight text-parchment sm:text-5xl lg:text-6xl"
      >
        {title}
      </Heading>
      {description && (
        <div className="mt-5 max-w-2xl font-ui text-base leading-relaxed text-ash sm:text-lg">
          {description}
        </div>
      )}
    </div>
  );
}
