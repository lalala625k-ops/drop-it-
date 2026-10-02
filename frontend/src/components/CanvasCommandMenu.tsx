import React, { useEffect } from 'react';

export type CanvasCommand = 'note' | 'parent' | 'group' | 'search' | 'copy' | 'paste' | 'fit';

interface Props {
  position: { x: number; y: number };
  canCopy: boolean;
  canPaste: boolean;
  onCommand: (command: CanvasCommand) => void;
  onClose: () => void;
}

const SIZE = 72;
const RADIUS = 144;
const EXTENT = 190;
const items: { id: CanvasCommand; label: string }[] = [
  { id: 'note', label: '新建便签' },
  { id: 'parent', label: '新建父物体' },
  { id: 'group', label: 'Group' },
  { id: 'search', label: '搜索' },
  { id: 'copy', label: '复制' },
  { id: 'paste', label: '粘贴' },
  { id: 'fit', label: '全览' },
];

export const CanvasCommandMenu: React.FC<Props> = ({ position, canCopy, canPaste, onCommand, onClose }) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const scale = Math.min(1, (window.innerWidth - 24) / (EXTENT * 2), (window.innerHeight - 24) / (EXTENT * 2));
  const margin = EXTENT * scale + 12;
  const centerX = Math.max(margin, Math.min(window.innerWidth - margin, position.x));
  const centerY = Math.max(margin, Math.min(window.innerHeight - margin, position.y));

  return <div className="fixed inset-0 z-[10002] pointer-events-auto select-none" onMouseDown={onClose}
    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}>
    <div className="absolute" style={{ left: centerX, top: centerY, width: EXTENT * 2,
      height: EXTENT * 2, transform: `translate(-50%, -50%) scale(${scale})` }}
      onMouseDown={(event) => event.stopPropagation()}>
      {items.map(({ id, label }, index) => {
        const radians = (-90 + index * 360 / items.length) * Math.PI / 180;
        const disabled = id === 'copy' && !canCopy || id === 'paste' && !canPaste;
        return <button key={id} type="button" disabled={disabled} title={label}
          className="absolute flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-ink bg-ink px-1.5 text-center text-paper hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          style={{ left: EXTENT + Math.cos(radians) * RADIUS - SIZE / 2,
            top: EXTENT + Math.sin(radians) * RADIUS - SIZE / 2 }}
          onClick={() => onCommand(id)}>
          <span className="max-w-[58px] text-[11px] font-bold leading-[1.2] tracking-[0.02em]">{label}</span>
        </button>;
      })}
      <div className="absolute h-8 w-8 rounded-full border-2 border-ink bg-ink"
        style={{ left: EXTENT - 16, top: EXTENT - 16 }} aria-hidden="true" />
    </div>
  </div>;
};
