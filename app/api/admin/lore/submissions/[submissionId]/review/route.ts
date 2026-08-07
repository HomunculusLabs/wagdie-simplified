import { loreSubmissionService } from '@/lib/services/lore-submission-service';
import { createAdminLoreSubmissionActionHandler } from '../action-route';

export const POST = createAdminLoreSubmissionActionHandler({
  parsePayload: (body) => body,
  execute: ({ submissionId, adminAddress, payload: body }) => (
    loreSubmissionService.reviewSubmission(submissionId, body, adminAddress)
  ),
  failureMessage: 'Failed to review lore submission',
  revalidateEffectiveLore: true,
});
