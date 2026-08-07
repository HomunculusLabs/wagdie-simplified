import { AdminGate } from '@/components/admin/AdminGate';
import { AdminShell } from '@/components/admin/AdminShell';
import { LoreCanonizationAdminContainer } from '@/components/admin/lore-canonization/LoreCanonizationAdminContainer';

export default function LoreCanonizationAdminPage() {
  return (
    <AdminGate>
      <AdminShell
        title="Base Event Canonization Overrides"
        description="Edit base-event canon metadata, preview the public canon workflow display, publish override snapshots, or reset events to their static lore state. Community submission promotion lives in Lore Submissions."
      >
        <LoreCanonizationAdminContainer />
      </AdminShell>
    </AdminGate>
  );
}
