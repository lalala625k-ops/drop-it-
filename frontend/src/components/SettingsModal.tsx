import React, { useState, useEffect, useMemo } from 'react';
import { AppSettings, ShortcutSettings } from '../hooks/useSettings';
import { SettingsTree } from './settings/SettingsTree';
import { createSettingsLayout } from './settings/settingsTreeLayout';
import { ShortcutCategoryId, shortcutCategories } from './settings/shortcutCatalog';
import { useSettingsView } from './settings/useSettingsView';
import { useShortcutRecording } from './settings/useShortcutRecording';
import { GeneralCategoryId, generalCategories } from './settings/generalCatalog';
import { useGeneralSettings } from './settings/useGeneralSettings';
import { RecoveryPanel } from './settings/RecoveryPanel';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateShortcuts: (updates: Partial<ShortcutSettings>) => void;
  onUpdateGeneral: (updates: Partial<AppSettings['general']>) => void;
  onResetShortcuts: () => void;
  showToast: (msg: string) => void;
  onRestoreWorkspace: (workspaceId: string, snapshotId: string) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateShortcuts,
  onUpdateGeneral,
  onResetShortcuts,
  showToast,
  onRestoreWorkspace,
}) => {
  const [activeCategory, setActiveCategory] = useState<ShortcutCategoryId | null>(null);
  const [activeGeneral, setActiveGeneral] = useState<GeneralCategoryId | null>(null);
  const general = useGeneralSettings(isOpen, onUpdateGeneral, showToast);
  const layout = useMemo(() => createSettingsLayout(activeCategory, activeGeneral), [activeCategory, activeGeneral]);
  const view = useSettingsView(isOpen, layout.focusBounds);
  const { recordingKey, setRecordingKey } = useShortcutRecording(isOpen, settings.shortcuts, onUpdateShortcuts, showToast);
  useEffect(() => { if (!isOpen) { setActiveCategory(null); setActiveGeneral(null); } }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !recordingKey) {
        event.preventDefault();
        if (general.historyOpen) general.setHistoryOpen(false); else onClose();
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [isOpen, recordingKey, onClose, general.historyOpen]);

  const resetView = () => {
    setRecordingKey(null);
    setActiveCategory(null);
    setActiveGeneral(null);
    view.resetView();
  };

  const selectCategory = (category: ShortcutCategoryId) => {
    setRecordingKey(null);
    setActiveGeneral(null);
    setActiveCategory(category === activeCategory ? null : category);
  };

  const currentCategory = shortcutCategories.find((category) => category.id === activeCategory);
  const currentGeneral = generalCategories.find((category) => category.id === activeGeneral);

  if (!isOpen) return null;

  return (
    <div
      data-modal="settings"
      className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/40 select-none animate-fadeIn p-4 md:p-8"
      onClick={onClose}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div
        ref={view.containerRef}
        role="dialog" aria-label="设置" aria-modal="true"
        className="relative w-full h-full max-w-[1440px] max-h-[92vh] bg-parchment border-2 border-ink overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={view.handleMouseDown}
        onMouseMove={view.handleMouseMove}
        onMouseUp={view.handleMouseUp}
        onMouseLeave={view.handleMouseUp}
        onWheel={view.handleWheel}
        onDoubleClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <div className="absolute top-4 left-6 z-30 text-[13px] bg-parchment py-1.5">
          {currentCategory ? `快捷键 / ${currentCategory.label}` : currentGeneral ? `通用设置 / ${currentGeneral.label}` : '设置'}
        </div>
        <div className="absolute top-4 right-6 z-30 flex items-center gap-2 text-[13px]">
          <button type="button" onClick={resetView} title="居中全览"
            className="px-3 py-1.5 border border-ink bg-paper hover:bg-stone/30 cursor-pointer">
            全览
          </button>
          <button type="button" onClick={onClose} aria-label="关闭设置"
            className="px-3 py-1.5 border border-ink bg-paper hover:bg-stone/30 cursor-pointer">
            关闭
          </button>
        </div>
        <div className="absolute bottom-4 left-6 z-30 pointer-events-none text-[13px] font-mono text-ink/50">
          {Math.round(view.zoom * 100)}%
        </div>
        <div data-settings-surface className={`absolute inset-0 origin-top-left ${view.isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ transform: view.transform }}>
          <SettingsTree
            layout={layout}
            activeCategory={activeCategory}
            onCategory={selectCategory}
            settings={settings}
            recordingKey={recordingKey}
            onRecord={setRecordingKey}
            onResetShortcuts={() => { setRecordingKey(null); onResetShortcuts(); }}
            onUpdateGeneral={onUpdateGeneral}
            activeGeneral={activeGeneral}
            onGeneralCategory={(category) => { setActiveCategory(null); setRecordingKey(null); setActiveGeneral(category === activeGeneral ? null : category); }}
            generalController={general}
            showToast={showToast}
          />
        </div>
        {general.historyOpen && <RecoveryPanel onClose={() => general.setHistoryOpen(false)} onRestore={onRestoreWorkspace} toast={showToast} />}
      </div>
    </div>
  );
};
