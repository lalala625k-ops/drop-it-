/**
 * Derives the optimized 800px WebP thumbnail URL for a given image or card.
 * PureRef-style LOD texture management.
 */
export function getThumbnailUrl(image?: string, thumbnail?: string): string | undefined {
  if (thumbnail) return thumbnail;
  if (!image) return undefined;

  if (image.startsWith('/api/assets/')) {
    const filename = image.substring('/api/assets/'.length);
    return `/api/thumbnails/assets/${filename}`;
  }

  if (image.startsWith('/api/screenshots/')) {
    const filename = image.substring('/api/screenshots/'.length);
    return `/api/thumbnails/screenshots/${filename}`;
  }

  // Data URLs or external remote links fallback to raw image
  return image;
}
