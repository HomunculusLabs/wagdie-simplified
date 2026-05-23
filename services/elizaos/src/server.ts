import 'dotenv/config';

import { AgentServer, type ServerConfig } from '@elizaos/server';
import { bootstrapPlugin } from '@elizaos/plugin-bootstrap';
import { venicePlugin } from '@elizaos/plugin-venice';
import { wagdieGameMasterCharacter } from './characters/wagdie-game-master-character.js';
import { wagdieSpikeCharacter } from './characters/wagdie-spike-character.js';
import { wagdieKnowledgePlugin } from './wagdie-knowledge-plugin.js';
import { wagdieGameplayPlugin } from './wagdie-gameplay-plugin.js';
import { validateStartupEnvironment } from './startup-env.js';

function getPort(): number {
  const value = process.env.PORT || process.env.ELIZAOS_PORT || '3001';
  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid ElizaOS service port: ${value}`);
  }

  return port;
}

function buildServerConfig(): ServerConfig {
  return {
    port: getPort(),
    dataDir: process.env.ELIZAOS_DATA_DIR || './data',
    postgresUrl: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    agents: [
      {
        character: wagdieSpikeCharacter,
        plugins: [bootstrapPlugin, venicePlugin, wagdieKnowledgePlugin, wagdieGameplayPlugin],
      },
      {
        character: wagdieGameMasterCharacter,
        plugins: [bootstrapPlugin, venicePlugin, wagdieKnowledgePlugin, wagdieGameplayPlugin],
      },
    ],
  };
}

async function main(): Promise<void> {
  const startupEnv = validateStartupEnvironment();

  for (const warning of startupEnv.warnings) {
    console.warn(`[wagdie-elizaos] ${warning}`);
  }

  const server = new AgentServer();
  await server.start(buildServerConfig());

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`[wagdie-elizaos] Received ${signal}; stopping ElizaOS service.`);
    await server.stop();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[wagdie-elizaos] Failed to start ElizaOS service:', error);
  process.exit(1);
});
