# Adobe XD frontend design QA

## Comparison target

- Source visual truth: Adobe XD `Wagdie_UI_UX` eight-artboard spec, captured under `.audit/reference/`.
- Rendered implementation: local Next.js app at `http://localhost:3002/`; the connected profile state was rendered from the production component in Storybook at `http://localhost:6007/iframe.html?id=pages-profile-profilepageclient--authenticated&viewMode=story` because wallet authentication is not available in the unauthenticated browser session.
- Theme/state: dark desktop theme, static/consent-safe home hero, default archive filters, connected profile fixture, first viewport or the source-matched scrolled results region.
- CSS viewport: `1920 × 1080` at `deviceScaleFactor: 1`. Responsive QA also ran at `390 × 844`; the Archive and event detail both report `scrollWidth === innerWidth` after the event-banner correction.
- Density normalization: artboards 1–5 were exported at `960 px` width (0.5× of the 1920 px XD frame); implementation captures were downsampled from `1920 × 1080` to `960 × 540`. Artboards 6–8 were captured at `480 px` width (0.25×); source crops were normalized to `960 × 540` after matching the same CSS region. Every judgment below used a combined source/implementation image, not separate screenshots.

## Eight-artboard evidence

| # | XD source | Implementation | Combined comparison | Result |
|---|---|---|---|---|
| 1 Archive — timeline | `.audit/reference/01-home.png` (`960 × 1512`) | `.audit/actual/lore-top-1920.png` and `.audit/actual/lore-lower-final.png` (1920 CSS viewport) | `.audit/comparisons/lore-top-comparison.png`, `.audit/comparisons/lore-lower-comparison.png` | Passed after XD correction |
| 2 Home | `.audit/reference/02-b.png` (`960 × 2295`) | `.audit/final/02-home-1920-v2.jpg` (`1920 × 1080`) | `.audit/comparisons/02-home-comparison-v2.jpg` | Passed |
| 3 Archive — characters | `.audit/reference/03-archive.png` (`960 × 1512`) | `.audit/final/03-archive-characters-1920-v3.jpg` (`1920 × 1080`) | `.audit/comparisons/03-archive-characters-comparison-v3.jpg` | Passed |
| 4 Event page | `.audit/reference/02-a.png` (`960 × 1141`) | `.audit/actual/event-top-final.png` and `.audit/actual/event-refs-final.png` (1920 CSS viewport) | `.audit/comparisons/event-top-comparison.png`, `.audit/comparisons/event-lower-comparison.png` | Passed after XD correction |
| 5 Character page — official variant | `.audit/reference/04-event.png` (`960 × 980`) | `.audit/final/05-character-detail-astaroth-1920.jpg` (`1920 × 1080`) | `.audit/comparisons/05-character-comparison.jpg` | Passed |
| 6 Profile page | `.audit/reference/06-profile.png` (`480 × 696`) | `.audit/final/06-profile-connected-1920-v2.jpg` (`1920 × 1080`) | `.audit/comparisons/06-profile-comparison-v2.jpg` | Passed |
| 7 Character archive duplicate/variant | `.audit/reference/07-character-page-1.png` (`480 × 756`) | `.audit/final/03-archive-characters-1920-v3.jpg` (`1920 × 1080`) | `.audit/comparisons/07-character-archive-comparison.jpg` plus the newer artboard-3 v3 comparison | Passed |
| 8 Character page — community variant | `.audit/reference/08-character-page-2-1.png` (`480 × 491`) | `.audit/final/08-character-detail-agorn-1920.jpg` (`1920 × 1080`) | `.audit/comparisons/08-character-comparison.jpg` | Passed |

## Fidelity review

- Fonts and typography: the supplied Hold Money-style display face and Inter/UI treatment are preserved. The final Archive title scale, section hierarchy, compact labels, and character/event headings track the XD hierarchy. No actionable font-size, wrap, or line-height mismatch remains.
- Spacing and layout rhythm: the Archive hero, four-control filter panel, framed result shell, 22rem event imagery, dual portrait column, and community panel now track the XD measurements. The event detail matches the XD banner, title/date baseline, narration bar, three-column References row, Sources row, and centered chapter transition.
- Colors and tokens: near-black surfaces, parchment/gold type, red WAGDIE wordmark, purple community accents, and restrained borders align with the sampled XD palette. The profile header was flattened to remove the non-source gradient.
- Image quality and assets: all visible content uses the existing WAGDIE source art and real character portraits. No generated placeholders, custom CSS art, inline replacement illustrations, or stretched source screenshots were introduced. Storybook now serves `public/` and the connected profile fixture uses six real portraits.
- Copy and content: production lore copy and real archive records replace the mock lorem ipsum shown in XD. The content length stays within the source hierarchy and does not break the intended composition.
- Icons and chrome: the shared header now uses the XD route labels (`Home`, `Archive`, `Pilgrims`, `World`), social icon group, filled wallet action, and outlined menu control. The shared footer now uses the XD's compact social-icon treatment.
- Interaction and accessibility: Timeline/Characters navigation, Location/Character/Canon/Keywords filtering, Date/Title sorting, clear-filters behavior, story navigation, speech narration play/pause, source destinations, and Next Chapter were exercised in the browser. Fresh post-fix Archive and event loads produced no browser errors.
- Mobile responsive evidence: `.audit/mobile-fix/lore-mobile-top.png`, `.audit/mobile-fix/lore-mobile-rows.png`, `.audit/mobile-fix/event-mobile-top-after.png`, and `.audit/mobile-fix/event-mobile-references.png` are `390 × 844` viewport captures at 1× density. The Archive title/filter/results hierarchy, stacked event references, source action, header navigation drawer, Timeline-to-Characters navigation, and narration play/pause were exercised at that size.

