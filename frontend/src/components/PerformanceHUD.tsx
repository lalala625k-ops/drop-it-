import React, { useState, useEffect, useRef } from 'react';

interface PerformanceHUDProps {
  enabled: boolean;
  cardsCount: number;
  visibleCardsCount: number;
}

export const PerformanceHUD: React.FC<PerformanceHUDProps> = ({
  enabled,
  cardsCount,
  visibleCardsCount,
}) => {
  const [frameTime, setFrameTime] = useState<number | null>(null);
  const [memoryMB, setMemoryMB] = useState<number | null>(null);
  const [domNodes, setDomNodes] = useState<number>(0);
  const [longTasks, setLongTasks] = useState<number>(0);
  const [showDetail, setShowDetail] = useState(false);

  const rafIdRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(0);
  const longTaskCountRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      setFrameTime(null);
      return;
    }

    // Set up Long Task Observer if supported
    let observer: PerformanceObserver | null = null;
    try {
      if (
        typeof PerformanceObserver !== 'undefined' &&
        PerformanceObserver.supportedEntryTypes?.includes('longtask')
      ) {
        observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          longTaskCountRef.current += entries.length;
          setLongTasks(longTaskCountRef.current);
        });
        observer.observe({ entryTypes: ['longtask'] });
      }
    } catch {
      // Ignored if not supported
    }

    frameCountRef.current = 0;
    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      frameCountRef.current++;
      const elapsed = now - lastTimeRef.current;

      if (elapsed >= 350) {
        if (elapsed > 1500) {
          // Tab backgrounded; reset interval cleanly
          frameCountRef.current = 0;
          lastTimeRef.current = now;
        } else {
          // Calculate average frame duration in ms
          const avgFt = Number((elapsed / frameCountRef.current).toFixed(1));
          setFrameTime(avgFt);

          // Measure JS Heap Memory (Chromium / Edge WebView2)
          const perfMemory = (performance as any)?.memory;
          if (perfMemory?.usedJSHeapSize) {
            setMemoryMB(Math.round(perfMemory.usedJSHeapSize / (1024 * 1024)));
          }

          // Count DOM elements
          setDomNodes(document.getElementsByTagName('*').length);

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
      if (observer) {
        observer.disconnect();
      }
    };
  }, [enabled]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDetail) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDetail(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [showDetail]);

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      className="relative select-none pointer-events-auto"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setShowDetail((prev) => !prev)}
        title="点击展开/收起流畅度诊断详情"
        className="border border-ink bg-paper px-2.5 py-1.5 text-xs font-mono font-bold text-ink hover:bg-stone/30 transition-colors cursor-pointer rounded-[10px] flex items-center gap-2 shadow-none"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-ink" />
        <span title="单帧耗时">{frameTime !== null ? `${frameTime}ms` : '--ms'}</span>
        <span className="text-ash font-normal">|</span>
        <span title="JS堆内存">{memoryMB !== null ? `${memoryMB}MB` : 'DOM'}</span>
        <span className="text-ash font-normal">|</span>
        <span title="视口活跃便签数 / 画布总数">
          {visibleCardsCount}/{cardsCount}卡
        </span>
        {longTasks > 0 && (
          <span
            className="bg-ink text-paper px-1 rounded text-[10px]"
            title="主线程阻塞 >50ms 掉帧次数"
          >
            !{longTasks}
          </span>
        )}
      </button>

      {/* Detailed Diagnostic Popover on Click */}
      {showDetail && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-72 border-2 border-ink bg-paper p-3 text-ink font-sans shadow-[4px_4px_0px_#1d1d1d] animate-in fade-in duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-ink/20 pb-1.5 mb-2">
            <span className="text-xs font-black font-retina">⚡ 流畅度实时诊断</span>
            <button
              type="button"
              onClick={() => setShowDetail(false)}
              className="text-xs font-bold text-ink/60 hover:text-ink cursor-pointer px-1"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between font-mono">
              <span className="text-ink/70">单帧耗时 (FT):</span>
              <span className="font-bold">{frameTime !== null ? `${frameTime} ms` : '--'}</span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-ink/70">JS 堆内存 (Heap):</span>
              <span className="font-bold">{memoryMB !== null ? `${memoryMB} MB` : 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-ink/70">视口卡片 (Culling):</span>
              <span className="font-bold">
                {visibleCardsCount} / {cardsCount}{' '}
                <span className="text-[10px] text-ink/60">
                  ({cardsCount > 0 ? Math.round(((cardsCount - visibleCardsCount) / cardsCount) * 100) : 0}% 剔除)
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-ink/70">DOM 节点总数:</span>
              <span className="font-bold">{domNodes} 个</span>
            </div>
            <div className="flex items-center justify-between font-mono">
              <span className="text-ink/70">长任务阻塞 (&gt;50ms):</span>
              <span className={`font-bold ${longTasks > 0 ? 'underline' : ''}`}>
                {longTasks} 次
              </span>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-ink/20 text-[10px] text-ink/60 leading-tight">
            基准：60Hz 需 ≤16.6ms；视口剔除确保画布缩放拖拽时 DOM 负载恒定。
          </div>
        </div>
      )}
    </div>
  );
};
