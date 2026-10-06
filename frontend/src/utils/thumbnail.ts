/**
 * Returns the server-provided thumbnail when available, otherwise the source
 * image. Keeping the source as the fallback makes pasted images work with
 * older backends that do not expose generated thumbnails.
 */
export function getThumbnailUrl(image?: string, thumbnail?: string): string | undefined {
  if (thumbnail) return thumbnail;
  if (!image) return undefined;

  // Only use a thumbnail when the server explicitly supplied one. Inferring
  // a thumbnail URL makes newly pasted images render as broken images when
  // an older backend has not generated the thumbnail endpoint yet.
  return image;
}
