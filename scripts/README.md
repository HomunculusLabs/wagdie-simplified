# Database Seed Scripts

This directory contains scripts for populating the WAGDIE database with sample data for testing and demonstration purposes.

## Available Scripts

### location-room-narrative-eval.ts
Scores a live/static location-room transcript for narrative QA signals: public GM narration length, public GM beat cadence (`publicGameMasterBeatCount`, `publicGameMasterBeatMaxGap`), roll/outcome pairing, check variety, spatial continuity signals, speaker rotation, weak failures, and repeated outcome openings.

```bash
# Deterministic fast harness: 10 scenarios × 30 service ticks, no live LLM/API calls
bun run narrative:harness:test

# Score an existing local/dev room transcript
bun run narrative:harness:live -- --base-url http://localhost:3000 --location 11

# Optionally trigger manual ticks first, then score the resulting transcript
NARRATIVE_EVAL_COOKIE='your-auth-cookie' \
NARRATIVE_EVAL_TRIGGER_TICKS=10 \
bun run narrative:harness:live -- --base-url http://localhost:3000 --location 11 --intent story
```

`location-room-narrative-scenarios.example.json` lists 10 suggested live-evaluation location targets. The live script reports quality warnings by default; pass `--fail-on-warnings` or set `NARRATIVE_EVAL_FAIL_ON_WARNINGS=true` when using it as a deployment smoke check. Static scoring uses existing transcript messages and does not require auth; fresh tick validation requires tick enablement plus `NARRATIVE_EVAL_COOKIE` or `NARRATIVE_EVAL_BEARER_TOKEN`.

### refresh-opensea-metadata.ts
Queues OpenSea metadata refresh jobs for WAGDIE tokens using the OpenSea v2 refresh endpoint.

```bash
# Preview requests without an API key
bun run opensea:refresh -- --token 1 --dry-run
bun run opensea:refresh -- --range 1-10 --dry-run

# Queue refreshes
OPENSEA_API_KEY=your_key bun run opensea:refresh -- --token 1
OPENSEA_API_KEY=your_key bun run opensea:refresh -- --range 1-100 --yes
OPENSEA_API_KEY=your_key bun run opensea:refresh -- --all --yes
```

Defaults to the Ethereum WAGDIE contract and sends `ignoreCachedItemUrls=true`. Use `--help` for the full option list.

### seed-database.ts
Populates the database with realistic mock data:
- 50 sample characters with D&D stats, equipment, and varied statuses
- 60 sample tweets with text, images, and videos
- 10 character-concord associations
- 3 test users with wallet addresses

## Usage

### Prerequisites

1. **Database migrations must be applied**:
   ```bash
   npx supabase db push
   ```

2. **Environment variable must be set**:
   ```bash
   export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
   ```

### Running the Seed Script

```bash
# Using npm script (recommended) - uses Supabase API
npm run seed

# Quick seed script (uses direct database connection) - faster alternative
npm run seed:quick

# Or directly with ts-node
npx ts-node scripts/seed-database.ts
npx ts-node scripts/quick-seed.ts

# With environment variable inline
SUPABASE_SERVICE_ROLE_KEY=your_key npx ts-node scripts/seed-database.ts
```

**Note**: Use `npm run seed:quick` if the Supabase API is experiencing issues. This script uses direct database connection and bypasses the API layer.

### Expected Output

```
🌱 Starting database seed...

✅ Seeding users... 3 created
✅ Seeding characters... 50 created
✅ Seeding character concords... 10 created
✅ Seeding tweets... 60 created

📊 Seed Summary:
┌────────────────────┬─────────┬────────┬────────┐
│ Entity             │ Success │ Failed │ Skipped│
├────────────────────┼─────────┼────────┼────────┤
│ Users              │ 3       │ 0      │ 0      │
│ Characters         │ 50      │ 0      │ 0      │
│ Character Concords │ 10      │ 0      │ 0      │
│ Tweets             │ 60      │ 0      │ 0      │
└────────────────────┴─────────┴────────┴────────┘

✅ Seed completed successfully in 2.3s
```

## Features

### Idempotent
The script can be run multiple times safely:
```bash
npm run seed
# Output: "Skipping X existing records, inserted Y new records"
```

### Error Handling
- Continues execution on individual record failures
- Logs all errors with context
- Provides detailed summary report
- Never crashes the entire process due to bad data

### Performance
- Completes in under 10 seconds
- Batch operations where possible
- Efficient error recovery

## Data Overview

### Characters (50 records)
- Token IDs: 1-50
- Classes: Warrior, Mage, Rogue, Cleric (12-13 each)
- Levels: 1-5 with normal distribution
- Stats: D&D style (STR, DEX, CON, INT, WIS, CHA: 1-20)
- Status Variety: Healthy/Infected/Cured (≈33% each)
- Ownership: 60% owned, 40% unowned
- Equipment: Full sets, partial, none (varied)
- Images: Rotating through existing project assets

### Tweets (60 records)
- Timeline: Spread over past 30 days
- Media Types: 50% text-only, 30% images, 20% videos
- Content: Lore announcements, character reveals, community updates
- Author: @WAGDIE_ETH (official account)

### Users (3 records)
- Test wallet addresses with valid Ethereum format
- Simulated login history and statistics

### Character Concords (10 records)
- Links characters to Concord #15 (Strange Mushroom)
- Quantity distribution: 6× qty=1, 3× qty=2, 1× qty=3

## Troubleshooting

### Error: "Missing SUPABASE_SERVICE_ROLE_KEY"
```bash
export SUPABASE_SERVICE_ROLE_KEY="your_key_here"
npm run seed
```

### Error: "Connection refused to database"
```bash
npx supabase start
npx supabase status
```

### Error: "Constraint violation: duplicate key"
This is normal! The script skips existing records automatically.

### Error: "Foreign key constraint violation"
Ensure migrations are applied:
```bash
npx supabase db push
```

## Verification

After running the seed script:

1. **Characters Page**: Visit http://localhost:3000/characters (should show 50 characters)
2. **Character Detail**: Visit http://localhost:3000/characters/1 (should show RPG sheet)
3. **Lore Page**: Visit http://localhost:3000/lore (should show 60 tweets)
4. **Filters**: Test all filter combinations on characters page
5. **Editing**: Try editing character name/background story

## Clearing Data

To reset and re-seed from scratch:
```bash
# Option 1: Reset entire database
npx supabase db reset

# Option 2: Delete sample data only
npx supabase db query "DELETE FROM character_concords;"
npx supabase db query "DELETE FROM characters WHERE token_id BETWEEN 1 AND 50;"
npx supabase db query "DELETE FROM tweets;"
npx supabase db query "DELETE FROM users WHERE eth_address LIKE '0x%1111%';"
```

## Development

### Modifying Sample Data

To change the sample data:

1. Edit the relevant arrays in `seed-database.ts`
2. Adjust distribution constants at the top of the file
3. Re-run the seed script

### Adding New Data Types

1. Define TypeScript interfaces
2. Create generation functions
3. Add insertion logic with error handling
4. Update documentation

### Performance Testing

Monitor script execution time:
```bash
time npm run seed
```

Target: <10 seconds for full seeding.

---

**For more details**: See the implementation plan and data model specifications in `/specs/005-mock-data-integration/`