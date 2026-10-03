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
  const measure = (value: string) => context?.measureText(value).width ?? value.length * FONT_SIZE;
  const longest = lines.reduce((width, line) => Math.max(width, measure(line)), 0);
  const width = Math.ceil(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest + PADDING + 12)));
  const available = width - PADDING;
  let visualLines = 0;
  for (const line of lines) {
    if (!line) { visualLines++; continue; }
    let current = '';
    for (const character of line) {
      if (current && measure(current + character) > available) {
        visualLines++;
        current = character;
      } else current += character;
    }
    visualLines++;
  }
  return { width, height: Math.max(60, Math.ceil(visualLines * LINE_HEIGHT + PADDING)) };
}
