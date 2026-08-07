import { readOptionalNote } from '@/app/api/lore/submissions/shared';
import { loreSubmissionService } from '@/lib/services/lore-submission-service';
import { createAdminLoreSubmissionActionHandler } from '../action-route';

export const POST = createAdminLoreSubmissionActionHandler({
  parsePayload: readOptionalNote,
  execute: ({ submissionId, adminAddress, payload: note }) => (
    loreSubmissionService.publishSubmission(submissionId, adminAddress, note)
  ),
  failureMessage: 'Failed to publish lore submission',
  revalidateEffectiveLore: true,
});
