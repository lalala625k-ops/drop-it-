import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, ShortcutSettings, DEFAULT_SHORTCUTS } from '../hooks/useSettings';
import { Card, Group, Viewport } from '../types';
import { CanvasPin } from '../hooks/useCanvasPins';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateShortcuts: (updates: Partial<ShortcutSettings>) => void;
  onUpdateGeneral: (updates: Partial<AppSettings['general']>) => void;
  onResetShortcuts: () => void;
  // Current board state for export & import
  cards: Card[];
  groups: Group[];
  viewport: Viewport;
  pins: CanvasPin[];
  onImportComplete: (data: {
    cards: Card[];
    groups: Group[];
    viewport?: Viewport;
    pins?: CanvasPin[];
  }) => void;
  showToast: (msg: string) => void;
}

type TabType = 'shortcuts' | 'storage' | 'general';

interface StoragePathInfo {
  current_path: string;
  default_path: string;
  is_default: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateShortcuts,
  onUpdateGeneral,
  onResetShortcuts,
  cards,
  groups,
  viewport,
  pins,
  onImportComplete,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('shortcuts');
  const [recordingKey, setRecordingKey] = useState<keyof ShortcutSettings | null>(null);

  // Storage path state
  const [pathInfo, setPathInfo] = useState<StoragePathInfo | null>(null);
  const [newPathInput, setNewPathInput] = useState('');
  const [migrateData, setMigrateData] = useState(true);
  const [isUpdatingPath, setIsUpdatingPath] = useState(false);

