import React from 'react';
import { SettingsTreeNode } from './settingsTreeLayout';

export function SettingsNode({ node, children, onClick, active, title, id, expanded, locked, hint }: {
  node: SettingsTreeNode;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
  id?: string;
  expanded?: boolean;
  locked?: boolean;
  hint?: string;
}) {
  const style: React.CSSProperties = {
    left: node.x - node.width / 2, top: node.y - node.height / 2,
    width: node.width, height: node.height, border: `${[3, 2, 1][node.level]}px solid #1d1d1d`,
  };
  const className = `group/settings-node absolute z-10 flex items-center justify-center bg-paper text-ink rounded-none text-[13px] font-medium leading-snug px-3 ${locked ? 'pr-7' : ''}`;
  const hintId = id && hint ? `${id}-hint` : undefined;
  const content = <>
    {children}
    {locked && <svg role="img" aria-label="不可调整" viewBox="0 0 24 24" width="12" height="12"
      fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      className="pointer-events-none absolute bottom-1 right-1 text-ink/55">
      <rect x="5" y="10" width="14" height="11" rx="1" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4" />
    </svg>}
    {hint && !active && <span id={hintId} role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[13px] font-normal leading-none text-ink/60 opacity-0 transition-opacity group-hover/settings-node:opacity-100 group-focus-visible/settings-node:opacity-100">
      {hint}
    </span>}
  </>;
  return onClick ? (
    <button type="button" data-settings-node={id} style={style} title={title}
      aria-expanded={expanded} aria-describedby={active ? undefined : hintId} onClick={onClick}
      className={`${className} cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink ${active ? '!bg-ink !text-paper' : 'hover:bg-stone/30'}`}>
      {content}
    </button>
  ) : <div data-settings-node={id} style={style} title={title} className={className}>{content}</div>;
}
