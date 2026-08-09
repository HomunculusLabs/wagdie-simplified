import { NextRequest } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/api/auth';
import { jsonOk } from '@/lib/api/responses';
import { handleLoreSubmissionApiError, readJsonBody } from '@/app/api/lore/submissions/shared';
import { revalidateEffectiveLoreRoutes } from '@/lib/lore/revalidation';

export type AdminLoreSubmissionRouteContext = {
  params: Promise<{ submissionId: string }>;
};

type AdminLoreSubmissionActionExecutor<TPayload, TResult> = (args: {
  submissionId: string;
  adminAddress: string;
  payload: TPayload;
}) => Promise<TResult>;

type AdminLoreSubmissionActionHandlerConfig<TPayload, TResult> = {
  parsePayload: (body: unknown) => TPayload;
  execute: AdminLoreSubmissionActionExecutor<TPayload, TResult>;
  failureMessage: string;
  revalidateEffectiveLore?: boolean;
};

export function createAdminLoreSubmissionActionHandler<TPayload, TResult>(
  config: AdminLoreSubmissionActionHandlerConfig<TPayload, TResult>,
) {
  return async function POST(request: NextRequest, context: AdminLoreSubmissionRouteContext) {
    const auth = await requireAdmin();
    if (isAuthError(auth)) return auth;

    const body = await readJsonBody(request);
    try {
      const { submissionId } = await context.params;
      const payload = config.parsePayload(body);
      const submission = await config.execute({
        submissionId,
        adminAddress: auth.address,
        payload,
      });
      if (config.revalidateEffectiveLore) {
        revalidateEffectiveLoreRoutes(submission);
      }
      return jsonOk(submission);
    } catch (error) {
      return handleLoreSubmissionApiError(error, config.failureMessage);
    }
  };
}
