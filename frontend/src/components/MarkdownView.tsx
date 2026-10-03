import React from 'react';

interface MarkdownViewProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  color?: string;
}

/**
 * Renders inline markdown tokens:
 * - Bold: **text** or __text__
 * - Italic: *text* or _text_
 * - Code: `code`
 * - Strikethrough: ~~text~~
 * - Links: [text](url)
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  // Regex to split on markdown inline syntax
  // 1: bold (**...**)
  // 2: inline code (`...`)
  // 3: italic (*...*)
  // 4: strikethrough (~~...~~)
  // 5: links [text](url)
  const tokenRegex = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Bold
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      const inner = part.slice(2, -2);
      return <strong key={index} className="font-bold">{inner}</strong>;
    }

    // Inline Code
    if (part.startsWith('`') && part.endsWith('`')) {
      const inner = part.slice(1, -1);
      return (
        <code key={index} className="px-1 py-0.5 rounded bg-ink/10 font-mono text-[13px]">
          {inner}
        </code>
      );
    }

    // Italic
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      const inner = part.slice(1, -1);
      return <em key={index} className="italic">{inner}</em>;
    }

    // Strikethrough
    if (part.startsWith('~~') && part.endsWith('~~')) {
      const inner = part.slice(2, -2);
      return <del key={index} className="line-through opacity-70">{inner}</del>;
    }

    // Link: [text](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, linkText, linkUrl] = linkMatch;
      return (
        <a
          key={index}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="underline decoration-ink/40 hover:decoration-ink text-ink transition-colors"
        >
          {linkText}
        </a>
      );
    }

    // Plain text
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

/**
 * Dedicated Markdown Renderer adhering strictly to the note canvas specification:
 * - Level 1 Heading (# ): 24px, font-black (900), leading-[1.15]
 * - Level 2 Heading (## ): 18px, font-bold (700), leading-[1.2]
 * - Level 3+ Heading (### ): 18px, font-bold (700), leading-[1.2]
 * - Body text: 15px, font-normal (400), leading-[1.40], font-retina (matches note default)
 * - Lists, Blockquotes, horizontal rules
 */
export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className = '', style, color }) => {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Empty line
    if (!trimmed) {
      elements.push(<div key={`empty-${i}`} className="h-2" />);
      continue;
    }

    // Level 1 Heading (# text)
    if (trimmed.startsWith('# ')) {
      const text = trimmed.slice(2).trim();
      elements.push(
        <h1
          key={`h1-${i}`}
          className="text-[24px] font-black leading-[1.15] tracking-tight my-1 text-ink break-words font-retina"
          style={{ fontWeight: 900, color: color || undefined }}
        >
          {renderInlineMarkdown(text)}
        </h1>
      );
      continue;
    }

    // Level 2 Heading (## text)
    if (trimmed.startsWith('## ')) {
      const text = trimmed.slice(3).trim();
      elements.push(
        <h2
          key={`h2-${i}`}
          className="text-[18px] font-bold leading-[1.2] tracking-tight my-1 text-ink break-words font-retina"
          style={{ fontWeight: 700, color: color || undefined }}
        >
          {renderInlineMarkdown(text)}
        </h2>
      );
      continue;
    }

    // Level 3+ Heading (### text)
    if (/^#{3,}\s+/.test(trimmed)) {
      const text = trimmed.replace(/^#{3,}\s+/, '').trim();
      elements.push(
        <h3
          key={`h3-${i}`}
          className="text-[18px] font-bold leading-[1.2] tracking-tight my-0.5 text-ink break-words font-retina"
          style={{ fontWeight: 700, color: color || undefined }}
        >
          {renderInlineMarkdown(text)}
        </h3>
      );
      continue;
    }

    // Blockquote (> text)
    if (trimmed.startsWith('> ')) {
      const text = trimmed.slice(2).trim();
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="border-l-2 border-ink/40 pl-2.5 my-1 italic text-[15px] leading-[1.40] text-ink/80 break-words font-retina"
          style={{ color: color ? `${color}CC` : undefined, borderColor: color || undefined }}
        >
          {renderInlineMarkdown(text)}
        </blockquote>
      );
      continue;
    }

    // Unordered List (- item or * item)
    if (/^[-*]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s+/, '').trim();
      elements.push(
        <div key={`ul-${i}`} className="flex items-start gap-2 my-0.5 text-[15px] leading-[1.40] font-retina break-words">
          <span className="select-none font-bold text-ink/60 leading-[1.40]">•</span>
          <span className="flex-1 min-w-0">{renderInlineMarkdown(text)}</span>
        </div>
      );
      continue;
    }

    // Ordered List (1. item)
    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      const num = olMatch[1];
      const text = olMatch[2];
      elements.push(
        <div key={`ol-${i}`} className="flex items-start gap-1.5 my-0.5 text-[15px] leading-[1.40] font-retina break-words">
          <span className="select-none font-mono text-[13px] font-bold text-ink/60 leading-[1.60]">{num}.</span>
          <span className="flex-1 min-w-0">{renderInlineMarkdown(text)}</span>
        </div>
      );
      continue;
    }

    // Horizontal Rule (--- or ***)
    if (/^([-*_]){3,}$/.test(trimmed)) {
      elements.push(<hr key={`hr-${i}`} className="my-2 border-t border-ink/20" />);
      continue;
    }

    // Regular Paragraph: 15px, leading-[1.40] (default note body size)
    elements.push(
      <p
        key={`p-${i}`}
        className="text-[15px] leading-[1.40] font-normal my-0.5 break-words font-retina"
        style={{ color: color || undefined }}
      >
        {renderInlineMarkdown(rawLine)}
      </p>
    );
  }

  return (
    <div
      className={`markdown-content w-full h-full select-text cursor-text overflow-auto ${className}`}
      style={{ overflowWrap: 'anywhere', ...style }}
    >
      {elements}
    </div>
  );
};
