import React, { useEffect, useRef, useState } from 'react';
import { MenuShortcutHint, useMenuShortcutHint } from './MenuShortcutHint';
import { pieGestureMoved, Point } from '../utils/pieMenuGeometry';
import { RadialAction, RadialItem, RadialItemId } from '../utils/radialMenuModel';
import { placeRadialMenu, RADIAL_SIZE, radialBounds, radialButtons, radialLink, radialMenuAt } from '../utils/radialMenuGeometry';
interface Props {
  position: Point; items: RadialItem[]; rightMouseDown?: boolean;
  onAction: (id: RadialAction) => void; onClose: () => void;
  backdrop?: boolean; attribute?: 'canvas' | 'object';
}
export const RadialCommandMenu: React.FC<Props> = ({ position, items, rightMouseDown = true,
  onAction, onClose, backdrop = false, attribute = 'object' }) => {
  const [branch, setBranch] = useState<string | null>(null);
  const branchRef = useRef<string | null>(null);
  const [active, setActive] = useState<RadialItemId | null>(null);
  const rightHeld = useRef(rightMouseDown);
  const { hint, showHint, hideHint } = useMenuShortcutHint();
  const { center, scale } = placeRadialMenu(position, items, { width: window.innerWidth, height: window.innerHeight });
  const buttons = radialButtons(items, branch);
  const bounds = radialBounds(buttons);
  const choose = (id: RadialItemId) => {
    const item = radialButtons(items, branchRef.current).find((button) => button.id === id);
    if (!item || item.disabled) return;
    if (item.children) { branchRef.current = id; setBranch(id); }
    else onAction(id as RadialAction);
  };
  const hover = (id: RadialItemId | null) => {
    setActive(id);
    const button = radialButtons(items, branchRef.current).find((item) => item.id === id);
    if (button?.children) { branchRef.current = button.id; setBranch(button.id); }
    else if (button && !button.parent) { branchRef.current = null; setBranch(null); }
    if (!button?.shortcut || button.disabled) { hideHint(); return; }
    const x = center.x + button.point.x * scale, y = center.y + button.point.y * scale, size = RADIAL_SIZE * scale;
    showHint({ getBoundingClientRect: () => ({ left: x - size / 2, top: y - size / 2,
      bottom: y + size / 2, right: x + size / 2, width: size, height: size } as DOMRect) } as HTMLElement, button.shortcut);
  };
  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!rightHeld.current) return;
      if (!(event.buttons & 2)) { rightHeld.current = false; onClose(); return; }
      hover(pieGestureMoved(position, { x: event.clientX, y: event.clientY })
        ? radialMenuAt({ x: event.clientX, y: event.clientY }, center, scale, items, branchRef.current) : null);
    };
    const release = (event: MouseEvent) => {
      if (event.button !== 2 || !rightHeld.current) return;
      rightHeld.current = false; setActive(null); hideHint();
      if (!pieGestureMoved(position, { x: event.clientX, y: event.clientY })) { onClose(); return; }
      const id = radialMenuAt({ x: event.clientX, y: event.clientY }, center, scale, items, branchRef.current);
      const item = radialButtons(items, branchRef.current).find((button) => button.id === id);
      // Branches expand while held. Releasing always ends the gesture; only
      // an enabled leaf can execute, including leaves that open an editor.
      if (item && !item.disabled && !item.children) choose(item.id); else onClose();
    };
    const cancel = () => { if (rightHeld.current) { rightHeld.current = false; hideHint(); onClose(); } };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    window.addEventListener('mousemove', move, { passive: true }); window.addEventListener('mouseup', release, true);
    // Chromium suppresses mouseup on disabled buttons; pointerup still ends
    // the gesture there. The held flag prevents duplicate execution.
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', release, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key); };
  }, [position.x, position.y, center.x, center.y, scale, items, onAction, onClose]);
  return <div data-radial-menu className={`fixed inset-0 z-[10002] pointer-events-auto select-none ${backdrop ? 'bg-ink/30 backdrop-blur-sm' : ''}`}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
    <div className="absolute" data-radial-center style={{ left: center.x, top: center.y,
      transform: `scale(${scale})`, transformOrigin: '0 0' }} onMouseDown={(event) => event.stopPropagation()}>
      <svg data-radial-links className="absolute pointer-events-none" style={{ left: bounds.left, top: bounds.top }}
        width={bounds.right - bounds.left} height={bounds.bottom - bounds.top}
        viewBox={`${bounds.left} ${bounds.top} ${bounds.right - bounds.left} ${bounds.bottom - bounds.top}`} aria-hidden="true">
        {buttons.map((item) => {
          const parent = buttons.find((candidate) => candidate.id === item.parent);
          const link = radialLink(parent?.point || { x: 0, y: 0 }, item.point, parent ? RADIAL_SIZE / 2 : 16);
          return <g key={item.id} stroke="#a8a7a2" fill="#a8a7a2" opacity={item.disabled ? 0.3 : 0.8}>
            <line x1={link.start.x} y1={link.start.y} x2={link.end.x} y2={link.end.y} strokeWidth="1" />
            <circle cx={link.start.x} cy={link.start.y} r="2.5" /><circle cx={link.end.x} cy={link.end.y} r="2.5" />
          </g>;
        })}
      </svg>
      {buttons.map((item) => <button key={item.id} type="button" disabled={item.disabled}
        data-canvas-command={attribute === 'canvas' ? item.id : undefined}
        data-pie-item={attribute === 'object' ? item.id : undefined} data-radial-item={item.id}
        data-radial-parent={item.parent} aria-label={item.description} title={item.description}
        aria-expanded={item.children ? branch === item.id : undefined}
        className={`absolute flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-ink px-1.5 text-center disabled:cursor-not-allowed disabled:opacity-40 ${active === item.id ? 'bg-paper text-ink' : 'bg-ink text-paper hover:bg-paper hover:text-ink'}`}
        style={{ left: item.point.x - RADIAL_SIZE / 2, top: item.point.y - RADIAL_SIZE / 2 }}
        onMouseEnter={() => hover(item.id)} onMouseLeave={() => { setActive(null); hideHint(); }} onClick={() => choose(item.id)}>
        <span className="max-w-[58px] text-[11px] font-bold leading-[1.2] tracking-[0.02em]">{item.label}</span>
      </button>)}
      <div className="absolute h-8 w-8 rounded-full border-2 border-ink bg-ink" style={{ left: -16, top: -16 }} aria-hidden="true" />
    </div>
    <MenuShortcutHint hint={hint} />
  </div>;
};
