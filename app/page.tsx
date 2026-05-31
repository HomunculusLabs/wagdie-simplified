'use client';

import { CtaLink } from '@/components/home/CtaLink';
import { FeatureCard } from '@/components/home/FeatureCard';
import { HomeSection } from '@/components/home/HomeSection';
import { useVideoConsent, VIDEO_CONSENT_COOKIE } from '@/components/home/useVideoConsent';
import { VideoPlayer } from '@/components/home/VideoPlayer';
import {
  Layout,
  Button,
  Separator,
  AspectRatio,
  Blockquote,
  Modal,
} from '@/components/ui';

const showLoreNav = process.env.NEXT_PUBLIC_SHOW_LORE_NAV === 'true';

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL || 'https://discord.gg/wagdie';
const WIKI_URL = 'https://wiki.fateofwagdie.com';

export default function HomePage() {
  const {
    shouldShowConsentModal,
    hasVideoConsent,
    grantVideoConsent,
    denyVideoConsent,
    dismissVideoConsentForSession,
  } = useVideoConsent();

  return (
    <Layout>
      <Modal
        id="video-consent"
        isOpen={shouldShowConsentModal}
        onClose={dismissVideoConsentForSession}
        title="Epilepsy warning + video consent"
        footer={(
          <div className="flex w-full flex-col-reverse gap-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" className="h-12 px-8 text-base" onClick={denyVideoConsent}>
              No autoplay
            </Button>
            <Button type="button" className="h-12 px-8 text-base" onClick={grantVideoConsent}>
              Enable autoplay
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <p className="text-body text-neutral-300">
            The hero video contains flashing imagery. Choose whether WAGDIE may autoplay it on this device.
          </p>
          <p className="text-sm text-neutral-500">
            Explicit choices are saved in the essential <code className="text-soul-accent">{VIDEO_CONSENT_COOKIE}</code> cookie. Closing this dialog, pressing Escape, or clicking the backdrop only pauses autoplay for this browser session.
          </p>
        </div>
      </Modal>

      <section className="min-h-[80vh] flex flex-col items-center justify-center py-20 px-4 relative" aria-labelledby="homepage-hero-heading">
        <div className="animate-fade-in flex flex-col items-center w-full max-w-5xl">
          <div className="w-full mb-10">
            <AspectRatio ratio={16 / 9}>
              <VideoPlayer
                videoSrc="/videos/intro.mp4"
                posterSrc="/images/video-preview.png"
                className="w-full h-full"
                hasConsent={hasVideoConsent}
                onEnableVideo={grantVideoConsent}
              />
            </AspectRatio>
          </div>

          <div className="max-w-3xl text-center space-y-6 mb-12">
            <p className="text-xs uppercase tracking-[0.35em] text-soul-accent/70 font-eskapade">
              We Are All Going to Die
            </p>
            <h1 id="homepage-hero-heading" className="text-h1 font-display text-neutral-100 leading-tight">
              Enter a dark fantasy world shaped by its characters, rituals, and community choices.
            </h1>
            <p className="text-body md:text-h4 text-neutral-500 tracking-wide leading-relaxed font-eskapade">
              WAGDIE is a community-driven world where travelers explore characters, follow the map, and take part in consequences that leave a mark.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center">
            <CtaLink href="/characters" className="h-12 px-8 text-base">
              Explore Characters
            </CtaLink>
            <CtaLink href="/map" variant="secondary" className="h-12 px-8 text-base">
              Open the World Map
            </CtaLink>
          </div>
          <CtaLink href="/videos" variant="secondary" className="mt-6 h-11 px-6 text-sm">
            Watch the Low Poly Chronicles
          </CtaLink>
        </div>
      </section>

      <div className="max-w-3xl mx-auto py-12 px-4">
        <Blockquote cite="The First Pilgrim">
          The fire fades, and the words are lost. Kindle the flame to reveal what once was. We construct our own reality through the choices we make in the dark.
        </Blockquote>
      </div>

      <div className="container mx-auto px-4 max-w-6xl">
        <HomeSection title="Choose your path" subtitle="Start with the systems that are alive now.">
          <FeatureCard
            title="Characters"
            description="Browse the travelers, inspect their traits, and choose whose story you want to follow into the abyss."
            imageSrc="/images/story-2.png"
            href="/characters"
            cta="Explore /characters"
          />
          <FeatureCard
            title="World Map"
            description="Survey the WAGDIE world from the dedicated map route, where exploration and location systems belong."
            imageSrc="/images/interactive-3.png"
            href="/map"
            cta="Open /map"
          />
          <FeatureCard
            title="Searing"
            description="Review the searing path and the consequences attached to the project’s darker mechanics."
            imageSrc="/images/story-1.png"
            href="/searing"
            cta="Visit /searing"
          />
        </HomeSection>

        <HomeSection title="Rituals and consequences" subtitle="Every action should tell you where it leads.">
          <FeatureCard
            title="Spread"
            description="Enter the ritual space for spread mechanics without pulling wallet-only flows into the homepage."
            imageSrc="/images/interactive-2.png"
            href="/spread"
            cta="Enter /spread"
          />
          <FeatureCard
            title="Low Poly Videos"
            description="Watch the latest visual chapters and use the video route when you want motion without starting the hero autoplay."
            imageSrc="/images/interactive-1.png"
            href="/videos"
            cta="Watch /videos"
          />
          {showLoreNav && (
            <FeatureCard
              title="Lore Archive"
              description="Read canon, submissions, and world records when lore navigation is enabled for this environment."
              imageSrc="/images/story-3.png"
              href="/lore"
              cta="Read /lore"
            />
          )}
          <FeatureCard
            title="WAGDIE Wiki"
            description="Use the wiki as the public reference for world details, mechanics, and lore."
            imageSrc="/images/story-3.png"
            href={WIKI_URL}
            cta="Open the wiki"
            isExternal
          />
          <FeatureCard
            title="Community Discord"
            description="Join the verified Discord invite to follow announcements, community decisions, and development updates."
            imageSrc="/images/community-1.png"
            href={DISCORD_URL}
            cta="Join Discord"
            isExternal
          />
        </HomeSection>

        <Separator className="my-16" />

        <section className="py-16 text-center relative overflow-hidden" aria-labelledby="final-cta-heading">
          <div className="absolute inset-0 bg-soul-accent/5 blur-3xl rounded-full scale-150 opacity-20" aria-hidden="true" />

          <div className="relative z-10 space-y-8">
            <h2 id="final-cta-heading" className="text-h2 md:text-h1 font-display text-neutral-200">
              Ready to choose a path?
            </h2>
            <p className="text-neutral-500 max-w-xl mx-auto text-body font-eskapade">
              Start with the character index, then join Discord to follow the community decisions that keep the world moving.
            </p>
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <CtaLink href="/characters" className="min-w-[200px] h-14 text-body">
                Explore Characters
              </CtaLink>
              <CtaLink href={DISCORD_URL} isExternal variant="secondary" className="min-w-[200px] h-14 text-body">
                Join Discord
              </CtaLink>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
