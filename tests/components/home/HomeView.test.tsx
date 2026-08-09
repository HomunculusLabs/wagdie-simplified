import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeView } from '@/components/home/HomeView';

// next/image renders fine under next/jest, but we stub it to a plain img so
// tests stay focused on hierarchy/destinations instead of image loading.
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, fill }: { src: string | { src: string }; alt: string; fill?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === 'string' ? src : src.src}
      alt={alt}
      data-fill={fill ? 'true' : undefined}
    />
  ),
}));

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL || 'https://discord.gg/wagdie';
const WIKI_URL = 'https://wiki.fateofwagdie.com';

function renderHomeView(overrides: { hasVideoConsent?: boolean; showLoreNav?: boolean; onEnableVideo?: () => void } = {}) {
  const onEnableVideo = overrides.onEnableVideo ?? jest.fn();
  const { container } = render(
    <HomeView
      hasVideoConsent={overrides.hasVideoConsent ?? true}
      onEnableVideo={onEnableVideo}
      showLoreNav={overrides.showLoreNav ?? true}
    />,
  );
  return { container, onEnableVideo };
}

describe('HomeView', () => {
  it('renders a single route h1 with the canonical hero copy', () => {
    const { container } = renderHomeView();

    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'A dark fantasy world shaped by community choices',
    );
    expect(screen.getByText('We Are All Going to Die')).toBeInTheDocument();
  });

  it('exposes the canonical primary /characters and /map destinations', () => {
    renderHomeView();

    expect(document.querySelector('a[href="/map"]')).not.toBeNull();

    const characterCtas = screen.getAllByRole('link', { name: 'Pilgrims' });
    expect(characterCtas.length).toBeGreaterThanOrEqual(1);
    characterCtas.forEach((link) => expect(link).toHaveAttribute('href', '/characters'));
  });

  it('links the live-system cards to the in-app destinations only', () => {
    const { container } = renderHomeView();

    ['/characters', '/map', '/searing', '/spread', '/videos'].forEach((dest) => {
      const matches = container.querySelectorAll(`a[href="${dest}"]`);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('includes the external community destinations', () => {
    const { container } = renderHomeView();

    expect(container.querySelector(`a[href="${WIKI_URL}"]`)).not.toBeNull();
    expect(container.querySelector(`a[href="${DISCORD_URL}"]`)).not.toBeNull();
  });

  it('shows the Archive CTA only when lore navigation is enabled', () => {
    const { rerender } = render(
      <HomeView hasVideoConsent onEnableVideo={() => undefined} showLoreNav />,
    );

    const archiveLink = screen.getByRole('link', { name: 'Archive' });
    expect(archiveLink).toHaveAttribute('href', '/lore');
    expect(screen.getByRole('heading', { name: 'From the Archives' })).toBeInTheDocument();

    rerender(<HomeView hasVideoConsent onEnableVideo={() => undefined} showLoreNav={false} />);
    expect(screen.queryByRole('link', { name: 'Archive' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'From the Archives' })).toBeNull();
  });

  it('does not render any audio control', () => {
    const { container } = renderHomeView();

    expect(container.querySelector('audio')).toBeNull();
    expect(screen.queryByRole('button', { name: /audio|play sound|unmute the world/i })).toBeNull();
  });

  it('keeps the section heading order after the hero (h2 sections)', () => {
    renderHomeView();

    const h2s = screen.getAllByRole('heading', { level: 2 });
    const h2Texts = h2s.map((h) => h.textContent);
    expect(h2Texts).toEqual(
      expect.arrayContaining(['Build your Story', 'From the Archives', 'Join the Community & Decide your Fate']),
    );
  });

  it('requests consent before enabling the hero video', async () => {
    const user = userEvent.setup();
    const { onEnableVideo } = renderHomeView({ hasVideoConsent: false });

    const enableButton = screen.getByRole('button', { name: 'Enable video' });
    await user.click(enableButton);

    expect(onEnableVideo).toHaveBeenCalledTimes(1);
  });

  it('does not depend on auth providers (renders a shared public body)', () => {
    // HomeView renders standalone, without any auth/wallet provider in the tree.
    const { container } = renderHomeView();
    const hero = within(screen.getByRole('heading', { level: 1 }).closest('section') ?? container);
    expect(hero.getByRole('link', { name: 'Pilgrims' })).toHaveAttribute('href', '/characters');
  });
});
