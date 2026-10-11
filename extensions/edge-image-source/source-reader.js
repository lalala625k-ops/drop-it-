// This function is injected on demand. Keep it self-contained: no module references.
export function inspectImage(info, includePixels = false) {
  const absolute = value => {
    try { return new URL(value, location.href).href; } catch { return ''; }
  };
  const images = [];
  const visit = root => {
    images.push(...root.querySelectorAll('img'));
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(document);
  const target = absolute(info.srcUrl);
  const image = images.find(img => [img.currentSrc, img.src].some(value => absolute(value) === target));
  const candidates = [];
  if (image) {
    let sourceSets = [image.srcset];
    const parseSet = srcset => {
      const pattern = /(?:^|,\s*)(\S+)\s+(\d+(?:\.\d+)?)(w|x)\s*(?=,|$)/g;
      return [...srcset.matchAll(pattern)].map(match => ({ url: absolute(match[1]), size: Number(match[2]), unit: match[3] }));
    };
    const picture = image.closest('picture');
    if (picture) {
      for (const source of picture.querySelectorAll('source')) {
        if (source.media && !matchMedia(source.media).matches) continue;
        // Only use the source that supplied this picture's current image.
        if (parseSet(source.srcset).some(candidate => candidate.url === image.currentSrc)) {
          sourceSets = [source.srcset];
          break;
        }
      }
    }
    for (const srcset of sourceSets) {
      candidates.push(...parseSet(srcset).filter(candidate => /^https?:/.test(candidate.url)));
    }
  }
  // Prefer the largest declared variant; don't invent CDN URLs.
  candidates.sort((a, b) => b.size - a.size);
  const urls = [...new Set([...candidates.slice(0, 2).map(candidate => candidate.url), image?.currentSrc, info.srcUrl].filter(Boolean))];
  const result = {
    pageUrl: location.href,
    canonical: document.querySelector('link[rel~="canonical"]')?.href || '',
    title: document.title,
    alt: image?.alt || '',
    candidates: urls.slice(0, 4)
  };
  if (includePixels && image?.complete && image.naturalWidth && image.naturalHeight) {
    if (image.naturalWidth * image.naturalHeight > 40_000_000) return result;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const pixels = canvas.toDataURL('image/png');
      if (pixels.length <= 32 * 1024 * 1024) result.pixels = pixels;
      canvas.width = canvas.height = 0;
    } catch {
      // A cross-origin image may taint this canvas. Never substitute a screenshot.
    }
  }
  return result;
}
