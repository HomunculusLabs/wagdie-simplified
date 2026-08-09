import { render, screen } from '@testing-library/react';
import { Navigation } from '@/components/layout/Navigation';

let mockPathname = '/';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('Navigation', () => {
  beforeEach(() => {
    mockPathname = '/';
  });

  it('uses an exact Home match and prefix activation for nested route families', () => {
    mockPathname = '/lore/events/the-burning';
    render(<Navigation showArchive />);

    expect(screen.getByRole('link', { name: 'Archive' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('keeps nested NFT character pages active under Pilgrims', () => {
    mockPathname = '/characters/123';
    render(<Navigation showArchive />);

    expect(screen.getByRole('link', { name: 'Pilgrims' })).toHaveAttribute('aria-current', 'page');
  });

  it('honors Archive visibility while keeping the XD primary navigation concise', () => {
    const { rerender } = render(
      <Navigation showArchive={false} showConnectedActions={false} />
    );

    expect(screen.queryByRole('link', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pilgrims' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'World' })).toBeInTheDocument();

    rerender(<Navigation showArchive showConnectedActions />);

    expect(screen.getByRole('link', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Searing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Spread' })).not.toBeInTheDocument();
  });
});
