import { AdminGate } from '@/components/admin/AdminGate'
import { AdminShell } from '@/components/admin/AdminShell'
import { LocationRoomDiagnosticsContainer } from '@/components/admin/location-rooms/LocationRoomDiagnosticsContainer'

export default function AdminLocationRoomsPage() {
  return (
    <AdminGate
      title="Location Room Diagnostics"
      connectDescription="Connect your wallet to inspect WAGDIE location-room health."
      deniedHelp="Only admin wallets can inspect location-room diagnostics."
    >
      <AdminShell
        title="Location Room Diagnostics"
        description="Defaults to canonical Crows Den location 11. Use this page to explain idle, pending, duplicated, or misconfigured rooms."
      >
        <LocationRoomDiagnosticsContainer />
      </AdminShell>
    </AdminGate>
  )
}
