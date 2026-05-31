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
  const variantClassName = variant === 'primary'
    ? 'bg-soul-900 border-soul-accent/40 text-soul-accent hover:bg-soul-accent/10 hover:border-soul-accent hover:shadow-soul-glow'
    : 'bg-transparent border-midnight-light text-ash hover:border-mist hover:text-bone';
  const classes = `relative inline-flex items-center justify-center font-eskapade transition-all duration-300 border overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-accent focus-visible:ring-offset-2 focus-visible:ring-offset-soul-950 ${variantClassName} ${className}`;

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
