import { useEffect, useRef } from 'react';
import type { WorkspaceState, FileSettings } from '../utils/workspaceApi';
import { browserBoardId, getFileSettings, getWorkspaceId, setDraftFlushHandler, workspaceRequest, workspaceUrl } from '../utils/workspaceApi';
import { flushWorkspaceSync, currentServerRevision } from '../utils/storage';
import { writeWorkspaceCache } from '../utils/workspaceCache';

export function useWorkspaceDraft(ready: boolean, state: WorkspaceState, showToast: (message: string) => void) {
  const latest = useRef(state);
  latest.current = state;
  const options = useRef<FileSettings | null>(null);
  const generation = useRef(0);
  const savedGeneration = useRef(-1);
  const firstChange = useRef(0);
  const timer = useRef<number | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const lastError = useRef('');
  const remember = (pending: boolean, revision = generation.current) => writeWorkspaceCache({ ...latest.current,
    workspace_id: getWorkspaceId(), client_revision: revision, database_revision: currentServerRevision(), pending_draft: pending });

  const save = async (force = false): Promise<void> => {
    if (running.current) { await running.current; return save(force); }
    if (!ready || generation.current === savedGeneration.current || (!force && !options.current?.autosave_enabled)) return;
    const captured = latest.current, id = getWorkspaceId(), revision = generation.current;
    if (!id) throw new Error('工作区标识尚未载入');
    remember(true);
    const operation = (async () => {
      await flushWorkspaceSync(captured.cards, captured.groups);
      const result = await workspaceRequest<{ success: boolean; disabled?: boolean }>('/api/workspace/draft', {
        ...captured, cards: captured.cards.map(({ isParsing: _parsing, ...card }) => card),
        workspace_id: id, client_revision: revision, base_revision: browserBoardId ? null : currentServerRevision(), force,
      });
      if (!result.success) { if (result.disabled) return; throw new Error('暂存未完成'); }
      savedGeneration.current = revision;
      if (generation.current === revision) { firstChange.current = 0; remember(false, revision); }
      lastError.current = '';
    })();
    running.current = operation;
    try { await operation; }
    catch (error) {
      const message = `暂存失败：${error instanceof Error ? error.message : '无法写入文件'}`;
      if (message !== lastError.current) showToast(message);
      lastError.current = message;
      throw error;
    } finally { running.current = null; }
    if (force && generation.current !== savedGeneration.current) await save(true);
  };
  const saveRef = useRef(save); saveRef.current = save;

  useEffect(() => {
    if (!ready) return;
    const applyOptions = (event: Event) => { options.current = (event as CustomEvent<FileSettings>).detail; };
    void getFileSettings().then((value) => { options.current = value; }).catch((error) => showToast(`暂存设置读取失败：${error.message}`));
    window.addEventListener('pinboard-file-settings', applyOptions);
    const flush = () => saveRef.current(true);
    setDraftFlushHandler(flush);
    const host = window as Window & { pinboardFlushDraft?: () => Promise<boolean> };
    host.pinboardFlushDraft = async () => { try { await flush(); return true; } catch { return false; } };
    const checkpoint = window.setInterval(() => {
      if (firstChange.current && Date.now() - firstChange.current >= (options.current?.max_seconds || 30) * 1000) {
        void saveRef.current().catch(() => {});
      }
    }, 1000);
    const unload = () => {
      if (generation.current === savedGeneration.current) return;
      remember(true);
      // Best effort for browser unload; native close waits for the real disk write.
      const payload = { ...latest.current, workspace_id: getWorkspaceId(), client_revision: generation.current,
        base_revision: browserBoardId ? null : currentServerRevision(), force: true };
      navigator.sendBeacon?.(workspaceUrl('/api/workspace/draft'), new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    };
    const cacheError = () => showToast('本地暂存缓存写入失败，请保持窗口打开并检查磁盘暂存状态。');
    const closeError = () => showToast('关闭前暂存未完成，窗口已保留。请检查目录或连接后再次关闭。');
    window.addEventListener('pagehide', unload);
    window.addEventListener('pinboard-draft-cache-failed', cacheError);
    window.addEventListener('pinboard-close-failed', closeError);
    return () => {
      setDraftFlushHandler(null); delete host.pinboardFlushDraft;
      window.clearInterval(checkpoint);
      if (timer.current !== null) window.clearTimeout(timer.current);
      window.removeEventListener('pagehide', unload);
      window.removeEventListener('pinboard-file-settings', applyOptions);
      window.removeEventListener('pinboard-draft-cache-failed', cacheError);
      window.removeEventListener('pinboard-close-failed', closeError);
    };
  }, [ready, showToast]);

  useEffect(() => {
    if (!ready) return;
    generation.current = Math.max(Date.now(), generation.current + 1);
    if (!firstChange.current) firstChange.current = Date.now();
    remember(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void saveRef.current().catch(() => {}); }, (options.current?.idle_seconds || 5) * 1000);
  }, [ready, state.cards, state.groups, state.viewport, state.pins]);
}
