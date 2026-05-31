#!/usr/bin/env ts-node

import fs from 'fs';
import path from 'path';
import {
  compileCampaignLocationToMetadataPatch,
  DARK_FANTASY_CAMPAIGN_PACK,
  getCampaignLocationSource,
  validateCampaignLocationSource,
} from '../../lib/content/campaign';

interface Args {
  location: string;
  checkPath: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { location: '11', checkPath: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') args.help = true;
    else if (value === '--location' || value === '-l') args.location = argv[++index] ?? args.location;
    else if (value.startsWith('--location=')) args.location = value.split('=').slice(1).join('=');
    else if (value === '--check') args.checkPath = argv[++index] ?? null;
    else if (value.startsWith('--check=')) args.checkPath = value.split('=').slice(1).join('=');
    else if (!value.startsWith('-')) args.location = value;
  }
  return args;
}

function usage(): string {
  return [
    'Usage: bun run campaign:render-location -- --location 11 [--check path/to/payload.json]',
    '',
    'Renders the validated campaign metadata patch for one approved location.',
    'The output shape is intended for operator review and future migration payload generation:',
    '{ adventureCatalog, campaignContentSource }',
    '',
    'Runtime ticks do not run this script and do not read campaign source files directly.',
  ].join('\n');
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)])
  );
}

function stable(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
}

function comparablePayload(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (record.adventureCatalog && record.campaignContentSource) {
    return {
      adventureCatalog: record.adventureCatalog,
      campaignContentSource: record.campaignContentSource,
    };
  }
  if (record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)) {
    return comparablePayload(record.metadata);
  }
  return value;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const source = getCampaignLocationSource(args.location);
  if (!source) {
    throw new Error(`Unknown campaign location: ${args.location}`);
  }

  const validation = validateCampaignLocationSource(
    DARK_FANTASY_CAMPAIGN_PACK.id,
    DARK_FANTASY_CAMPAIGN_PACK.version,
    source
  );
  if (!validation.ok) {
    throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  }

  const patch = compileCampaignLocationToMetadataPatch(
    DARK_FANTASY_CAMPAIGN_PACK.id,
    DARK_FANTASY_CAMPAIGN_PACK.version,
    source
  );

  if (args.checkPath) {
    const absolute = path.resolve(args.checkPath);
    const candidate = comparablePayload(JSON.parse(fs.readFileSync(absolute, 'utf8')));
    if (stable(candidate) !== stable(patch)) {
      throw new Error(`Rendered campaign catalog differs from ${absolute}`);
    }
    console.log(`Campaign catalog matches ${absolute}`);
    return;
  }

  console.log(stable(patch));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
