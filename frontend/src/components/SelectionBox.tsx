import React from 'react';
import { Rect } from '../types';

interface SelectionBoxProps {
  box: Rect | null;
}

export const SelectionBox: React.FC<SelectionBoxProps> = ({ box }) => {
  if (!box) return null;

  const left = box.width < 0 ? box.x + box.width : box.x;
  const top = box.height < 0 ? box.y + box.height : box.y;
  const width = Math.abs(box.width);
  const height = Math.abs(box.height);

  return (
    <div
      className="absolute border border-ink/40 bg-stone/20 pointer-events-none rounded-none"
      style={{
        transform: `translate(${left}px, ${top}px)`,
        width: `${width}px`,
        height: `${height}px`,
        borderStyle: 'dashed',
        borderWidth: '1px',
        zIndex: 9999,
      }}
    />
  );
};
