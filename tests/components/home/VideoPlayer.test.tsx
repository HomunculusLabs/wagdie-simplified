import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoPlayer } from '@/components/home/VideoPlayer';

function installMotionPreference(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: jest.fn().mockImplementation(() => ({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

describe('VideoPlayer', () => {
  let playSpy: jest.SpyInstance;
  let pauseSpy: jest.SpyInstance;

  beforeEach(() => {
    playSpy = jest
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    pauseSpy = jest
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    playSpy.mockRestore();
    pauseSpy.mockRestore();
  });

  it('shows the poster and explicit enable action before consent', async () => {
    const user = userEvent.setup();
    const onEnableVideo = jest.fn();
    render(
      <VideoPlayer
        videoSrc="/videos/intro.mp4"
        posterSrc="/images/poster.jpg"
        hasConsent={false}
        onEnableVideo={onEnableVideo}
      />
    );

    expect(document.querySelector('video')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Enable video' }));
    expect(onEnableVideo).toHaveBeenCalledTimes(1);
  });

  it('suppresses autoplay for reduced motion while keeping explicit controls', async () => {
    installMotionPreference(true);
    const user = userEvent.setup();
    const { container } = render(
      <VideoPlayer
        videoSrc="/videos/intro.mp4"
        posterSrc="/images/poster.jpg"
        hasConsent
        onEnableVideo={() => undefined}
      />
    );

    await waitFor(() => expect(window.matchMedia).toHaveBeenCalled());
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('controls');
    expect(video).not.toHaveAttribute('autoplay');
    expect(playSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Play WAGDIE introduction video' }));
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('autoplays muted when motion is allowed and exposes persistent playback controls', async () => {
    installMotionPreference(false);
    const user = userEvent.setup();
    const { container } = render(
      <VideoPlayer
        videoSrc="/videos/intro.mp4"
        posterSrc="/images/poster.jpg"
        hasConsent
        onEnableVideo={() => undefined}
      />
    );

    await waitFor(() => expect(container.querySelector('video')).toHaveAttribute('autoplay'));
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toHaveAttribute('controls');

    await user.click(screen.getByRole('button', { name: 'Unmute WAGDIE introduction video' }));
    expect(video.muted).toBe(false);
    expect(screen.getByRole('button', { name: 'Mute WAGDIE introduction video' })).toBeInTheDocument();

    fireEvent.play(video);
    await user.click(screen.getByRole('button', { name: 'Pause WAGDIE introduction video' }));
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });
});
