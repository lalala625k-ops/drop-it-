import React, { useState, useRef, useEffect } from 'react';
import { Group } from '../types';
import { groupColorText } from '../utils/groupColors';

interface GroupComponentProps {
  group: Group;
  isSelected: boolean;
  childCount: number;
  isDragOver: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onRename: (id: string, newTitle: string) => void;
  onUngroup?: (id: string) => void;
  onOpenMenu?: (x: number, y: number) => void;
}

export const GroupComponent: React.FC<GroupComponentProps> = ({
  group,
  isSelected,
  childCount,
  isDragOver,
  onSelect,
  onRename,
  onUngroup,
  onOpenMenu,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(group.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const size = group.width || 120;

  useEffect(() => {
    setTitle(group.title);
  }, [group.title]);

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleFinishRename = () => {
    setIsEditingTitle(false);
    if (title.trim() && title !== group.title) {
      onRename(group.id, title.trim());
    } else {
      setTitle(group.title);
    }
  };

  return (
    <div
      data-group-id={group.id}
      title="直接拖动仅移动父物体，按住 Ctrl 拖动整体移动关联卡片，双击重命名"
      className={`group absolute top-0 left-0 select-none flex flex-col items-center justify-center rounded-full cursor-grab active:cursor-grabbing transition-colors duration-150 ${
        isDragOver
          ? 'bg-ink text-paper border-2 border-ink scale-110'
          : isSelected
          ? 'bg-ink text-paper border-2 border-ink'
          : 'bg-paper text-ink border border-ink hover:border-2'
      }`}
      style={{
        backgroundColor: !isDragOver && !isSelected ? (group.color || undefined) : undefined,
        color: !isDragOver && !isSelected && group.color ? groupColorText(group.color) : undefined,
        transform: `translate(${group.x}px, ${group.y}px)`,
        width: size,
        height: size,
        zIndex: group.zIndex ?? 5,
        willChange: 'transform',
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onSelect(e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditingTitle(true);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenMenu?.(e.clientX, e.clientY);
      }}
    >
      {/* Dissolve / Delete button on hover */}
      {onUngroup && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUngroup(group.id);
          }}
          title="解散父物体 (保留子卡片)"
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-paper text-ink border border-ink hover:bg-ink hover:text-paper flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-30 cursor-pointer"
        >
          <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Child count badge (top-left pill) */}
      {childCount > 0 && !isDragOver && (
        <div
          title={`${childCount} 个关联子卡片`}
          className="absolute -top-1.5 -left-1.5 px-1.5 min-w-[16px] h-4 text-[9px] font-bold font-mono rounded-[10px] bg-ink text-paper border border-paper flex items-center justify-center z-20 pointer-events-none"
        >
          {childCount}
        </div>
      )}

      {/* Drop indicator arrow when dragging card over (pure minimalist circle otherwise) */}
      {isDragOver && (
        <div className="flex flex-col items-center justify-center pointer-events-none">
          <svg
            className="w-6 h-6 text-paper animate-bounce"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      )}

      {/* Label and Title below the circle */}
      <div className="absolute top-full mt-1.5 flex flex-col items-center z-20 pointer-events-auto">
        {isEditingTitle ? (
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleFinishRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFinishRename();
              if (e.key === 'Escape') {
                setTitle(group.title);
                setIsEditingTitle(false);
              }
            }}
            className="w-24 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-center text-ink bg-paper border border-ink rounded-[10px] outline-none font-retina"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            title="双击重命名父物体"
            className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-ink bg-paper border border-ink rounded-[10px] whitespace-nowrap max-w-[120px] truncate select-none cursor-text hover:border-2 transition-all"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditingTitle(true);
            }}
          >
            {group.title}
          </div>
        )}
      </div>
    </div>
  );
};
