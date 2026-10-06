import React, { useState, useRef, useEffect } from 'react';
import { CanvasPin } from '../hooks/useCanvasPins';
import { PIN_PATH, pinScale } from '../utils/canvasPinGeometry';

interface CanvasPinsLayerProps {
  pins: CanvasPin[];
  selectedPinIds: Set<string>;
  onSelect: (id: string, shift: boolean) => void;
  onJump: (index: number) => void;
  onRemove: (index: number) => void;
  onUpdatePosition: (index: number, x: number, y: number) => void;
  zoom: number;
}

interface DragState {
  index: number;
  startWorld: { x: number; y: number };
  startMouse: { x: number; y: number };
  currentMouse: { x: number; y: number };
  hasMoved: boolean;
  jumpOnRelease: boolean;
}

export const CanvasPinsLayer: React.FC<CanvasPinsLayerProps> = ({
  pins,
  selectedPinIds,
  onSelect,
  onJump,
  onRemove,
  onUpdatePosition,
  zoom,
}) => {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const current = dragStateRef.current;
      if (!current) return;
      const dx = e.clientX - current.startMouse.x;
      const dy = e.clientY - current.startMouse.y;
      const hasMoved = current.hasMoved || Math.hypot(dx, dy) > 4;

      setDragState({
        ...current,
        currentMouse: { x: e.clientX, y: e.clientY },
        hasMoved,
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      const current = dragStateRef.current;
      if (current) {
        if (current.hasMoved) {
          const dx = e.clientX - current.startMouse.x;
          const dy = e.clientY - current.startMouse.y;
          const finalX = current.startWorld.x + dx / zoom;
          const finalY = current.startWorld.y + dy / zoom;
          onUpdatePosition(current.index, finalX, finalY);
        } else if (current.jumpOnRelease) {
          onJump(current.index);
        }
      }
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, onJump, onUpdatePosition, zoom]);

  if (!pins.length) return null;

  // Scale pin slightly when zoom is very far so it stays readable, but keep it elegant
  const scale = pinScale(zoom);

  return (
    <div className="absolute inset-0 pointer-events-none z-[12]">
      {pins.map((pin) => {
        const isDragging = dragState?.index === pin.index;
        const currentX = isDragging
          ? pin.x + (dragState.currentMouse.x - dragState.startMouse.x) / zoom
          : pin.x;
        const currentY = isDragging
          ? pin.y + (dragState.currentMouse.y - dragState.startMouse.y) / zoom
          : pin.y;

        return (
          <div
            key={pin.id}
            data-pin-id={pin.id}
            className={`group absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto select-none flex items-center justify-center ${
              isDragging ? 'z-50' : ''
            }`}
            style={{
              left: currentX,
              top: currentY,
              transform: `translate(-50%, -50%) scale(${scale})`,
              transformOrigin: 'center center',
            }}
            title={`图钉 ${pin.index} · 框选或 Shift+单击选择，拖拽移动，按 Ctrl+${pin.index} 跳转，右键删除`}
          >
            {/* Main Pin Graphic (2x Enlarged Filleted Cross + Concentric Number Dot) */}
            <div
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                if (e.shiftKey || !selectedPinIds.has(pin.id)) onSelect(pin.id, e.shiftKey);
                setDragState({
                  index: pin.index,
                  startWorld: { x: pin.x, y: pin.y },
                  startMouse: { x: e.clientX, y: e.clientY },
                  currentMouse: { x: e.clientX, y: e.clientY },
                  hasMoved: false,
                  jumpOnRelease: !e.shiftKey && !selectedPinIds.has(pin.id),
                });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(pin.index);
              }}
              className={`relative w-[88px] h-[88px] select-none transition-transform duration-75 flex items-center justify-center ${
                selectedPinIds.has(pin.id) ? 'outline outline-2 outline-ink outline-offset-4' : ''
              } ${
                isDragging
                  ? 'cursor-grabbing scale-105 drop-shadow-md'
                  : 'cursor-grab hover:scale-105 active:scale-95'
              }`}
            >
              {/* Filleted Cross (SVG) - 2x scale with 18px inner fillet radius */}
              <svg
                width="88"
                height="88"
                viewBox="0 0 88 88"
                className="absolute inset-0 pointer-events-none fill-ink drop-shadow-sm"
              >
                <path
                  d={PIN_PATH}
                />
              </svg>

              {/* Bottom-right black dot with pin number - concentric with the 18px fillet (center at 66.5, 66.5) */}
              <div
                className={`pin-dot-jump absolute left-[57px] top-[57px] w-[19px] h-[19px] rounded-full bg-ink border border-paper/40 flex items-center justify-center shadow-sm pointer-events-none ${
                  isDragging ? '!animation-none' : ''
                }`}
              >
                <span className="font-mono font-bold text-[11px] text-paper leading-none select-none">
                  {pin.index}
                </span>
              </div>

              {/* Remove button on hover (hidden while dragging) */}
              {!isDragging && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(pin.index);
                  }}
                  title={`移除图钉 ${pin.index}`}
                  className="absolute top-2 right-2 w-4 h-4 rounded-full bg-paper border border-ink text-ink text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-ink hover:text-paper transition-opacity cursor-pointer shadow-sm z-10"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
