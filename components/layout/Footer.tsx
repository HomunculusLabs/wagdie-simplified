import { Globe2, MessageCircle, Twitter } from 'lucide-react';

const EXTERNAL_LINKS = [
  {
    label: 'OpenSea',
    url: process.env.NEXT_PUBLIC_OPENSEA_URL || 'https://opensea.io/collection/we-are-all-going-to-die',
    Icon: Globe2,
  },
  {
    label: 'Discord',
    url: process.env.NEXT_PUBLIC_DISCORD_URL || 'https://discord.gg/wagdie',
    Icon: MessageCircle,
  },
  {
    label: 'X / Twitter',
    url: process.env.NEXT_PUBLIC_TWITTER_URL || 'https://twitter.com/WAGDIE_ETH',
    Icon: Twitter,
  },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative mt-auto border-t border-parchment/15 bg-soul-950">
      <div className="mx-auto flex min-h-44 w-full max-w-[1920px] flex-col items-center justify-center px-4 py-8">
        <nav className="flex items-center justify-center gap-6" aria-label="Community links">
          {EXTERNAL_LINKS.map(({ label, url, Icon }) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${label} (opens in a new tab)`}
              className="flex h-11 w-11 items-center justify-center text-bone transition-colors hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
            >
              <Icon className="h-8 w-8" aria-hidden="true" />
            </a>
          ))}
        </nav>
        <p className="mt-4 text-center font-ui text-[10px] text-mist">
          ©{String(currentYear).slice(-2)} WAGDIE. Community-driven dark fantasy NFT project.
        </p>
      </div>
    </footer>
  );
}
