import Image from 'next/image';
import Link from 'next/link';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';

interface FeatureCardProps {
  title: string;
  description: string;
  imageSrc: string;
  href: string;
  cta: string;
  isExternal?: boolean;
}

/**
 * Static presentation card for homepage live systems and community destinations.
 * It never accepts lore/event DTOs — callers pass plain copy and an image only.
 */
export function FeatureCard({ title, description, imageSrc, href, cta, isExternal }: FeatureCardProps) {
  const card = (
    <Card className="flex h-full flex-col overflow-hidden rounded-none border-midnight-light/70 bg-midnight/45 transition-all duration-500 hover:border-parchment/40 hover:shadow-[0_0_30px_rgba(233,199,147,0.12)]">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-midnight-light/70">
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover contrast-110 transition-all duration-1000 ease-out group-hover:scale-105"
        />
        {/* Decorative scrim tying the imagery into the soul surface */}
        <div className="absolute inset-0 bg-gradient-to-t from-soul-950 via-soul-950/30 to-transparent opacity-90" aria-hidden="true" />
        {isExternal && (
          <div className="absolute top-2 right-2">
            <Badge variant="outline">External</Badge>
          </div>
        )}
      </div>
      <CardHeader className="relative z-10 px-5 pb-2 pt-5">
        <CardTitle className="font-display text-2xl text-parchment transition-colors duration-300 group-hover:text-bone">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 px-5 pb-5">
        <CardDescription className="flex-1 font-ui text-sm leading-6 text-ash">
          {description}
        </CardDescription>
        <span className="font-ui text-xs uppercase tracking-[0.22em] text-arcane-bright">
          {cta}
        </span>
      </CardContent>
      <div className="h-0.5 w-0 bg-parchment group-hover:w-full transition-all duration-700 ease-in-out" />
    </Card>
  );

  const className = 'block group h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-parchment focus-visible:ring-offset-2 focus-visible:ring-offset-soul-950';

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {card}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {card}
    </Link>
  );
}
