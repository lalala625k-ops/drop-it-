import { useEffect, useState } from 'react';
import type { GeneralSettings } from '../../hooks/useSettings';
import { workspaceRequest } from '../../utils/workspaceApi';
import type { GeneralController } from './useGeneralSettings';

const buttonClass = 'border border-ink px-1 py-1 disabled:opacity-40 hover:bg-stone/30 whitespace-nowrap';
function FolderControl({ kind, path, disabled, onChange, toast }: {
  kind: 'save' | 'temp'; path: string; disabled: boolean; onChange: (path: string) => Promise<void>; toast: (msg: string) => void;
}) {
  const [input, setInput] = useState(path);
  useEffect(() => setInput(path), [path]);
  const action = async (mode: 'choose' | 'open') => {
    try {
      const result = await workspaceRequest<{ success: boolean; path?: string }>('/api/settings/folder', { action: mode, kind });
      if (result.path) { setInput(result.path); await onChange(result.path); }
    } catch (error) { toast(error instanceof Error ? error.message : '目录操作失败'); }
  };
  const label = kind === 'save' ? '文件保存地址' : '文件暂存地址';
  return <div data-interactive="true" className="w-full flex flex-col gap-2">
    <input aria-label={label} title={path} placeholder="目录绝对路径" value={input} disabled={disabled} onChange={(event) => setInput(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter') void onChange(input.trim()); }}
      className="w-full min-w-0 border-b border-ash bg-transparent outline-none select-text" />
    <div className="flex justify-between gap-1">
      <button className={buttonClass} disabled={disabled} onClick={() => void action('choose')}>选择文件夹</button>
      <button className={buttonClass} disabled={disabled} onClick={() => void action('open')}>打开文件夹</button>
      <button className={buttonClass} disabled={disabled || input === path} onClick={() => void onChange(input.trim())}>{disabled ? '切换中' : '切换'}</button>
    </div>
  </div>;
}

export function GeneralControls({ id, controller: control, canvas, onCanvas, toast }: {
  id: string; controller: GeneralController; canvas: GeneralSettings;
  onCanvas: (updates: Partial<GeneralSettings>) => void; toast: (msg: string) => void;
}) {
  const files = control.files;
  if (id === 'save_dir' || id === 'temp_dir') {
    const path = files?.[id];
    return path ? <FolderControl kind={id === 'save_dir' ? 'save' : 'temp'} path={path}
      disabled={control.busy} onChange={(value) => control.change({ [id]: value })} toast={toast} /> : <>读取中</>;
  }
  if (id === 'history') return <button className={buttonClass} onClick={() => control.setHistoryOpen(true)}>查看记录</button>;
  if (id === 'autosave_enabled') return <label className="flex items-center gap-2" data-interactive="true">
    <input type="checkbox" aria-label="自动暂存" checked={files?.autosave_enabled || false} disabled={!files || control.busy}
      onChange={(event) => void control.change({ autosave_enabled: event.target.checked })} />{files?.autosave_enabled ? '开启' : '关闭'}
  </label>;
  if (id === 'idle_seconds' || id === 'retention_count') return <select aria-label={id === 'idle_seconds' ? '暂存频率' : '保留版本'}
    className="w-full bg-transparent outline-none" disabled={!files || control.busy} value={files?.[id] || 5}
    onChange={(event) => void control.change({ [id]: Number(event.target.value) })}>
    {(id === 'idle_seconds' ? [1, 5, 15, 30] : [1, 3, 5, 10, 20]).map((value) => <option key={value} value={value}>
      {id === 'idle_seconds' ? `停止操作后 ${value} 秒` : `${value} 版`}</option>)}
  </select>;
  if (id === 'wheel') return <button className={buttonClass} onClick={() => onCanvas({ invertWheelZoom: !canvas.invertWheelZoom })}>
    {canvas.invertWheelZoom ? '向上缩小' : '向上放大'}</button>;
  return <button className={buttonClass} onClick={() => onCanvas({ minimapMode: canvas.minimapMode === 'always' ? 'press_m' : 'always' })}>
    {canvas.minimapMode === 'always' ? '常驻' : '按 M 显示'}</button>;
}