  // Archive export/import state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch storage path on mount/open
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/settings/storage-path')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: StoragePathInfo | null) => {
        if (data) {
          setPathInfo(data);
          setNewPathInput(data.current_path);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Handle key recording for shortcuts
  useEffect(() => {
    if (!recordingKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Cancel on Escape
      if (e.key === 'Escape') {
        setRecordingKey(null);
        return;
      }

      // Ignore single modifier presses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      let mainKey = e.key.toUpperCase();
      if (e.code === 'Comma' || e.key === ',') mainKey = ',';
      else if (e.code === 'Period' || e.key === '.') mainKey = '.';
      else if (e.code.startsWith('Key')) mainKey = e.code.replace('Key', '');
      else if (e.code.startsWith('Digit')) mainKey = e.code.replace('Digit', '');

      parts.push(mainKey);
      const shortcutStr = parts.join('+');

      onUpdateShortcuts({ [recordingKey]: shortcutStr });
      setRecordingKey(null);
      showToast(`快捷键已更新: ${shortcutStr}`);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recordingKey, onUpdateShortcuts, showToast]);

  if (!isOpen) return null;

  // Handle changing storage path
  const handleSaveStoragePath = async () => {
    const trimmed = newPathInput.trim();
    if (!trimmed) {
      showToast('路径不能为空');
      return;
    }
    setIsUpdatingPath(true);
    try {
      const res = await fetch('/api/settings/storage-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_path: trimmed, migrate_data: migrateData }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPathInfo((prev) => prev ? { ...prev, current_path: data.data_dir, is_default: false } : null);
        showToast(`存储路径已切换${data.migrated_files ? ` (已迁移 ${data.migrated_files} 个文件)` : ''}`);
      } else {
        showToast(data.detail || '切换路径失败');
      }
    } catch (err: any) {
      showToast(`网络错误: ${err.message}`);
    } finally {
      setIsUpdatingPath(false);
    }
  };

  // Handle full archive export (.note)
  const handleExportArchive = async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/archive/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewport,
          pins,
          cards,
          groups,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '导出失败');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `随想便签完整包_${dateStr}.note`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('完整便签包已导出 (.note)');
    } catch (err: any) {
      showToast(`导出失败: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle full archive import (.note)
  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('导入便签包将用包内所有卡片、分组与视口覆盖当前画布，确定继续吗？')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/archive/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onImportComplete({
          cards: data.cards || [],
          groups: data.groups || [],
          viewport: data.viewport,
          pins: data.pins || [],
        });
        showToast('便签包已完整还原');
        onClose();
      } else {
        showToast(data.detail || '导入便签包失败');
      }
    } catch (err: any) {
      showToast(`导入错误: ${err.message}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const shortcutLabels: Record<keyof ShortcutSettings, string> = {
    newCard: '新建便签',
    search: '全局搜索',
    autoPack: '自动排版',
    bundle: '编组成 Group',
    newParent: '创建圆形父级',
    resetSize: '恢复默认尺寸',
    openSettings: '打开设置',
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/30 select-none animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-[620px] max-w-[95vw] h-[480px] max-h-[90vh] bg-paper text-ink border-2 border-ink flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-ink bg-paper">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-black tracking-tight font-retina">设置</span>
            <span className="text-[11px] font-mono uppercase tracking-[0.05em] text-ink/50 bg-stone/30 px-2 py-0.5 rounded-[10px]">
              Preferences
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center border border-ink/40 text-ink/70 hover:text-ink hover:border-ink rounded-[10px] text-sm cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body (Sidebar + Content) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-[160px] border-r-2 border-ink flex flex-col p-3 gap-1.5 bg-paper">
            <button
              type="button"
              onClick={() => setActiveTab('shortcuts')}
              className={`w-full text-left px-3 py-2 text-[14px] font-bold transition-colors cursor-pointer rounded-[10px] ${
                activeTab === 'shortcuts'
                  ? 'bg-ink text-paper'
                  : 'text-ink/80 hover:bg-ink/5'
              }`}
            >
              快捷键
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('storage')}
              className={`w-full text-left px-3 py-2 text-[14px] font-bold transition-colors cursor-pointer rounded-[10px] ${
                activeTab === 'storage'
                  ? 'bg-ink text-paper'
                  : 'text-ink/80 hover:bg-ink/5'
              }`}
            >
              存储与打包
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`w-full text-left px-3 py-2 text-[14px] font-bold transition-colors cursor-pointer rounded-[10px] ${
                activeTab === 'general'
                  ? 'bg-ink text-paper'
                  : 'text-ink/80 hover:bg-ink/5'
              }`}
            >
              通用偏好
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Tab 1: Shortcuts */}
            {activeTab === 'shortcuts' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-ink/60">点击按键框后，按下键盘组合键即可录制</span>
                  <button
                    type="button"
                    onClick={onResetShortcuts}
                    className="text-[11px] font-bold border border-ink/40 hover:border-ink px-2.5 py-1 rounded-[10px] transition-colors cursor-pointer"
                  >
                    恢复默认
                  </button>
                </div>

                <div className="flex flex-col gap-2.5">
                  {(Object.keys(settings.shortcuts) as Array<keyof ShortcutSettings>).map((key) => {
                    const isRecording = recordingKey === key;
                    const val = settings.shortcuts[key] || DEFAULT_SHORTCUTS[key];
                    return (
                      <div key={key} className="flex items-center justify-between py-1 border-b border-ink/10">
                        <span className="text-[14px] font-medium text-ink">{shortcutLabels[key] || key}</span>
                        <button
                          type="button"
                          onClick={() => setRecordingKey(isRecording ? null : key)}
                          className={`min-w-[100px] px-3 py-1 text-[13px] font-mono font-bold rounded-[10px] border transition-colors cursor-pointer text-center ${
                            isRecording
                              ? 'bg-ink text-paper border-ink animate-pulse'
                              : 'bg-paper text-ink border-ink/30 hover:border-ink'
                          }`}
                        >
                          {isRecording ? '按下按键…' : val}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab 2: Storage & Archive */}
            {activeTab === 'storage' && (
              <div className="flex flex-col gap-6">
                {/* 1. Storage Location */}
                <div className="flex flex-col gap-2.5">
                  <div className="text-[14px] font-bold text-ink flex items-center justify-between">
                    <span>本地数据保存路径</span>
                    {pathInfo?.is_default && (
                      <span className="text-[11px] font-mono text-ink/50 bg-stone/20 px-2 py-0.5 rounded-[10px]">
                        默认系统路径
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-ink/60">
                    可自定义将便签数据库和图片文件夹保存至指定盘符或同步盘（如 OneDrive/坚果云）。
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPathInput}
                      onChange={(e) => setNewPathInput(e.target.value)}
                      placeholder="输入本地绝对路径，如 D:\NotesData"
                      className="flex-1 px-3 py-1.5 text-[13px] font-mono border border-ink/30 focus:border-ink outline-none rounded-[10px] bg-paper"
                    />
                    <button
                      type="button"
                      disabled={isUpdatingPath || newPathInput.trim() === pathInfo?.current_path}
                      onClick={handleSaveStoragePath}
                      className="px-4 py-1.5 text-[13px] font-bold bg-ink text-paper rounded-[10px] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-ink/80 transition-opacity cursor-pointer whitespace-nowrap"
                    >
                      {isUpdatingPath ? '切换中…' : '切换路径'}
                    </button>
                  </div>
                  <label className="flex items-center gap-2 text-[12px] text-ink/70 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={migrateData}
                      onChange={(e) => setMigrateData(e.target.checked)}
                      className="rounded border-ink/40"
                    />
                    <span>切换时自动复制并迁移现有便签与图片文件</span>
                  </label>
                </div>

                <div className="border-t border-ink/20" />

                {/* 2. Full Archive (.note) */}
                <div className="flex flex-col gap-2.5">
                  <div className="text-[14px] font-bold text-ink">完整便签包 (.note)</div>
                  <div className="text-[12px] text-ink/60">
                    一键打包当前画布的全部卡片、分组关系、当前视口与 1~8 图钉，并内嵌所有本地原图与截图，便于完整迁移。
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={handleExportArchive}
                      className="px-4 py-2 text-[13px] font-bold bg-ink text-paper rounded-[10px] hover:bg-ink/80 transition-opacity cursor-pointer flex items-center gap-1.5"
                    >
                      {isExporting ? '打包中…' : '导出完整包 (.note)'}
                    </button>

                    <button
                      type="button"
                      disabled={isImporting}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 text-[13px] font-bold border border-ink text-ink rounded-[10px] hover:bg-ink hover:text-paper transition-colors cursor-pointer"
                    >
                      {isImporting ? '恢复中…' : '导入完整包 (.note)'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".note,.zip"
                      className="hidden"
                      onChange={handleImportFileChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: General */}
            {activeTab === 'general' && (
              <div className="flex flex-col gap-5">
                {/* 1. Wheel Zoom Direction */}
                <div className="flex items-center justify-between py-2 border-b border-ink/10">
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-ink">滚轮缩放方向</span>
                    <span className="text-[12px] text-ink/60">调节鼠标滚轮在画布上的放大与缩小方向</span>
                  </div>
                  <div className="flex border border-ink rounded-[10px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => onUpdateGeneral({ invertWheelZoom: false })}
                      className={`px-3 py-1 text-[12px] font-bold transition-colors cursor-pointer ${
                        !settings.general.invertWheelZoom ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5'
                      }`}
                    >
                      向上放大
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateGeneral({ invertWheelZoom: true })}
                      className={`px-3 py-1 text-[12px] font-bold transition-colors cursor-pointer ${
                        settings.general.invertWheelZoom ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5'
                      }`}
                    >
                      向下放大
                    </button>
                  </div>
                </div>

                {/* 2. Minimap Mode */}
                <div className="flex items-center justify-between py-2 border-b border-ink/10">
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-ink">小地图显示模式</span>
                    <span className="text-[12px] text-ink/60">选择是否在左下角常驻显示缩略小地图</span>
                  </div>
                  <div className="flex border border-ink rounded-[10px] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => onUpdateGeneral({ minimapMode: 'always' })}
                      className={`px-3 py-1 text-[12px] font-bold transition-colors cursor-pointer ${
                        settings.general.minimapMode === 'always' ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5'
                      }`}
                    >
                      常驻左下角
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateGeneral({ minimapMode: 'press_m' })}
                      className={`px-3 py-1 text-[12px] font-bold transition-colors cursor-pointer ${
                        settings.general.minimapMode === 'press_m' ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5'
                      }`}
                    >
                      仅按 M 呼出
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t-2 border-ink bg-paper flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 text-[13px] font-bold bg-ink text-paper rounded-[10px] hover:bg-ink/80 transition-opacity cursor-pointer"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
