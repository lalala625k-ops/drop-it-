import { useEffect, useState } from 'react';
import { getFileSettings, changeFileSettings, flushWorkspaceDraft, FileSettings } from '../../utils/workspaceApi';
import { GeneralCategoryId } from './generalCatalog';
import { DEFAULT_GENERAL, GeneralSettings } from '../../hooks/useSettings';

export function useGeneralSettings(isOpen: boolean, updateCanvas: (updates: Partial<GeneralSettings>) => void, toast: (msg: string) => void) {
  const [files, setFiles] = useState<FileSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    if (!isOpen) { setHistoryOpen(false); return; }
    void getFileSettings().then((result) => {
      setFiles(result);
      if (result.migration_error) toast(result.migration_error);
    }).catch((error) => toast(`文件设置读取失败：${error.message}`));
  }, [isOpen, toast]);
  const change = async (values: Partial<FileSettings>) => {
    setBusy(true);
    try {
      if (values.temp_dir || values.save_dir) {
        try { await flushWorkspaceDraft(); }
        catch (error) {
          if (!values.temp_dir) throw error;
          // A failed old destination must remain repairable; the complete local copy is retained.
          toast('原暂存地址写入失败，正在复制已有记录并切换到新地址。');
        }
      }
      setFiles(await changeFileSettings(values));
      if (values.temp_dir) await flushWorkspaceDraft();
    } catch (error) { toast(error instanceof Error ? error.message : '更新设置失败'); }
    finally { setBusy(false); }
  };
  const reset = async (category: GeneralCategoryId) => {
    if (!files) return;
    if (category === 'files') await change({ save_dir: files.defaults.save_dir, temp_dir: files.defaults.temp_dir });
    if (category === 'recovery') await change({ autosave_enabled: true, idle_seconds: 5, retention_count: 5 });
    if (category === 'canvas') updateCanvas(DEFAULT_GENERAL);
  };
  return { files, busy, change, reset, historyOpen, setHistoryOpen };
}
export type GeneralController = ReturnType<typeof useGeneralSettings>;
