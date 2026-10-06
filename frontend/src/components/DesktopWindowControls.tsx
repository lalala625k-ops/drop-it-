import React, { useEffect, useState } from 'react';

type WindowAction = 'minimize' | 'toggle_maximize' | 'close';

interface DesktopWindowApi {
  minimize: () => Promise<void> | void;
  toggle_maximize: () => Promise<void> | void;
  close: () => Promise<void> | void;
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

  useEffect(() => {
    if (!isDesktopShell()) return;
    const markReady = () => setReady(true);
    window.addEventListener('pywebviewready', markReady);
    if ((window as DesktopWindowHost).pywebview?.api) markReady();
    return () => window.removeEventListener('pywebviewready', markReady);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const release = () => setDragging(false);
    window.addEventListener('mouseup', release);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('mouseup', release);
      window.removeEventListener('blur', release);
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

  return <div data-desktop-titlebar data-dragging={dragging}
    className="desktop-window-chrome"
    onWheel={(event) => event.stopPropagation()}
    onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
    onDoubleClick={(event) => event.stopPropagation()}>
    <div className="desktop-titlebar-surface">
      <div className="desktop-drag-region pywebview-drag-region"
        title="拖动窗口 · 双击最大化或还原"
        onMouseDown={(event) => {
          if (event.button !== 0) { event.stopPropagation(); return; }
          // pywebview listens on document.body: left-button events must reach it.
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
        <span className="block h-3 w-3 border border-current" aria-hidden="true" />
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
  </div>;
};
