import { CROWS_DEN_CAMPAIGN_LOCATION } from './locations/crowsDen';
import type { CampaignPack } from './types';
import { assertValidCampaignPack } from './validation';

export const DARK_FANTASY_CAMPAIGN_PACK: CampaignPack = assertValidCampaignPack({
  id: 'wagdie-dark-fantasy-campaign',
  version: '2026-05-31.1',
  title: 'WAGDIE Dark Fantasy Campaign Source',
  ipPolicy: {
    originalityReviewRequired: true,
    approvedBy: null,
    approvalDate: null,
    notes: 'Source package is ready for render/check validation. Production data migration requires an explicit approval artifact before merge.',
  },
  locations: [
    {
      locationId: '11',
      slug: 'crows-den',
      title: "The Crow's Den",
      status: 'source_ready',
      source: CROWS_DEN_CAMPAIGN_LOCATION,
    },
  ],
});

export function getCampaignLocationSource(locationIdOrSlug: string) {
  const key = locationIdOrSlug.trim().toLowerCase();
  return DARK_FANTASY_CAMPAIGN_PACK.locations.find((location) =>
    location.locationId === key || location.slug.toLowerCase() === key
  )?.source ?? null;
}
