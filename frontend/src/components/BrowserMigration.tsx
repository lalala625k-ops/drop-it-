import { useState } from 'react';
import { getLocalData } from '../utils/storage';
import { readAllPendingImages } from '../utils/pendingImages';

export function BrowserMigration() {
  const [message, setMessage] = useState('请在原来使用便签的浏览器配置中完成迁移。');
  const [busy, setBusy] = useState(false);
  const token = new URLSearchParams(location.search).get('migrate') || '';

  async function transfer() {
    if (!token) { setMessage('缺少迁移令牌，请从桌面应用重新打开。'); return; }
    setBusy(true);
    try {
      const local = getLocalData();
      const images = await readAllPendingImages();
      for (const card of local?.cards || []) {
        if (card.image?.startsWith('data:image/')) images[card.id] = card.image;
      }
      const current = await fetch('http://127.0.0.1:8000/api/cards').then((res) => res.json());
      const viewport = JSON.parse(localStorage.getItem('pinboard_viewport_v1') || 'null');
      const response = await fetch('http://127.0.0.1:8000/api/migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, baseRevision: current.revision,
          cards: local?.cards || [], groups: local?.groups || [],
          pendingSync: !!local?.pendingSync, images, viewport,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      setMessage(`迁移完成：${result.cards} 张卡片、${result.groups} 个 Group。请返回桌面应用。`);
    } catch (error) {
      setMessage(`迁移未完成：${error instanceof Error ? error.message : String(error)}。原数据仍在，可重试。`);
    } finally { setBusy(false); }
  }

  return <main style={{ margin: '10vh auto', maxWidth: 560, fontFamily: 'sans-serif', lineHeight: 1.7 }}>
    <h1>迁移到随想便签桌面版</h1>
    <p>{message}</p>
    <p>这会带走浏览器中未同步的便签、图片和视口；原浏览器数据会保留。</p>
    <button disabled={busy} onClick={transfer} style={{ padding: '10px 20px', cursor: 'pointer' }}>
      {busy ? '正在迁移…' : '迁移到桌面版'}
    </button>
  </main>;
}
