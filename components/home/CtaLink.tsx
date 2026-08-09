import type { ReactNode } from 'react';
import Link from 'next/link';

interface CtaLinkProps {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  isExternal?: boolean;
  className?: string;
}

export function CtaLink({ href, children, variant = 'primary', isExternal, className = '' }: CtaLinkProps) {
  // Primary CTA carries the gold/parchment accent; secondary carries the arcane/purple accent.
  // Both keep the UI-font role (controls), 44px+ targets are supplied by the consumer height class.
  const variantClassName = variant === 'primary'
    ? 'bg-soul-900/80 border-parchment/50 text-parchment hover:bg-parchment/10 hover:border-parchment hover:shadow-soul-glow'
    : 'bg-transparent border-arcane-muted/60 text-ash hover:border-arcane-bright hover:text-bone';
  const classes = `relative inline-flex items-center justify-center font-ui tracking-wide transition-all duration-300 border overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-parchment focus-visible:ring-offset-2 focus-visible:ring-offset-soul-950 ${variantClassName} ${className}`;

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
