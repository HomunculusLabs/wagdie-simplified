import { readOptionalNote } from '@/app/api/lore/submissions/shared';
import { loreSubmissionService } from '@/lib/services/lore-submission-service';
import { createAdminLoreSubmissionActionHandler } from '../action-route';

export const POST = createAdminLoreSubmissionActionHandler({
  parsePayload: readOptionalNote,
  execute: ({ submissionId, adminAddress, payload: note }) => (
    loreSubmissionService.decanonizeSubmission(submissionId, adminAddress, note)
  ),
  failureMessage: 'Failed to decanonize lore submission',
  revalidateEffectiveLore: true,
});