## Comparison history

### Pass 1 — blocked

- [P1] Home used a centered video-panel composition instead of the full-bleed illustrated XD hero.
- [P1] Archive used a short editorial heading and multi-column event cards instead of the large Archive stage and horizontal timeline rows.
- [P1] Character detail pages were substantially taller and did not present the portrait/profile/event-card structure visible in both character artboards.
- Fixes: rebuilt the home hero and section frames, rebuilt the Archive title/filter/results shell, converted timeline events to horizontal rows, converted character detail to a compact portrait/detail header followed by event cards, and aligned event detail to the wide banner treatment.
- Post-fix evidence: `.audit/comparisons/02-home-comparison.jpg`, `.audit/comparisons/01-archive-rows-comparison-v2.jpg`, `.audit/comparisons/04-event-comparison.jpg`, `.audit/comparisons/05-character-comparison.jpg`.

### Pass 2 — blocked

- [P2] Home wordmark was oversized relative to the XD hero.
- [P2] Archive title stage was too short and the title scale was too small.
- [P2] Character archive cards carried extra visible metadata and links, making the grid materially denser than XD.
- [P2] Connected profile evidence showed two placeholder portraits rather than the six-character source rhythm.
- Fixes: reduced the home wordmark to the source proportion; extended the Archive stage to 60rem and separated the description near its lower edge; moved character names into compact image overlays and hid secondary metadata visually; enabled Storybook static assets and supplied six real profile portraits in a six-column grid.
- Post-fix evidence: `.audit/comparisons/02-home-comparison-v2.jpg`, `.audit/comparisons/01-archive-top-comparison-v3.jpg`, `.audit/comparisons/03-archive-characters-comparison-v3.jpg`, `.audit/comparisons/06-profile-comparison-v2.jpg`.

### Pass 3 — passed

- No actionable P0, P1, or P2 differences remain in the eight normalized comparisons.
- Remaining P3 polish: XD-only header social icons/decorative ellipsis and exact mock-copy parity. These do not change hierarchy, task completion, or the visual system and are intentionally left to the existing production navigation/content model.

### Pass 4 — XD correction passed

- Reopened the Archive and event artboards after the earlier review had been too permissive.
- [P1 fixed] Event detail previously changed into a chronicle/sidebar layout below the banner; it now follows the XD narration, References, Sources, and Next Chapter composition.
- [P2 fixed] Archive exposed extra Season and canon-workflow controls, lacked visible sorting, used a narrower content frame, and rendered undersized story/portrait columns.
- [P2 fixed] Shared navigation and footer chrome did not match the XD route labels, social placement, wallet treatment, or compact icon footer.
- Final normalized comparisons show no remaining actionable P0, P1, or P2 differences for `/lore` and `/lore/events/[slug]`. Real production copy and event artwork intentionally replace the XD mock copy and sample art.

### Pass 5 — mobile event correction passed

- [P2 fixed] The event banner combined a desktop aspect ratio with a mobile minimum height, causing its auto width to expand to `905 px` inside a `390 px` viewport and forcing horizontal scrolling.
- Fix: the event banner now uses an explicit `w-full h-52` mobile frame and restores the XD desktop aspect ratio at the `sm` breakpoint.
- Post-fix evidence: `.audit/mobile-fix/event-mobile-top-after.png` and `.audit/mobile-fix/event-mobile-references.png`; the document and banner now measure `390 px` and `324 px` wide respectively with no root overflow. Archive mobile evidence also remains overflow-free in `.audit/mobile-fix/lore-mobile-top.png` and `.audit/mobile-fix/lore-mobile-rows.png`.

## Verification

- Jest correction gate: 9 suites, 80 tests passed (header, drawer, navigation, Archive, location-room diagnostics/coordinator, character materialization, and current-image handling).
- ESLint: repository lint passed with zero errors (pre-existing warnings remain).
- TypeScript: `bunx tsc --noEmit` passed.
- Production build: `bun run build` passed under Node `23.3.0`.
- Storybook production build: passed; static WAGDIE assets copied successfully.
- Full Jest run remains red in pre-existing archived/e2e and legacy suites (missing Playwright/Leaflet modules, stale mocks, and outdated copy assertions); targeted regression suites for this change pass.

final result: passed
