import React from 'react';
import { Card } from '../../types';

export type ResizeHandleDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface CardResizeHandlesProps {
  card: Card;
  isSelected: boolean;
  onStartResize: (card: Card, handle: ResizeHandleDirection, e: React.MouseEvent) => void;
}

export const CardResizeHandles: React.FC<CardResizeHandlesProps> = ({
  card,
  isSelected,
  onStartResize,
}) => {
  const handleMouseDown = (dir: ResizeHandleDirection) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onStartResize(card, dir, e);
  };

  return (
    <>
      <div
        data-resize-handle="n"
        className="absolute z-40 cursor-ns-resize top-0 left-2 right-2 h-1.5 -translate-y-1/2"
        onMouseDown={handleMouseDown('n')}
      />
      <div
        data-resize-handle="s"
        className="absolute z-40 cursor-ns-resize bottom-0 left-2 right-2 h-1.5 translate-y-1/2"
        onMouseDown={handleMouseDown('s')}
      />
      <div
        data-resize-handle="w"
        className="absolute z-40 cursor-ew-resize left-0 top-2 bottom-2 w-1.5 -translate-x-1/2"
        onMouseDown={handleMouseDown('w')}
      />
      <div
        data-resize-handle="e"
        className="absolute z-40 cursor-ew-resize right-0 top-2 bottom-2 w-1.5 translate-x-1/2"
        onMouseDown={handleMouseDown('e')}
      />
      <div
        data-resize-handle="nw"
        className={`absolute z-40 cursor-nwse-resize top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 ${
          isSelected ? 'bg-paper border-2 border-ink' : 'hover:bg-ash'
        }`}
        onMouseDown={handleMouseDown('nw')}
      />
      <div
        data-resize-handle="ne"
        className={`absolute z-40 cursor-nesw-resize top-0 right-0 translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 ${
          isSelected ? 'bg-paper border-2 border-ink' : 'hover:bg-ash'
        }`}
        onMouseDown={handleMouseDown('ne')}
      />
      <div
        data-resize-handle="se"
        className={`absolute z-40 cursor-nwse-resize bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-2.5 h-2.5 ${
          isSelected ? 'bg-paper border-2 border-ink' : 'hover:bg-ash'
        }`}
        onMouseDown={handleMouseDown('se')}
      />
      <div
        data-resize-handle="sw"
        className={`absolute z-40 cursor-nesw-resize bottom-0 left-0 -translate-x-1/2 translate-y-1/2 w-2.5 h-2.5 ${
          isSelected ? 'bg-paper border-2 border-ink' : 'hover:bg-ash'
        }`}
        onMouseDown={handleMouseDown('sw')}
      />
    </>
  );
};
