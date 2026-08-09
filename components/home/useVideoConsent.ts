'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export const VIDEO_CONSENT_COOKIE = 'wagdie_video_consent';
export const VIDEO_CONSENT_MAX_AGE = 60 * 60 * 24 * 365;
export const VIDEO_CONSENT_DISMISSED_SESSION_KEY = 'wagdie_video_consent_dismissed';

export type VideoConsent = 'granted' | 'denied' | null;

type PersistedVideoConsent = Exclude<VideoConsent, null>;

const readVideoConsent = (): VideoConsent => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${VIDEO_CONSENT_COOKIE}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;

  return value === 'granted' || value === 'denied' ? value : null;
};

const setVideoConsentCookie = (value: PersistedVideoConsent) => {
  document.cookie = `${VIDEO_CONSENT_COOKIE}=${encodeURIComponent(value)}; Max-Age=${VIDEO_CONSENT_MAX_AGE}; Path=/; SameSite=Lax`;
};

const readSessionDismissal = (): boolean => {
  try {
    return window.sessionStorage.getItem(VIDEO_CONSENT_DISMISSED_SESSION_KEY) === '1';
  } catch {
    return false;
  }
};

const persistSessionDismissal = () => {
  try {
    window.sessionStorage.setItem(VIDEO_CONSENT_DISMISSED_SESSION_KEY, '1');
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
};

export function useVideoConsent() {
  const [videoConsent, setVideoConsent] = useState<VideoConsent>(null);
  const [isConsentLoaded, setIsConsentLoaded] = useState(false);
  const [isVideoConsentDismissed, setIsVideoConsentDismissed] = useState(false);

  useEffect(() => {
    setVideoConsent(readVideoConsent());
    setIsVideoConsentDismissed(readSessionDismissal());
    setIsConsentLoaded(true);
  }, []);

  const persistConsentChoice = useCallback((value: PersistedVideoConsent) => {
    setVideoConsentCookie(value);
    setVideoConsent(value);
    setIsVideoConsentDismissed(true);
  }, []);

  const grantVideoConsent = useCallback(() => {
    persistConsentChoice('granted');
  }, [persistConsentChoice]);

  const denyVideoConsent = useCallback(() => {
    persistConsentChoice('denied');
  }, [persistConsentChoice]);

  const dismissVideoConsentForSession = useCallback(() => {
    persistSessionDismissal();
    setIsVideoConsentDismissed(true);
  }, []);

  return useMemo(() => ({
    videoConsent,
    isConsentLoaded,
    shouldShowConsentModal: isConsentLoaded && videoConsent === null && !isVideoConsentDismissed,
    hasVideoConsent: videoConsent === 'granted',
    grantVideoConsent,
    denyVideoConsent,
    dismissVideoConsentForSession,
  }), [
    videoConsent,
    isConsentLoaded,
    isVideoConsentDismissed,
    grantVideoConsent,
    denyVideoConsent,
    dismissVideoConsentForSession,
  ]);
}
