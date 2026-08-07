import { revalidatePath } from 'next/cache';

const collectSlug = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  const slug = record.slug ?? record.published_slug;
  return typeof slug === 'string' && slug.length > 0 ? slug : undefined;
};

const collectEffectiveLoreSlugs = (value: unknown): string[] => {
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  return [
    collectSlug(record),
    collectSlug(record.event),
    collectSlug(record.submission),
    collectSlug(record.data),
  ].filter((slug): slug is string => Boolean(slug));
};

export const revalidateEffectiveLoreRoutes = (affectedRecord?: unknown): void => {
  try {
    revalidatePath('/lore');

    const slugs = [...new Set(collectEffectiveLoreSlugs(affectedRecord))];
    slugs.forEach((slug) => {
      revalidatePath(`/lore/events/${slug}`);
      revalidatePath(`/lore/community/${slug}`);
    });
  } catch (error) {
    console.warn('Failed to revalidate effective lore routes:', error);
  }
};
