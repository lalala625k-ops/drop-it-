import React, { useEffect, useRef, useState } from 'react';

type WindowAction = 'minimize' | 'toggle_maximize' | 'close';

interface DesktopWindowApi {
  minimize: () => Promise<void> | void;
  toggle_maximize: () => Promise<void> | void;
  close: () => Promise<void> | void;
  begin_move: () => Promise<void>;
  begin_resize: (edge: string) => Promise<void>;
  get_window_state: () => Promise<{ maximized: boolean }>;
}

interface DesktopWindowHost {
  pywebview?: {
    api?: DesktopWindowApi;
  };
}

const isDesktopShell = () => new URLSearchParams(window.location.search).has('desktop');

export const DesktopWindowControls: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isDesktopShell()) return;
    const markReady = () => setReady(true);
    window.addEventListener('pywebviewready', markReady);
    if ((window as DesktopWindowHost).pywebview?.api) markReady();
    return () => window.removeEventListener('pywebviewready', markReady);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const syncState = () => {
      const api = (window as DesktopWindowHost).pywebview?.api;
      if (api?.get_window_state) void api.get_window_state().then((state) => {
        if (active) setMaximized(state.maximized);
      }).catch(() => {});
    };
    syncState();
    window.addEventListener('resize', syncState);
    return () => { active = false; window.removeEventListener('resize', syncState); };
  }, [ready]);

  useEffect(() => {
    if (!dragging) return;
    const release = () => { dragStart.current = null; setDragging(false); };
    const move = (event: MouseEvent) => {
      const start = dragStart.current;
      if (!start) return;
      if (!(event.buttons & 1)) { release(); return; }
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 3) return;
      dragStart.current = null;
      const api = (window as DesktopWindowHost).pywebview?.api;
      if (api?.begin_move) void api.begin_move().finally(release).catch(() => {});
      else release();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('mouseup', release);
      window.removeEventListener('blur', release);
      window.removeEventListener('mousemove', move);
    };
  }, [dragging]);

  if (!isDesktopShell()) return null;

  const invoke = (action: WindowAction) => {
    const api = (window as DesktopWindowHost).pywebview?.api;
    if (!api || !ready) return;
    try {
      void Promise.resolve(api[action]()).catch(() => {});
    } catch {
      // The host may be closing while the WebView is still dispatching the click.
    }
  };

  return <><div data-desktop-titlebar data-dragging={dragging}
    className="desktop-window-chrome"
    onWheel={(event) => event.stopPropagation()}
    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
    onDoubleClick={(event) => event.stopPropagation()}>
    <div className="desktop-titlebar-surface">
      <div className="desktop-drag-region"
        title="拖动窗口 · 双击最大化或还原"
        onMouseDown={(event) => {
          if (event.button !== 0) { event.stopPropagation(); return; }
          event.preventDefault();
          event.stopPropagation();
          if (!ready) return;
          dragStart.current = { x: event.clientX, y: event.clientY };
          setDragging(true);
        }}
        onDoubleClick={(event) => { event.stopPropagation(); invoke('toggle_maximize'); }}>
        <span className="pointer-events-none">DropIt</span>
      </div>
    </div>
    <div className="desktop-window-buttons fixed right-2 top-1 flex items-center gap-1"
      onMouseDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}>
      <button type="button" aria-label="最小化窗口" title="最小化"
        className="flex h-7 w-9 items-center justify-center border border-ink/35 bg-transparent text-ink transition-colors hover:border-ink focus:outline-none focus-visible:border-ink"
        onClick={() => invoke('minimize')}>
        <span className="mt-2 block h-px w-3 bg-current" aria-hidden="true" />
      </button>
      <button type="button" aria-label="最大化或还原窗口" title="最大化 / 还原"
        className="flex h-7 w-9 items-center justify-center border border-ink/35 bg-transparent text-ink transition-colors hover:border-ink focus:outline-none focus-visible:border-ink"
        onClick={() => invoke('toggle_maximize')}>
        <span className={`block h-3 w-3 border border-current ${maximized ? 'desktop-restore-icon' : ''}`} aria-hidden="true" />
      </button>
      <button type="button" aria-label="关闭窗口" title="关闭"
        className="flex h-7 w-9 items-center justify-center border border-ink/35 bg-transparent text-ink transition-colors hover:border-ink focus:outline-none focus-visible:border-ink"
        onClick={() => invoke('close')}>
        <span className="relative block h-3 w-3" aria-hidden="true">
          <span className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current" />
          <span className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-current" />
        </span>
      </button>
    </div>
  </div>
    {!maximized && <div data-desktop-titlebar className="desktop-resize-frame" aria-hidden="true"
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      {['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].map((edge) => <div key={edge}
        data-window-resize={edge} className={`desktop-resize-edge desktop-resize-${edge}`}
        onMouseDown={(event) => {
          event.stopPropagation();
          if (event.button !== 0 || !ready) return;
          event.preventDefault();
          const api = (window as DesktopWindowHost).pywebview?.api;
          if (api?.begin_resize) void api.begin_resize(edge).catch(() => {});
        }} />)}
    </div>}
  </>;
};
