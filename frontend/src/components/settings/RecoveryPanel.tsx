import { useEffect, useState } from 'react';
import { RecoveryRecord, workspaceRequest } from '../../utils/workspaceApi';

export function RecoveryPanel({ onClose, onRestore, toast }: {
  onClose: () => void; onRestore: (workspaceId: string, snapshotId: string) => Promise<void>; toast: (msg: string) => void;
}) {
  const [records, setRecords] = useState<RecoveryRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void workspaceRequest<{ records: RecoveryRecord[] }>('/api/workspace/recoveries')
      .then((data) => setRecords(data.records)).catch((failure) => setError(failure.message));
  }, []);
  const restore = async (record: RecoveryRecord) => {
    setBusy(true);
    try { await onRestore(record.workspace_id, record.snapshot_id); onClose(); }
    catch (failure) { toast(failure instanceof Error ? failure.message : '恢复失败'); }
    finally { setBusy(false); }
  };
  return <div className="absolute inset-0 z-40 bg-ink/30 flex items-center justify-center p-6" onClick={onClose}>
    <div role="dialog" aria-label="恢复记录" aria-modal="true" data-interactive="true" className="w-full max-w-[720px] max-h-[80%] bg-paper border-2 border-ink flex flex-col text-[13px]"
      onClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex justify-between items-center border-b border-ash p-4"><span>恢复记录</span>
        <button disabled={busy} onClick={onClose} className="border border-ink px-3 py-1">关闭</button></div>
      <div className="overflow-auto p-4">
        {error || (!records ? '读取中' : records.length === 0 ? '暂无恢复记录' : '')}
        {records?.map((record) => <div key={`${record.workspace_id}-${record.snapshot_id}`} className="flex gap-4 items-center justify-between border-b border-ash py-3">
          <div className="min-w-0"><div className="truncate" title={record.source_path}>{record.name}</div>
            <div className="text-ink/60">{new Date(record.saved_at).toLocaleString()} · {record.card_count} 张便签</div></div>
          <button disabled={busy} className="shrink-0 border border-ink px-3 py-1 disabled:opacity-40" onClick={() => void restore(record)}>恢复</button>
        </div>)}
      </div>
    </div>
  </div>;
}
