import type {
  LoreSubmissionReviewInput,
  LoreSubmissionStatusUpdate,
} from '@/lib/repositories/lore-submission-repository';
import type { LoreSubmissionStatus } from '@/types/lore-submission';

export interface ConditionalSubmissionTransition {
  expectedStatuses: LoreSubmissionStatus[];
  updates: LoreSubmissionStatusUpdate;
  review: Omit<LoreSubmissionReviewInput, 'submissionId' | 'fromStatus' | 'toStatus'>;
  conflictMessage: string;
}

export function buildCanonizeTransition(args: {
  admin: string;
  note?: string;
  now: string;
}): ConditionalSubmissionTransition {
  const note = args.note ?? null;

  return {
    expectedStatuses: ['public'],
    updates: {
      status: 'canonized',
      visibility: 'public',
      published_kind: 'official',
      canon_status: 'canon',
      canon_stage_id: 'canonized',
      canon_note: note,
      review_note: note,
      last_admin_address: args.admin,
      reviewed_at: args.now,
      canonized_at: args.now,
    },
    review: { actorAddress: args.admin, action: 'canonize', note },
    conflictMessage: 'Only public community lore can be canonized',
  };
}

export function buildDecanonizeTransition(args: {
  admin: string;
  note?: string;
  now: string;
}): ConditionalSubmissionTransition {
  const note = args.note ?? null;

  return {
    expectedStatuses: ['canonized'],
    updates: {
      status: 'public',
      visibility: 'public',
      published_kind: 'community',
      canon_status: 'community',
      canon_stage_id: 'community_recorded',
      canon_note: note,
      review_note: note,
      last_admin_address: args.admin,
      reviewed_at: args.now,
      canonized_at: null,
    },
    review: { actorAddress: args.admin, action: 'decanonize', note },
    conflictMessage: 'Only canonized lore can be decanonized',
  };
}

export function buildUnpublishTransition(args: {
  admin: string;
  note?: string;
  now: string;
}): ConditionalSubmissionTransition {
  const note = args.note ?? null;

  return {
    expectedStatuses: ['public'],
    updates: {
      status: 'closed',
      visibility: 'hidden',
      published_kind: null,
      status_reason: args.note ?? 'Unpublished by admin',
      review_note: note,
      last_admin_address: args.admin,
      reviewed_at: args.now,
      closed_at: args.now,
    },
    review: { actorAddress: args.admin, action: 'hide', note },
    conflictMessage: 'Only public community lore can be unpublished',
  };
}

export function buildRequestChangesTransition(args: {
  admin: string;
  note: string;
  now: string;
}): ConditionalSubmissionTransition {
  return {
    expectedStatuses: ['submitted'],
    updates: {
      status: 'changes_requested',
      visibility: 'pending',
      review_note: args.note,
      status_reason: args.note,
      last_admin_address: args.admin,
      reviewed_at: args.now,
    },
    review: { actorAddress: args.admin, action: 'request_changes', note: args.note },
    conflictMessage: 'Only submitted lore can receive change requests',
  };
}

export function buildCloseTransition(args: {
  admin: string;
  note: string;
  now: string;
}): ConditionalSubmissionTransition {
  return {
    expectedStatuses: ['submitted', 'changes_requested', 'public'],
    updates: {
      status: 'closed',
      visibility: 'hidden',
      published_kind: null,
      review_note: args.note,
      status_reason: args.note,
      last_admin_address: args.admin,
      reviewed_at: args.now,
      closed_at: args.now,
    },
    review: { actorAddress: args.admin, action: 'close', note: args.note },
    conflictMessage: 'Submission cannot be closed from its current status',
  };
}
