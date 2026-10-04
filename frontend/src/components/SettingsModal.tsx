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
  onOpenTour?: () => void;
}

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
  onOpenTour,
}) => {
  // Navigation: Pan & Zoom for the visual micro-canvas
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.85);
  const isPanningRef = useRef(false);
  const startPanRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Shortcut key recording
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

  // Hover state for highlighting branch lines
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

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
        setPathInfo((prev) => (prev ? { ...prev, current_path: data.data_dir, is_default: false } : null));
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

  // Canvas Mouse Pan & Zoom Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, button, select, a, [data-interactive="true"]')) {
      return;
    }
    isPanningRef.current = true;
    startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanningRef.current) return;
    setPan({
      x: e.clientX - startPanRef.current.x,
      y: e.clientY - startPanRef.current.y,
    });
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom((z) => Math.max(0.45, Math.min(1.4, z * factor)));
  };

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(0.85);
  };

  if (!isOpen) return null;

  // Shortcuts list definition
  const shortcutItems: { key: keyof ShortcutSettings; label: string; desc: string }[] = [
    { key: 'newCard', label: '新建便签', desc: '在光标世界坐标创建便签' },
    { key: 'search', label: '全局搜索', desc: '全文搜索正文与标签' },
    { key: 'autoPack', label: '自动排版', desc: '紧凑分行装箱排版' },
    { key: 'bundle', label: '编组 Group', desc: '将多张便签打包' },
    { key: 'newParent', label: '创建圆形父级', desc: '创建关联父物体' },
    { key: 'resetSize', label: '恢复默认尺寸', desc: '复位卡片与组大小' },
  ];

  // Graph Coordinates
  // Root: (0, 0)
  // Branch 1 (Shortcuts): (-360, -120)
  // Branch 2 (Storage): (360, -120)
  // Branch 3 (Preferences): (0, 240)

  const rootNode = { x: 0, y: 0, r: 60 };
  const bShortcuts = { x: -360, y: -120, r: 50 };
  const bStorage = { x: 360, y: -120, r: 50 };
  const bGeneral = { x: 0, y: 240, r: 50 };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/40 select-none animate-fadeIn p-4 md:p-8"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="relative w-full h-full max-w-[1440px] max-h-[92vh] bg-parchment border-2 border-ink shadow-[8px_8px_0px_#1d1d1d] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Top-Left Header Bar */}
        <div className="absolute top-4 left-6 z-30 pointer-events-none flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-black text-ink tracking-tight font-retina">
              ⚙ 设置中心 · 知识树微画布
            </span>
            <span className="text-[11px] font-mono font-bold bg-ink text-paper px-2 py-0.5">
              VISUAL GRAPH
            </span>
          </div>
          <span className="text-[12px] text-ink/65 font-mono">
            按住空白处拖动画布 · 滚轮缩放 · 点击卡片直接配置
          </span>
        </div>

        {/* Top-Right Control Buttons */}
        <div className="absolute top-4 right-6 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={resetView}
            title="居中重置视口"
            className="px-3 py-1.5 text-[12px] font-bold border border-ink bg-paper text-ink hover:bg-stone/30 transition-colors cursor-pointer rounded-[10px] shadow-sm"
          >
            ⟲ 居中全览
          </button>
          <button
            type="button"
            onClick={onClose}
            title="关闭设置 (Esc)"
            className="px-3.5 py-1.5 text-[12px] font-bold bg-ink text-paper hover:bg-ink/80 transition-colors cursor-pointer rounded-[10px] shadow-sm flex items-center gap-1"
          >
            <span>✕</span>
            <span>关闭</span>
          </button>
        </div>

        {/* Zoom Indicator Bottom-Left */}
        <div className="absolute bottom-4 left-6 z-30 pointer-events-none text-[12px] font-mono font-bold text-ink/50">
          缩放: {Math.round(zoom * 100)}%
        </div>

        {/* Hidden File Input for .note Restore */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".note"
          className="hidden"
          onChange={handleImportFileChange}
        />

        {/* Micro Canvas World Space Layer */}
        <div
          className="absolute inset-0 cursor-grab active:cursor-grabbing origin-top-left"
          style={{
            transform: `translate(${pan.x + (containerRef.current?.clientWidth || 1000) / 2}px, ${
              pan.y + (containerRef.current?.clientHeight || 700) / 2
            }px) scale(${zoom})`,
          }}
        >
          {/* SVG Link Lines */}
          <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ zIndex: 1 }}>
            {/* Root to Branch 1 */}
            <line
              x1={rootNode.x}
              y1={rootNode.y}
              x2={bShortcuts.x}
              y2={bShortcuts.y}
              stroke="#a8a7a2"
              strokeWidth="2"
            />
            <circle cx={rootNode.x} cy={rootNode.y} r="3" fill="#a8a7a2" />
            <circle cx={bShortcuts.x} cy={bShortcuts.y} r="3" fill="#a8a7a2" />

            {/* Root to Branch 2 */}
            <line
              x1={rootNode.x}
              y1={rootNode.y}
              x2={bStorage.x}
              y2={bStorage.y}
              stroke="#a8a7a2"
              strokeWidth="2"
            />
            <circle cx={bStorage.x} cy={bStorage.y} r="3" fill="#a8a7a2" />

            {/* Root to Branch 3 */}
            <line
              x1={rootNode.x}
              y1={rootNode.y}
              x2={bGeneral.x}
              y2={bGeneral.y}
              stroke="#a8a7a2"
              strokeWidth="2"
            />
            <circle cx={bGeneral.x} cy={bGeneral.y} r="3" fill="#a8a7a2" />

            {/* Branch 1 to Shortcut Cards */}
            {shortcutItems.map((_, idx) => {
              const cardY = -310 + idx * 75;
              const cardX = -460;
              return (
                <g key={`link-sc-${idx}`}>
                  <line
                    x1={bShortcuts.x}
                    y1={bShortcuts.y}
                    x2={cardX}
                    y2={cardY + 30}
                    stroke="#a8a7a2"
                    strokeWidth="1.5"
                  />
                  <circle cx={cardX} cy={cardY + 30} r="2.5" fill="#a8a7a2" />
                </g>
              );
            })}

            {/* Branch 2 to Storage Cards */}
            <line x1={bStorage.x} y1={bStorage.y} x2={490} y2={-210} stroke="#a8a7a2" strokeWidth="1.5" />
            <circle cx={490} cy={-210} r="2.5" fill="#a8a7a2" />

            <line x1={bStorage.x} y1={bStorage.y} x2={490} y2={-50} stroke="#a8a7a2" strokeWidth="1.5" />
            <circle cx={490} cy={-50} r="2.5" fill="#a8a7a2" />

            <line x1={bStorage.x} y1={bStorage.y} x2={490} y2={70} stroke="#a8a7a2" strokeWidth="1.5" />
            <circle cx={490} cy={70} r="2.5" fill="#a8a7a2" />

            {/* Branch 3 to General Cards */}
            <line x1={bGeneral.x} y1={bGeneral.y} x2={-414} y2={340} stroke="#a8a7a2" strokeWidth="1.5" />
            <circle cx={-414} cy={340} r="2.5" fill="#a8a7a2" />

            <line x1={bGeneral.x} y1={bGeneral.y} x2={-138} y2={340} stroke="#a8a7a2" strokeWidth="1.5" />
            <circle cx={-138} cy={340} r="2.5" fill="#a8a7a2" />

            <line x1={bGeneral.x} y1={bGeneral.y} x2={138} y2={340} stroke="#a8a7a2" strokeWidth="1.5" />
            <circle cx={138} cy={340} r="2.5" fill="#a8a7a2" />

            <line x1={bGeneral.x} y1={bGeneral.y} x2={414} y2={340} stroke="#a8a7a2" strokeWidth="1.5" />
            <circle cx={414} cy={340} r="2.5" fill="#a8a7a2" />
          </svg>

          {/* ==================== 1. ROOT PARENT CIRCLE ==================== */}
          <div
            className="absolute rounded-full border-[3px] border-ink bg-[#FACB0E] text-ink flex flex-col items-center justify-center shadow-md select-none -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: rootNode.x, top: rootNode.y, width: 120, height: 120 }}
          >
            <span className="text-[18px] leading-tight font-black font-retina tracking-tight">
              ⚙ 设置
            </span>
            <span className="text-[11px] font-mono font-bold opacity-80 mt-0.5">
              体系中心
            </span>
          </div>

          {/* ==================== 2. BRANCH 1: SHORTCUTS ==================== */}
          <div
            className="absolute rounded-full border-2 border-ink bg-[#97c5e8] text-ink flex flex-col items-center justify-center shadow-md select-none -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: bShortcuts.x, top: bShortcuts.y, width: 100, height: 100 }}
          >
            <span className="text-[15px] font-black font-retina">⌨ 快捷键</span>
            <span className="text-[10px] font-mono opacity-75">键盘映射</span>
          </div>

          {/* Branch 1 Setting Cards (Left Wing) */}
          <div className="absolute z-20" style={{ left: -720, top: -330 }}>
            <div className="flex flex-col gap-2.5">
              {shortcutItems.map(({ key, label, desc }) => {
                const currentVal = settings.shortcuts[key] || DEFAULT_SHORTCUTS[key];
                const isRecording = recordingKey === key;
                return (
                  <div
                    key={key}
                    data-interactive="true"
                    className="w-[260px] bg-paper text-ink border border-ink hover:border-2 p-2.5 flex items-center justify-between shadow-sm transition-all"
                  >
                    <div className="flex flex-col">
                      <span className="text-[13px] font-bold tracking-tight">{label}</span>
                      <span className="text-[11px] text-ink/60">{desc}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRecordingKey(key)}
                      className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-[6px] border transition-colors cursor-pointer whitespace-nowrap ${
                        isRecording
                          ? 'bg-ink text-paper border-ink animate-pulse'
                          : 'bg-stone/20 text-ink border-ink/30 hover:border-ink hover:bg-stone/40'
                      }`}
                    >
                      {isRecording ? '录制中...' : currentVal}
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                data-interactive="true"
                onClick={onResetShortcuts}
                className="w-[260px] py-2 text-[12px] font-bold border border-ink/40 bg-paper hover:bg-stone/20 text-ink/75 hover:text-ink transition-colors cursor-pointer text-center"
              >
                ⟲ 恢复全部默认快捷键
              </button>
            </div>
          </div>

          {/* ==================== 3. BRANCH 2: STORAGE & ARCHIVE ==================== */}
          <div
            className="absolute rounded-full border-2 border-ink bg-[#a8e6cf] text-ink flex flex-col items-center justify-center shadow-md select-none -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: bStorage.x, top: bStorage.y, width: 100, height: 100 }}
          >
            <span className="text-[15px] font-black font-retina">💾 存储</span>
            <span className="text-[10px] font-mono opacity-75">归档打包</span>
          </div>

          {/* Branch 2 Setting Cards (Right Wing) */}
          <div className="absolute z-20" style={{ left: 490, top: -330 }}>
            <div className="flex flex-col gap-3">
              {/* Card 1: Storage Path */}
              <div
                data-interactive="true"
                className="w-[360px] bg-paper text-ink border border-ink hover:border-2 p-3.5 flex flex-col gap-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-black">本地数据存储目录</span>
                  {pathInfo?.is_default && (
                    <span className="text-[10px] font-mono bg-stone/25 px-1.5 py-0.5 border border-ink/20">
                      默认位置
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink/65 break-all font-mono bg-stone/15 p-1.5 border border-ink/15">
                  {pathInfo?.current_path || '加载中...'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={newPathInput}
                    onChange={(e) => setNewPathInput(e.target.value)}
                    placeholder="输入新目录绝对路径..."
                    className="flex-1 px-2 py-1 text-[11px] font-mono border border-ink/40 bg-paper focus:border-ink outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveStoragePath}
                    disabled={isUpdatingPath}
                    className="px-3 py-1 text-[11px] font-bold bg-ink text-paper rounded-[8px] hover:bg-ink/80 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    {isUpdatingPath ? '迁移中...' : '迁移并切换'}
                  </button>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-ink/75 cursor-pointer mt-0.5">
                  <input
                    type="checkbox"
                    checked={migrateData}
                    onChange={(e) => setMigrateData(e.target.checked)}
                    className="accent-ink"
                  />
                  <span>将现有数据库与原图一同迁移到新路径</span>
                </label>
              </div>

              {/* Card 2: Export .note */}
              <div
                data-interactive="true"
                className="w-[360px] bg-paper text-ink border border-ink hover:border-2 p-3 flex items-center justify-between shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="text-[13px] font-black">导出完整便签包 (.note)</span>
                  <span className="text-[11px] text-ink/60">卡片、视口、图钉与原图打包归档</span>
                </div>
                <button
                  type="button"
                  onClick={handleExportArchive}
                  disabled={isExporting}
                  className="px-3.5 py-1.5 text-[12px] font-bold bg-ink text-paper rounded-[10px] hover:bg-ink/80 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap flex items-center gap-1"
                >
                  <span>📦</span>
                  <span>{isExporting ? '打包中...' : '导出'}</span>
                </button>
              </div>

              {/* Card 3: Import .note */}
              <div
                data-interactive="true"
                className="w-[360px] bg-paper text-ink border border-ink hover:border-2 p-3 flex items-center justify-between shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="text-[13px] font-black">导入完整便签包 (.note)</span>
                  <span className="text-[11px] text-ink/60">一键解压并无缝覆盖还原画布</span>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className="px-3.5 py-1.5 text-[12px] font-bold border border-ink bg-paper text-ink hover:bg-stone/30 rounded-[10px] transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap flex items-center gap-1"
                >
                  <span>📥</span>
                  <span>{isImporting ? '解压中...' : '导入包'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ==================== 4. BRANCH 3: PREFERENCES ==================== */}
          <div
            className="absolute rounded-full border-2 border-ink bg-[#d5c6e8] text-ink flex flex-col items-center justify-center shadow-md select-none -translate-x-1/2 -translate-y-1/2 z-10"
            style={{ left: bGeneral.x, top: bGeneral.y, width: 100, height: 100 }}
          >
            <span className="text-[15px] font-black font-retina">🎛 偏好</span>
            <span className="text-[10px] font-mono opacity-75">交互习惯</span>
          </div>

          {/* Branch 3 Setting Cards (Bottom Wing) */}
          <div className="absolute z-20 -translate-x-1/2" style={{ left: 0, top: 340 }}>
            <div className="flex items-center gap-4">
              {/* Card 1: Wheel Direction */}
              <div
                data-interactive="true"
                className="w-[260px] bg-paper text-ink border border-ink hover:border-2 p-3 flex flex-col justify-between h-[95px] shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="text-[13px] font-black">滚轮缩放方向</span>
                  <span className="text-[11px] text-ink/60">
                    当前：{settings.general.invertWheelZoom ? '向上缩小' : '向上放大 (默认)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateGeneral({ invertWheelZoom: !settings.general.invertWheelZoom })
                  }
                  className="w-full py-1 text-[11px] font-bold border border-ink bg-stone/20 hover:bg-stone/40 rounded-[8px] transition-colors cursor-pointer"
                >
                  {settings.general.invertWheelZoom ? '切换为：向上放大' : '切换为：向上缩小 (反转)'}
                </button>
              </div>

              {/* Card 2: Minimap Mode */}
              <div
                data-interactive="true"
                className="w-[260px] bg-paper text-ink border border-ink hover:border-2 p-3 flex flex-col justify-between h-[95px] shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="text-[13px] font-black">小地图展示模式</span>
                  <span className="text-[11px] text-ink/60">
                    当前：{settings.general.minimapMode === 'always' ? '常驻左下角 (默认)' : '仅按 M 键呼出'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateGeneral({
                      minimapMode: settings.general.minimapMode === 'always' ? 'press_m' : 'always',
                    })
                  }
                  className="w-full py-1 text-[11px] font-bold border border-ink bg-stone/20 hover:bg-stone/40 rounded-[8px] transition-colors cursor-pointer"
                >
                  {settings.general.minimapMode === 'always'
                    ? '切换为：仅按 M 键呼出'
                    : '切换为：常驻左下角'}
                </button>
              </div>

              {/* Card 3: FPS Meter */}
              <div
                data-interactive="true"
                className="w-[260px] bg-paper text-ink border border-ink hover:border-2 p-3 flex flex-col justify-between h-[95px] shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="text-[13px] font-black">实时帧率显示 (FPS)</span>
                  <span className="text-[11px] text-ink/60">
                    当前：{settings.general.showFps ? '开启 (左上角常驻)' : '关闭 (默认)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateGeneral({
                      showFps: !settings.general.showFps,
                    })
                  }
                  className="w-full py-1 text-[11px] font-bold border border-ink bg-stone/20 hover:bg-stone/40 rounded-[8px] transition-colors cursor-pointer"
                >
                  {settings.general.showFps ? '切换为：关闭' : '切换为：开启'}
                </button>
              </div>

              {/* Card 4: Tutorial Guide */}
              <div
                data-interactive="true"
                className="w-[260px] bg-paper text-ink border border-ink hover:border-2 p-3 flex flex-col justify-between h-[95px] shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="text-[13px] font-black">动态教学手册</span>
                  <span className="text-[11px] text-ink/60">核心能力图解手册与实操演练</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTour?.();
                  }}
                  className="w-full py-1 text-[11px] font-bold bg-ink text-paper rounded-[8px] hover:bg-ink/80 transition-colors cursor-pointer"
                >
                  打开教程手册 ➔
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
