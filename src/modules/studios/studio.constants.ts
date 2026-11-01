/** Canonical studio categories shared with the frontend constants file. */
export const STUDIO_CATEGORIES = [
  "Photo Studio",
  "Sound Stage",
  "Podcast Room",
  "Music Suite",
  "Art Workshop",
  "Creative Workspace",
  "Production Space",
] as const;

export type StudioCategory = (typeof STUDIO_CATEGORIES)[number];

export const STUDIO_SORT_OPTIONS = [
  "newest",
  "rating",
  "price-asc",
  "price-desc",
] as const;

export type StudioSortOption = (typeof STUDIO_SORT_OPTIONS)[number];
