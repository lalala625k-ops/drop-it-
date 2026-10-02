import React, { useState } from 'react';

type Hint = { shortcut: string | null; x: number; y: number; above: boolean };

export const useMenuShortcutHint = () => {
  const [hint, setHint] = useState<Hint | null>(null);

  const showHint = (element: HTMLElement, shortcut: string | null) => {
    const rect = element.getBoundingClientRect();
    const above = rect.bottom + 50 > window.innerHeight;
    setHint({
      shortcut,
      x: Math.max(80, Math.min(window.innerWidth - 80, rect.left + rect.width / 2)),
      y: above ? rect.top - 8 : rect.bottom + 8,
      above,
    });
  };

  return { hint, showHint, hideHint: () => setHint(null) };
};

export const MenuShortcutHint: React.FC<{ hint: Hint | null }> = ({ hint }) => {
  if (!hint) return null;
  return <div className="fixed z-[10003] pointer-events-none whitespace-nowrap rounded-[8px] border border-ink bg-paper px-2.5 py-1.5 text-[11px] font-bold text-ink shadow-sm"
    style={{ left: hint.x, top: hint.y, transform: hint.above ? 'translate(-50%, -100%)' : 'translateX(-50%)' }}
    role="tooltip">
    {hint.shortcut ? `快捷键 ${hint.shortcut}` : '暂无快捷键'}
  </div>;
};
