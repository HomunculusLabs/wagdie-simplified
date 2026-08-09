import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoreArchiveCarousel, type LoreArchiveCarouselSlide } from '@/components/lore/LoreArchiveCarousel';

const slides: LoreArchiveCarouselSlide[] = [
  {
    id: 'one',
    title: 'The First Record',
    summary: 'The first summary.',
    imageUrl: '/images/lore/archive/genesis-mint.jpg',
    imageAlt: 'The first record cover',
    href: '/lore/events/one',
    eyebrow: 'Genesis Ashes',
  },
  {
    id: 'two',
    title: 'The Second Record',
    summary: 'The second summary.',
    imageUrl: '/images/lore/archive/first-citadel-march.jpg',
    imageAlt: 'The second record cover',
    href: '/lore/events/two',
    eyebrow: 'The March',
  },
];

describe('LoreArchiveCarousel', () => {
  it('renders the selected lore artwork and advances with accessible controls', async () => {
    const user = userEvent.setup();
    render(<LoreArchiveCarousel slides={slides} />);

    expect(screen.getByRole('banner', { name: 'Selected lore events' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The First Record' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'The first record cover' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next lore event' }));

    expect(screen.getByRole('heading', { name: 'The Second Record' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'The second record cover' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /The Second Record/ })).toHaveAttribute('href', '/lore/events/two');
  });
});
