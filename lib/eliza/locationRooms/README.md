# Location Rooms Module Boundaries

## Public facades

- `gameMasterGenerator.ts` and `gameplay/gameMasterGameplayGenerator.ts` are compatibility facades. Production callers should keep importing generator interfaces/defaults from these files instead of reaching into `gameMaster/` or `gameplay/gameMaster/` internals.
- `service.ts` is the public orchestration facade for API routes and workers. It wires the room reader, manual tick service, tick processor, and scheduled worker, then delegates public methods without duplicating routing or generation behavior.

## Internal ownership

- `generation/` owns shared JSON, diagnostics, and repair-runner primitives used by narrative and gameplay generation.
- `gameMaster/` owns narrative GM prompts, validation, fallback behavior, diagnostics, and the Official generator implementation.
- `gameplay/gameMaster/` owns gameplay GM prompts, validation, fallback behavior, diagnostics, and the Official generator implementation.
- `service/` owns internal room projection, manual tick preparation, scheduled worker orchestration, tick routing, and route diagnostics. Manual and scheduled flows should continue to meet in the tick processor.

## Test seams

- Prefer scenario-level coverage through `tests/lib/eliza/locationRooms/fixtures/serviceHarness.ts` for routing behavior that can run through the real `LocationRoomService` facade.
- Use `tests/lib/eliza/locationRooms/fixtures/builders.ts` for service-test builders and default jest repository doubles.
- Keep mock-heavy service tests when they assert exact repository/coordinator interactions, idempotency edges, retry/dead behavior, or projection details that the scenario harness does not expose directly.
