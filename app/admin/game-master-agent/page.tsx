import { AdminGate } from '@/components/admin/AdminGate';
import { AdminShell } from '@/components/admin/AdminShell';
import { GameMasterAgentAdminContainer } from '@/components/admin/game-master-agent/GameMasterAgentAdminContainer';

export default function GameMasterAgentAdminPage() {
  return (
    <AdminGate
      title="GM Agent Admin"
      connectDescription="Connect your wallet to manage the location-room game-master agent."
      deniedDescription="You do not have permission to manage the game-master agent."
      deniedHelp="Only admin wallets can create, edit, or rotate the official GM agent setting."
    >
      <AdminShell
        title="GM Agent"
        description="Create or adopt the official location-room game-master agent, tune its persona, and manage .txt/.md knowledge used for narrative beats."
      >
        <GameMasterAgentAdminContainer />
      </AdminShell>
    </AdminGate>
  );
}
