import type { LoreArchiveFilters } from './types';

export const archiveViews = ['timeline', 'characters'] as const;
export type ArchiveView = (typeof archiveViews)[number];

export interface ArchiveViewParams {
  view: ArchiveView;
  page: number;
}

type ParamValue = string | string[] | undefined | null;
type ParamInput = URLSearchParams | Record<string, ParamValue> | undefined | null;

const firstValue = (value: ParamValue): string | undefined => (
  Array.isArray(value) ? value[0] : value ?? undefined
);

const getParam = (input: ParamInput, key: string): string | undefined => {
  if (!input) return undefined;
  const value = input instanceof URLSearchParams ? input.get(key) ?? undefined : firstValue(input[key]);
  const trimmed = value?.trim();
  return trimmed || undefined;
};

export const parseArchiveView = (value: string | undefined): ArchiveView => (
  value === 'characters' ? 'characters' : 'timeline'
);

export const parseArchiveCharacterPage = (value: string | undefined): number => {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 1;
};

export const parseArchiveViewParams = (input: ParamInput): ArchiveViewParams => {
  const view = parseArchiveView(getParam(input, 'view'));
  return {
    view,
    page: view === 'characters' ? parseArchiveCharacterPage(getParam(input, 'page')) : 1,
  };
};

const filterKeys = [
  'season',
  'location',
  'character',
  'keyword',
  'canonStatus',
  'canonStage',
] as const satisfies readonly (keyof LoreArchiveFilters)[];

export interface BuildLoreArchiveHrefOptions {
  view?: ArchiveView;
  filters?: LoreArchiveFilters;
  page?: number;
}

/** Builds canonical Archive links. Timeline omits view/page; character links omit page 1. */
export const buildLoreArchiveHref = ({
  view = 'timeline',
  filters = {},
  page = 1,
}: BuildLoreArchiveHrefOptions = {}): string => {
  const params = new URLSearchParams();

  if (view === 'characters') {
    params.set('view', 'characters');
  }

  filterKeys.forEach((key) => {
    const value = filters[key];
    if (typeof value === 'string' && value.trim()) {
      params.set(key, value.trim());
    }
  });

  if (view === 'characters' && Number.isSafeInteger(page) && page > 1) {
    params.set('page', String(page));
  }

  const query = params.toString();
  return query ? `/lore?${query}` : '/lore';
};
