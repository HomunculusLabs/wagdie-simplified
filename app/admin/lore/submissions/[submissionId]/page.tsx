import { AdminGate } from '@/components/admin/AdminGate';
import { AdminShell } from '@/components/admin/AdminShell';
import { LoreSubmissionAdminDetail } from '@/components/admin/lore-submissions/LoreSubmissionAdminDetail';
import {
  getAllEffectiveLoreCharacters,
  getAllEffectiveLoreLocations,
  getAllEffectiveLoreSeasons,
} from '@/lib/lore/effective-query';

interface LoreSubmissionAdminDetailPageProps {
  params: Promise<{ submissionId: string }>;
}

export default async function LoreSubmissionAdminDetailPage({ params }: LoreSubmissionAdminDetailPageProps) {
  const { submissionId } = await params;
  const [seasons, characters, locations] = await Promise.all([
    getAllEffectiveLoreSeasons(),
    getAllEffectiveLoreCharacters(),
    getAllEffectiveLoreLocations(),
  ]);
  const referenceOptions = {
    seasons: seasons.map((season) => ({ id: season.id, label: season.title })),
    characters: characters.map((character) => ({
      id: character.id,
      label: `${character.name}${character.tokenId ? ` (#${character.tokenId})` : ''}`,
    })),
    locations: locations.map((location) => ({ id: location.id, label: location.name })),
  };

  return (
    <AdminGate>
      <AdminShell
        title="Moderate Lore Submission"
        description="Inspect auto-public community lore, sanitize Markdown previews, curate graph metadata, hide records when needed, and run canon workflow actions."
      >
        <LoreSubmissionAdminDetail submissionId={submissionId} referenceOptions={referenceOptions} />
      </AdminShell>
    </AdminGate>
  );
}
