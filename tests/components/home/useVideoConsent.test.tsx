import { act, renderHook, waitFor } from '@testing-library/react';
import {
  useVideoConsent,
  VIDEO_CONSENT_COOKIE,
  VIDEO_CONSENT_DISMISSED_SESSION_KEY,
} from '@/components/home/useVideoConsent';

const clearCookies = () => {
  document.cookie.split(';').forEach((cookie) => {
    const [name] = cookie.trim().split('=');
    if (name) {
      document.cookie = `${name}=; Max-Age=0; Path=/`;
    }
  });
};

describe('useVideoConsent', () => {
  beforeEach(() => {
    clearCookies();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    clearCookies();
    window.sessionStorage.clear();
  });

  it('shows the modal after mount when no stored choice exists', async () => {
    const { result } = renderHook(() => useVideoConsent());

    await waitFor(() => expect(result.current.isConsentLoaded).toBe(true));

    expect(result.current.videoConsent).toBeNull();
    expect(result.current.hasVideoConsent).toBe(false);
    expect(result.current.shouldShowConsentModal).toBe(true);
    expect(document.cookie).not.toContain(VIDEO_CONSENT_COOKIE);
  });

  it('persists explicit grant choices and hides the modal', async () => {
    const { result } = renderHook(() => useVideoConsent());

    await waitFor(() => expect(result.current.isConsentLoaded).toBe(true));

    act(() => {
      result.current.grantVideoConsent();
    });

    expect(result.current.videoConsent).toBe('granted');
    expect(result.current.hasVideoConsent).toBe(true);
    expect(result.current.shouldShowConsentModal).toBe(false);
    expect(document.cookie).toContain(`${VIDEO_CONSENT_COOKIE}=granted`);
  });

  it('persists explicit deny choices without granting video consent', async () => {
    const { result } = renderHook(() => useVideoConsent());

    await waitFor(() => expect(result.current.isConsentLoaded).toBe(true));

    act(() => {
      result.current.denyVideoConsent();
    });

    expect(result.current.videoConsent).toBe('denied');
    expect(result.current.hasVideoConsent).toBe(false);
    expect(result.current.shouldShowConsentModal).toBe(false);
    expect(document.cookie).toContain(`${VIDEO_CONSENT_COOKIE}=denied`);
  });

  it('keeps a dismissal for the current browser session without persisting denial', async () => {
    const { result, unmount } = renderHook(() => useVideoConsent());

    await waitFor(() => expect(result.current.isConsentLoaded).toBe(true));

    act(() => {
      result.current.dismissVideoConsentForSession();
    });

    expect(result.current.videoConsent).toBeNull();
    expect(result.current.hasVideoConsent).toBe(false);
    expect(result.current.shouldShowConsentModal).toBe(false);
    expect(document.cookie).not.toContain(VIDEO_CONSENT_COOKIE);
    expect(window.sessionStorage.getItem(VIDEO_CONSENT_DISMISSED_SESSION_KEY)).toBe('1');

    unmount();
    const remounted = renderHook(() => useVideoConsent());
    await waitFor(() => expect(remounted.result.current.isConsentLoaded).toBe(true));

    expect(remounted.result.current.videoConsent).toBeNull();
    expect(remounted.result.current.shouldShowConsentModal).toBe(false);
  });

  it('uses stored grant choices after mount', async () => {
    document.cookie = `${VIDEO_CONSENT_COOKIE}=granted; Path=/`;

    const { result } = renderHook(() => useVideoConsent());

    await waitFor(() => expect(result.current.isConsentLoaded).toBe(true));

    expect(result.current.videoConsent).toBe('granted');
    expect(result.current.hasVideoConsent).toBe(true);
    expect(result.current.shouldShowConsentModal).toBe(false);
  });

  it('uses stored deny choices after mount', async () => {
    document.cookie = `${VIDEO_CONSENT_COOKIE}=denied; Path=/`;

    const { result } = renderHook(() => useVideoConsent());

    await waitFor(() => expect(result.current.isConsentLoaded).toBe(true));

    expect(result.current.videoConsent).toBe('denied');
    expect(result.current.hasVideoConsent).toBe(false);
    expect(result.current.shouldShowConsentModal).toBe(false);
  });
});
