import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Group } from '../types';
import { groupColorText } from '../utils/groupColors';
import { parseMarkdownHeading } from '../utils/headingUtils';

interface GroupComponentProps {
  group: Group;
  isSelected: boolean;
  childCount: number;
  isDragOver: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onRename: (id: string, newTitle: string) => void;
  onUngroup?: (id: string) => void;
}

const GroupComponentInner: React.FC<GroupComponentProps> = ({
  group,
  isSelected,
  childCount,
  isDragOver,
  onSelect,
  onRename,
  onUngroup,
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
      title="拖动时整体移动关联卡片；Ctrl 拖动仅移动父物体；双击重命名"
      className={`group absolute top-0 left-0 select-none flex flex-col items-center justify-center rounded-full cursor-grab active:cursor-grabbing transition-colors duration-150 ${
        isDragOver
          ? 'bg-ink text-paper border-2 border-ink scale-110'
          : isSelected
          ? 'bg-paper text-ink border-[3px] border-ink'
          : 'bg-paper text-ink border border-ink hover:border-2'
      }`}
      style={{
        backgroundColor: !isDragOver ? (group.color || undefined) : undefined,
        color: !isDragOver && group.color ? groupColorText(group.color) : undefined,
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

      {!isDragOver && (
        <div className="flex w-[90%] flex-col items-center justify-center gap-1 text-center pointer-events-none">
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
              className="w-full px-1 py-0.5 text-[11px] font-bold text-center text-ink bg-paper border border-ink rounded-[10px] outline-none font-retina pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (() => {
            const parsedHeading = parseMarkdownHeading(group.title);
            const isL1 = parsedHeading.hasMarkdownPrefix && parsedHeading.level === 1;
            const isL2 = parsedHeading.hasMarkdownPrefix && parsedHeading.level === 2;
            const headingSize = isL1 ? '20px' : isL2 ? '16px' : '12px';
            const headingWeight = isL1 ? 900 : 700;
            const headingLeading = isL1 ? 1.15 : 1.2;
            return (
              <div
                className="w-full overflow-hidden break-words font-retina tracking-tight"
                style={{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: isL1 ? 2 : 3,
                  fontSize: headingSize,
                  fontWeight: headingWeight,
                  lineHeight: headingLeading,
                }}
                title={parsedHeading.cleanText || group.title}
              >
                {parsedHeading.cleanText || group.title}
              </div>
            );
          })()}
          <div title={`${childCount} 个关联子卡片`} className="text-[11px] leading-none font-bold font-mono opacity-70">
            {childCount}
          </div>
        </div>
      )}
    </div>
  );
};

export const GroupComponent = React.memo(GroupComponentInner, (previous, next) =>
  previous.group === next.group && previous.isSelected === next.isSelected &&
  previous.childCount === next.childCount && previous.isDragOver === next.isDragOver);
