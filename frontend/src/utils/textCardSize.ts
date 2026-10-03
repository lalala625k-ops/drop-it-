const FONT = '15px "Ataero Retina OB Edition", "Neue Haas Grotesk Display", Inter, sans-serif';
const FONT_SIZE = 15;
const LINE_HEIGHT = 21;
const PADDING = 28;
const MIN_WIDTH = 120;
const MAX_WIDTH = 360;

let sharedContext: CanvasRenderingContext2D | null = null;

function getContext(): CanvasRenderingContext2D | null {
  if (!sharedContext && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    sharedContext = canvas.getContext('2d');
  }
  if (sharedContext) sharedContext.font = FONT;
  return sharedContext;
}

export function textCardSize(content: string): { width: number; height: number } {
  const lines = (content || '').split('\n');
  const context = getContext();

  const getLineSpecs = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('# ')) {
      return { fontSize: 24, lineHeight: 28, text: trimmed.slice(2).trim() };
    }
    if (trimmed.startsWith('## ') || /^#{3,}\s+/.test(trimmed)) {
      return { fontSize: 18, lineHeight: 22, text: trimmed.replace(/^#{2,}\s+/, '').trim() };
    }
    return { fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT, text: raw };
  };

  const measure = (value: string, size = FONT_SIZE) => {
    if (context) {
      context.font = `${size}px "Ataero Retina OB Edition", "Neue Haas Grotesk Display", Inter, sans-serif`;
      return context.measureText(value).width;
    }
    return value.length * size;
  };

  let maxLineWidth = 0;
  for (const line of lines) {
    const spec = getLineSpecs(line);
    const w = measure(spec.text, spec.fontSize);
    if (w > maxLineWidth) maxLineWidth = w;
  }

  const width = Math.ceil(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, maxLineWidth + PADDING + 12)));
  const available = width - PADDING;
  let totalHeight = PADDING;

  for (const line of lines) {
    if (!line) {
      totalHeight += LINE_HEIGHT / 2;
      continue;
    }
    const spec = getLineSpecs(line);
    let visualLines = 0;
    let current = '';
    for (const character of spec.text) {
      if (current && measure(current + character, spec.fontSize) > available) {
        visualLines++;
        current = character;
      } else {
        current += character;
      }
    }
    visualLines++;
    totalHeight += visualLines * spec.lineHeight;
  }

  return { width, height: Math.max(60, Math.ceil(totalHeight)) };
}
