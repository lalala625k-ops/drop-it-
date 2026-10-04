import React, { useState, useEffect, useRef } from 'react';

interface FpsMeterProps {
  enabled: boolean;
  onToggle: () => void;
}

export const FpsMeter: React.FC<FpsMeterProps> = ({ enabled, onToggle }) => {
  const [fps, setFps] = useState<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      setFps(null);
      return;
    }

    frameCountRef.current = 0;
    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      frameCountRef.current++;
      const elapsed = now - lastTimeRef.current;

      // Update displayed FPS roughly every 350ms for stable and readable measurement
      if (elapsed >= 350) {
        if (elapsed > 1500) {
          // Tab backgrounded or long suspension; reset counter smoothly without glitching
          frameCountRef.current = 0;
          lastTimeRef.current = now;
        } else {
          const measured = Math.round((frameCountRef.current * 1000) / elapsed);
          setFps(measured);
          frameCountRef.current = 0;
          lastTimeRef.current = now;
        }
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [enabled]);

  return (
    <div
      className="fixed left-3 top-3 z-[115] select-none pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onToggle}
        title={
          enabled
            ? fps !== null
              ? `实时帧率: ${fps} FPS (点击关闭)`
              : '正在测量实时帧率 (点击关闭)'
            : '点击开启实时帧率显示'
        }
        className={`border border-ink px-2.5 py-1.5 text-xs font-bold transition-colors cursor-pointer rounded-[10px] flex items-center gap-2 select-none ${
          enabled ? 'bg-paper text-ink' : 'bg-paper text-ink hover:bg-stone/30'
        }`}
      >
        {/* Minimal switch track & thumb */}
        <span
          className={`relative inline-flex h-3.5 w-6 items-center rounded-full border border-ink transition-colors duration-150 ${
            enabled ? 'bg-ink' : 'bg-stone/40'
          }`}
        >
          <span
            className={`inline-block h-2 w-2 transform rounded-full transition-transform duration-150 ${
              enabled ? 'translate-x-3 bg-paper' : 'translate-x-0.5 bg-ink'
            }`}
          />
        </span>
        <span className="font-mono tracking-tight font-bold">
          {enabled ? (fps !== null ? `${fps} FPS` : '-- FPS') : 'FPS'}
        </span>
      </button>
    </div>
  );
};
