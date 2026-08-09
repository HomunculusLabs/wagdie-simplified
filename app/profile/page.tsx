import type { Metadata } from 'next';
import { ProfilePageClient } from '@/components/profile/ProfilePageClient';

export const metadata: Metadata = {
  title: 'Profile | WAGDIE',
  description: 'View the connected wallet’s WAGDIE characters, supported game tokens, and signed Archive posts.',
};

export default function ProfilePage() {
  return <ProfilePageClient />;
}
