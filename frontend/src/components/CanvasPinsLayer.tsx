import React from 'react';
import { CanvasPin } from '../hooks/useCanvasPins';

interface CanvasPinsLayerProps {
  pins: CanvasPin[];
  onJump: (index: number) => void;
  onRemove: (index: number) => void;
  zoom: number;
}

export const CanvasPinsLayer: React.FC<CanvasPinsLayerProps> = ({
  pins,
  onJump,
  onRemove,
  zoom,
}) => {
  if (!pins.length) return null;

  // Scale pin slightly when zoom is very far so it stays readable, but keep it elegant
  const scale = zoom < 0.4 ? Math.min(2.0, 0.4 / zoom) : 1;

  return (
    <div className="absolute inset-0 pointer-events-none z-[12]">
      {pins.map((pin) => (
        <div
          key={pin.id}
          className="group absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto select-none flex items-center justify-center"
          style={{
            left: pin.x,
            top: pin.y,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center center',
          }}
          title={`图钉 ${pin.index} · 双击或按 Ctrl+${pin.index} 跳转`}
        >
          {/* Main Pin Badge */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onJump(pin.index);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove(pin.index);
            }}
            className="relative px-2.5 h-8 bg-paper border-2 border-ink shadow-sharp flex items-center gap-1 cursor-pointer transition-all duration-150 hover:bg-ink hover:text-paper hover:scale-110 active:scale-95"
          >
            <span className="text-xs">📌</span>
            <span className="font-mono font-black text-sm">{pin.index}</span>
            <span className="text-[10px] font-mono opacity-60 ml-0.5">Ctrl+{pin.index}</span>

            {/* Remove button on hover */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(pin.index);
              }}
              title={`移除图钉 ${pin.index}`}
              className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-paper border border-ink text-ink text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-ink hover:text-paper transition-opacity cursor-pointer shadow-sm"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
