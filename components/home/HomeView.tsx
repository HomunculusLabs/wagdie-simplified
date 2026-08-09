import Image from 'next/image';
import Link from 'next/link';
import { EditorialHeading } from '@/components/shared/EditorialHeading';
import { CtaLink } from './CtaLink';
import { FeatureCard } from './FeatureCard';
import { HomeSection } from './HomeSection';
import { VideoPlayer } from './VideoPlayer';

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL || 'https://discord.gg/wagdie';
const WIKI_URL = 'https://wiki.fateofwagdie.com';

interface HomeViewProps {
  hasVideoConsent: boolean;
  onEnableVideo: () => void;
  showLoreNav: boolean;
}

/**
 * Presentational homepage body based on the desktop XD artboard.
 *
 * The hero keeps the existing consent-safe video behavior, but uses the same
 * illustrated source artwork and full-bleed proportions as the static design.
 */
export function HomeView({ hasVideoConsent, onEnableVideo, showLoreNav }: HomeViewProps) {
  return (
    <>
      <section
        className="relative overflow-hidden border-b border-midnight-light/70 bg-black"
        aria-labelledby="homepage-hero-heading"
      >
        <div className="relative mx-auto aspect-[2000/1030] min-h-[28rem] w-full max-w-[1920px] overflow-hidden sm:min-h-[34rem] lg:min-h-[52rem]">
          <VideoPlayer
            videoSrc="/videos/intro.mp4"
            posterSrc="/images/story-2.png"
            className="absolute inset-0 h-full w-full border-0 shadow-none"
            hasConsent={hasVideoConsent}
            onEnableVideo={onEnableVideo}
          />
          <div className="pointer-events-none absolute inset-0 bg-black/10" aria-hidden="true" />
          <Image
            src="/images/wagdie.png"
            alt=""
            width={1910}
            height={588}
            priority
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-auto w-[43%] max-w-4xl -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
            aria-hidden="true"
          />
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1680px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <section className="border border-midnight-light/70 bg-midnight/25 px-6 py-10 text-center sm:px-10 lg:px-16 lg:py-14">
          <div className="flex justify-center">
            <EditorialHeading
              headingLevel={1}
              align="center"
              id="homepage-hero-heading"
              eyebrow="We Are All Going to Die"
              title="A dark fantasy world shaped by community choices"
              description="Purchase a Pilgrim and write your story on-chain through characters, rituals, and consequences that leave a mark."
            />
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CtaLink href="/characters" className="h-12 min-w-44 px-8 text-base">
              Pilgrims
            </CtaLink>
            {showLoreNav && (
              <CtaLink href="/lore" variant="secondary" className="h-12 min-w-44 px-8 text-base">
                Archive
              </CtaLink>
            )}
          </div>
        </section>

        <HomeSection
          title="Build your Story"
          subtitle="Use WAGDIE’s on-chain systems to shape your own lore."
        >
          <FeatureCard
            title="Sear your Equipment"
            description="Transform your WAGDIE character by combining it with a Token of Concord."
            imageSrc="/images/story-1.png"
            href="/searing"
            cta="Visit searing"
          />
          <FeatureCard
            title="Stake on the World Map"
            description="Place your character on the world map and participate in location-specific events."
            imageSrc="/images/interactive-3.png"
            href="/map"
            cta="Open world map"
          />
          <FeatureCard
            title="Spread Infection"
            description="Take part in the project’s darker mechanics and accept their consequences."
            imageSrc="/images/story-2.png"
            href="/spread"
            cta="Enter spread"
          />
        </HomeSection>

        {showLoreNav && (
          <HomeSection title="From the Archives" subtitle="Read the stories told by WAGDIE.">
            <FeatureCard
              title="The Dead Rise"
              description="The first official record establishes the dead as a collective presence."
              imageSrc="/images/lore/archive/genesis-mint.jpg"
              href="/lore/events/genesis-mint"
              cta="Canon event"
            />
            <FeatureCard
              title="The Blackened Citadel"
              description="Follow the dead on the road toward a ruined seat of power."
              imageSrc="/images/lore/archive/first-citadel-march.jpg"
              href="/lore/events/first-citadel-march"
              cta="Canon event"
            />
            <FeatureCard
              title="The Searing Rite"
              description="Enter the ritual path for Concord-linked transformation and sacrifice."
              imageSrc="/images/lore/archive/searing-rite.jpg"
              href="/lore/events/searing-rite"
              cta="Canon event"
            />
          </HomeSection>
        )}

        <section className="mx-auto my-12 max-w-5xl border border-midnight-light/70 bg-midnight/25 px-6 py-10 text-center sm:px-10 lg:my-16 lg:py-12" aria-labelledby="community-cta-heading">
          <h2 id="community-cta-heading" className="font-display text-3xl text-parchment sm:text-4xl">
            Join the Community &amp; Decide your Fate
          </h2>
          <p className="mx-auto mt-3 max-w-2xl font-ui text-sm leading-6 text-mist sm:text-base">
            Join Discord and take part in the choices that keep the Forsaken Lands expanding.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CtaLink href={DISCORD_URL} isExternal className="h-11 min-w-44 px-8 text-sm">
              Join Discord
            </CtaLink>
            <CtaLink href={WIKI_URL} isExternal variant="secondary" className="h-11 min-w-44 px-8 text-sm">
              Open the Wiki
            </CtaLink>
          </div>
          <nav className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-ui text-xs uppercase tracking-[0.18em] text-arcane-bright" aria-label="More WAGDIE paths">
            <Link href="/characters" className="min-h-11 content-center hover:text-parchment">Characters</Link>
            <Link href="/videos" className="min-h-11 content-center hover:text-parchment">Low Poly Chronicles</Link>
          </nav>
        </section>
      </div>
    </>
  );
}
