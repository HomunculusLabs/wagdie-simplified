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

export function FeatureCard({ title, description, imageSrc, href, cta, isExternal }: FeatureCardProps) {
  const card = (
    <Card className="h-full overflow-hidden transition-all duration-500 hover:border-soul-accent/40 hover:shadow-[0_0_30px_rgba(200,170,110,0.1)] bg-black/40 flex flex-col">
      <div className="relative h-48 overflow-hidden border-b border-neutral-900">
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover grayscale-[50%] contrast-125 group-hover:grayscale-0 group-hover:scale-105 transition-all duration-1000 ease-out"
        />
        <div className="absolute inset-0 bg-black/40 opacity-80" />
        {isExternal && (
          <div className="absolute top-2 right-2">
            <Badge variant="outline">External</Badge>
          </div>
        )}
      </div>
      <CardHeader className="relative z-10 -mt-8 pt-0">
        <CardTitle className="text-h4 group-hover:text-soul-accent transition-colors duration-300 drop-shadow-md">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-5">
        <CardDescription className="text-neutral-500 leading-relaxed text-body flex-1">
          {description}
        </CardDescription>
        <span className="text-sm uppercase tracking-[0.22em] text-soul-accent/80 font-eskapade">
          {cta}
        </span>
      </CardContent>
      <div className="h-0.5 w-0 bg-soul-accent group-hover:w-full transition-all duration-700 ease-in-out" />
    </Card>
  );

  const className = 'block group h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-soul-accent focus-visible:ring-offset-2 focus-visible:ring-offset-soul-950';

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
