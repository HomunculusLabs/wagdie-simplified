import type { Metadata } from 'next';
import { LocationRoomWatchPage } from '@/components/location-rooms/LocationRoomWatchPage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface LocationRoomPageProps {
  params: Promise<{ locationId: string }>;
}

export async function generateMetadata({ params }: LocationRoomPageProps): Promise<Metadata> {
  const { locationId } = await params;

  return {
    title: `Location Room ${decodeURIComponent(locationId)} | WAGDIE`,
    description: 'Watch a public WAGDIE location encounter transcript as it unfolds.',
  };
}

export default async function LocationRoomPage({ params }: LocationRoomPageProps) {
  const { locationId } = await params;

  return <LocationRoomWatchPage locationId={decodeURIComponent(locationId)} />;
}
