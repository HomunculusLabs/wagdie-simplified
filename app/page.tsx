'use client';

import { Button, Layout, Modal } from '@/components/ui';
import { HomeView } from '@/components/home/HomeView';
import { useVideoConsent, VIDEO_CONSENT_COOKIE } from '@/components/home/useVideoConsent';

const showLoreNav = process.env.NEXT_PUBLIC_SHOW_LORE_NAV !== 'false';

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

      {/*
        HomeView owns the shared public/connected body. Consent state and the
        lore feature flag are the only inputs; authentication differences live
        in the Header/account shell, never in the homepage tree.
      */}
      <HomeView
        hasVideoConsent={hasVideoConsent}
        onEnableVideo={grantVideoConsent}
        showLoreNav={showLoreNav}
      />
    </Layout>
  );
}
