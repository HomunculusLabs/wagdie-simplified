import { AdminGate } from '@/components/admin/AdminGate';
import { AdminShell } from '@/components/admin/AdminShell';
import { LoreSubmissionsAdminQueue } from '@/components/admin/lore-submissions/LoreSubmissionsAdminQueue';

export default function LoreSubmissionsAdminPage() {
  return (
    <AdminGate>
      <AdminShell
        title="Lore Submissions"
        description="Moderate auto-public token-owner community lore, curate metadata, hide records when needed, and promote or demote canon status."
      >
        <LoreSubmissionsAdminQueue />
      </AdminShell>
    </AdminGate>
  );
}
