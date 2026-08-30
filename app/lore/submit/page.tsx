import Link from 'next/link';
import { BannerHeader } from '@/components/shared/BannerHeader';
import { LoreSubmissionForm } from '@/components/lore/submissions/LoreSubmissionForm';
import { getAllEffectiveLoreLocations } from '@/lib/lore/effective-query';

type SearchParams = Record<string, string | string[] | undefined>;

interface LoreSubmitPageProps {
  searchParams?: Promise<SearchParams>;
}

const firstParam = (value: string | string[] | undefined): string | undefined => {
  return Array.isArray(value) ? value[0] : value;
};

export default async function LoreSubmitPage({ searchParams }: LoreSubmitPageProps) {
  const resolvedSearchParams = await searchParams;
  const tokenId = firstParam(resolvedSearchParams?.tokenId)?.trim();
  const locations = await getAllEffectiveLoreLocations();

  return (
    <div className="min-h-screen bg-soul-950">
      <BannerHeader
        title="Submit Community Lore"
        subtitle="Token owners can publish chronicles for their characters; admins can publish for any token and canonize submissions later."
      />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-5 flex justify-end">
          <Link href="/lore/submissions" className="text-sm font-display text-soul-accent hover:text-soul-bone">
            View my submissions
          </Link>
        </div>
        <LoreSubmissionForm initialValues={tokenId ? { tokenId } : undefined} locationOptions={locations} />
      </main>
    </div>
  );
}
