export interface MarkdownHeading {
  level: 1 | 2;
  cleanText: string;
  rawText: string;
  hasMarkdownPrefix: boolean;
}

/**
 * Parses markdown heading syntax from a note's title string.
 * - '# ' + space -> Level 1 (一级标题: 24px, font-black)
 * - '## ' + space -> Level 2 (二级标题: 18px, font-bold)
 * - '### ' or more -> mapped to Level 2
 * - Plain text without prefix -> defaults to Level 1
 */
export function parseMarkdownHeading(rawText: string | null | undefined): MarkdownHeading {
  if (!rawText) {
    return { level: 1, cleanText: '', rawText: '', hasMarkdownPrefix: false };
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return { level: 1, cleanText: '', rawText: '', hasMarkdownPrefix: false };
  }

  // Check for '## ' (Level 2)
  if (trimmed.startsWith('## ')) {
    return {
      level: 2,
      cleanText: trimmed.slice(3).trim(),
      rawText: trimmed,
      hasMarkdownPrefix: true,
    };
  }

  // Check for '### ' or more (map to Level 2)
  if (/^#{3,}\s+/.test(trimmed)) {
    return {
      level: 2,
      cleanText: trimmed.replace(/^#{3,}\s+/, '').trim(),
      rawText: trimmed,
      hasMarkdownPrefix: true,
    };
  }

  // Check for '# ' (Level 1)
  if (trimmed.startsWith('# ')) {
    return {
      level: 1,
      cleanText: trimmed.slice(2).trim(),
      rawText: trimmed,
      hasMarkdownPrefix: true,
    };
  }

  // Plain text without markdown prefix defaults to Level 1
  return {
    level: 1,
    cleanText: trimmed,
    rawText: trimmed,
    hasMarkdownPrefix: false,
  };
}
