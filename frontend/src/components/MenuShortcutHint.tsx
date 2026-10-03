import React, { useState } from 'react';

type Hint = { shortcut: string | null; x: number; y: number; above: boolean };

export const useMenuShortcutHint = () => {
  const [hint, setHint] = useState<Hint | null>(null);

  const showHint = (element: HTMLElement, shortcut: string | null) => {
    if (!shortcut) return;
    const rect = element.getBoundingClientRect();
    const above = rect.bottom + 40 > window.innerHeight;
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
  if (!hint || !hint.shortcut) return null;
  return <div className="fixed z-[10003] pointer-events-none whitespace-nowrap text-[12px] font-mono font-bold text-ink select-none tracking-wide"
    style={{ left: hint.x, top: hint.y, transform: hint.above ? 'translate(-50%, -100%)' : 'translateX(-50%)' }}
    role="tooltip">
    {hint.shortcut}
  </div>;
};
