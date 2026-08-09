# WAGDIE UI/UX 2026 Handoff Manifest

## Purpose

This manifest controls whether Adobe XD dependencies may enter the production build. The source reference is the July 29, 2026 `Wagdie_UI_UX` Adobe XD developer specification, revision 5. Structural implementation may use the named fallbacks below, but exact asset, font, audio, and copy parity remains conditional on provenance and approval.

## Status vocabulary

- **Approved:** evidence is recorded and the item may ship in its stated target.
- **Pending — fallback active:** required evidence is incomplete; only the named fallback may ship.
- **Excluded:** the XD item is intentionally omitted because it is unsupported, inactive, placeholder content, or cannot be licensed.

An item must not move to **Approved** without an owner, source, applicable license or permission, delivery/export date, and target usage. Image deliveries additionally require intrinsic dimensions and alt/decorative classification.

## Gate summary

| Gate | Status | Required owner/evidence | Shipping fallback |
|---|---|---|---|
| Hold Money provenance | Pending — fallback active | Product/legal/design: authoritative source plus web-use and redistribution permission | Preserve existing repository typography only; do not add another font binary or claim exact XD parity |
| Inter provenance | Pending — fallback active | Product/legal/design: authoritative binary/source plus web-use and redistribution permission | `font-ui` system sans stack |
| XD raster/vector exports | Pending — fallback active | Design: original export, crop intent, source artboard, dimensions, and source/license | Existing repository imagery or CSS borders/gradients/ornamentation |
| Event audio | Excluded | Product/design: playable file, title, attribution, license, and approved controls | Omit audio UI |
| Canonical copy | Pending — fallback active | Product/content: approved home, CTA, footer, and account language | Existing production copy, corrected only for navigation clarity/accessibility |
| External destinations | Pending — fallback active | Product: confirmed URLs | Existing `NEXT_PUBLIC_*_URL` values with current production fallbacks |
| Visual release signoff | Pending — fallback active | Design/product review using production-like data at agreed widths | Structural preview only; no exact-parity claim |

## Conditional delivery manifest

No new XD-delivered files were available when Slice 1 was implemented. The entries below reserve the required metadata and make the active fallback explicit.

| ID | Dependency | Source / owner | License or permission | Delivery / export date | Target | Dimensions | Alt/decorative classification | Status and active fallback |
|---|---|---|---|---|---|---|---|---|
| FONT-01 | Hold Money display face | XD specification; owner pending from product/design | Web-use and redistribution terms pending | Not delivered | Brand/display typography | N/A | N/A | Pending — fallback active. Keep current repository behavior only; no new binary is eligible to ship. |
| FONT-02 | Inter UI/body face | XD specification; owner pending from product/design | Web-use and redistribution terms pending | Not delivered | Navigation, controls, metadata | N/A | N/A | Pending — fallback active. Use the system-sans `font-ui` stack. |
| IMAGE-01 | Home hero/editorial imagery | XD artboards; design owner pending | Source and license pending | Not delivered | Homepage | Pending | Entity alt text or decorative status pending | Pending — fallback active. The implemented homepage uses current production media/posters and CSS ornamentation. |
| IMAGE-02 | Archive event/character imagery | XD artboards; design owner pending | Source and license pending | Not delivered | Archive and lore details | Pending | Canonical entity alt text pending | Pending — fallback active. The implemented Archive uses deterministic existing lore cover/portrait fallbacks. |
| IMAGE-03 | Profile/token/account imagery | XD artboards; design owner pending | Source and license pending | Not delivered | Profile and account drawer | Pending | Entity alt text or decorative status pending | Pending — fallback active. The implemented Profile uses current character/token imagery and CSS framing. |
| IMAGE-04 | Header/footer/social ornaments | XD artboards; design owner pending | Source and license pending | Not delivered | Shared shell | Pending | Decorative unless product identifies content meaning | Pending — fallback active. The implemented shell uses the existing WAGDIE logo plus CSS borders/gradients. |
| IMAGE-05 | NFT collection card/filter ornamentation | XD visual language; design owner pending | No separate XD collection export or license evidence delivered | Not delivered | `/characters` browse and filter surfaces | Pending | Character art remains canonical entity imagery; any future ornament is decorative | Pending — fallback active. Use canonical character image resolution plus semantic-token borders, gradients, and surfaces; no new raster asset is eligible. |
| AUDIO-01 | Event audio track/control | XD artboards; product/design owner pending | File, attribution, and license absent | Not delivered | Event details | N/A | Accessible title/transcript behavior pending | Excluded. The implemented details omit the inactive audio control. |
| COPY-01 | Home and community CTA copy | Product/content owner pending | Canonical approval pending | Not delivered | Homepage | N/A | N/A | Pending — fallback active. The implemented homepage retains production-backed copy and never uses XD lorem ipsum. |
| COPY-02 | Account and footer copy | Product/content owner pending | Canonical approval pending | Not delivered | Header drawer and footer | N/A | N/A | Pending — fallback active. Retain established destinations and accurate wallet/SIWE wording. |
| LINK-01 | Discord | Product confirmation pending; `NEXT_PUBLIC_DISCORD_URL` | Destination confirmation pending | Runtime configuration | Drawer/footer | N/A | External link name | Pending — fallback active. `https://discord.gg/wagdie`. |
| LINK-02 | X / Twitter | Product confirmation pending; `NEXT_PUBLIC_TWITTER_URL` | Destination confirmation pending | Runtime configuration | Drawer/footer | N/A | External link name | Pending — fallback active. `https://twitter.com/WAGDIE_ETH`. |
| LINK-03 | OpenSea | Product confirmation pending; `NEXT_PUBLIC_OPENSEA_URL` | Destination confirmation pending | Runtime configuration | Drawer/footer | N/A | External link name | Pending — fallback active. Current WAGDIE collection URL. |

## Intake requirements for future deliveries

Approved optimized derivatives belong under `public/images/ui/wagdie-ui-ux-2026/`. For each delivered file, replace or append a row containing:

1. original source URL/path and product/design owner;
2. license or explicit web-use/redistribution permission;
3. export date and source artboard;
4. target component and crop intent;
5. intrinsic pixel dimensions (or SVG view box);
6. meaningful alt text source, or an explicit **decorative** classification;
7. optimized repository filename and derivative owner.

Screenshots, blurred reconstructions, broken images, placeholder identities, lorem ipsum, XD spelling errors, and unapproved font/audio files are never valid fallbacks.

## Final fallback audit — 2026-08-07

No designer export, font provenance package, audio file, copy approval, or destination approval was delivered during implementation. Work Item 11 therefore makes no asset substitution: all pending gates remain pending, event audio remains excluded, and `public/images/ui/wagdie-ui-ux-2026/` is intentionally absent rather than populated with screenshots or reconstructed placeholders.

The implemented shell, Profile, homepage, Archive, lore details, NFT browse, and global failure surfaces use only the manifest’s active fallbacks: repository-owned runtime imagery, deterministic character/lore fallbacks, additive semantic tokens, CSS ornamentation, existing production copy, and environment-backed external links. This is structurally fallback-complete but does not satisfy exact font/asset parity or visual release signoff.

Future asset intake must follow the metadata requirements above and receive product/design/legal approval before changing any row to **Approved**. This bookkeeping records implementation state only and does not change the implementation plan’s orchestration status.
