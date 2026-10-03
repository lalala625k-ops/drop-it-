import React, { useState } from 'react';
import { Card, Viewport } from '../types';
import { ReverseResolution } from '../utils/recognizeCardImage';
import { manualSearchFallback } from '../utils/manualSearch';

const stageLabels: Record<string, string> = {
  explicit: '明确链接或编号', vision: 'AI 提取', site_search: '站内搜索',
  domain_search: '域名定向搜索', verification: '候选核验',
};
const statusLabels: Record<string, string> = {
  matched: '已命中', completed: '已完成', candidates: '待确认', no_results: '未命中',
  failed: '失败', blocked: '被网站拦截', timeout: '超时', not_configured: '未配置',
  unauthorized: '无权限', rate_limited: '被限流', invalid_response: '结果无效',
  unsupported: '暂不支持', unavailable: '站内搜索不可用', missing_title: '缺少标题',
  skipped: '已跳过',
};

interface Props {
  card: Card;
  viewport: Viewport;
  resolution: ReverseResolution;
  onClose: () => void;
  onConfirm: (url: string) => void;
}

export const ReverseResolutionPanel: React.FC<Props> = ({
  card, viewport, resolution, onClose, onConfirm,
}) => {
  const [manualUrl, setManualUrl] = useState('');
  const manualSearch = resolution.clues?.title && resolution.manual_search?.query !== resolution.clues.title
    ? manualSearchFallback(resolution.clues, '')
    : resolution.manual_search || manualSearchFallback(resolution.clues, '');
  const width = 360;
  const cardLeft = viewport.x + card.x * viewport.zoom;
  const cardRight = cardLeft + card.width * viewport.zoom;
  const preferredLeft = cardRight + 12;
  const left = preferredLeft + width <= window.innerWidth - 12
    ? Math.max(12, preferredLeft) : Math.max(12, cardLeft - width - 12);
  const top = Math.min(Math.max(12, viewport.y + card.y * viewport.zoom),
    Math.max(12, window.innerHeight - 390));

  return (
    <aside role="region" aria-label="图片溯源结果"
      className="fixed z-[110] w-[360px] max-h-[min(70vh,540px)] overflow-y-auto border border-ink bg-paper p-4 text-ink shadow-2xl"
      style={{ left, top }}
      onMouseDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-bold">图片溯源结果</h2>
        <button type="button" className="text-xs underline" onClick={onClose} aria-label="关闭溯源结果">关闭</button>
      </div>
      <p className="mt-2 text-xs leading-5">{resolution.reason}</p>
      {resolution.clues?.title && (
        <div className="mt-3 border-t border-ash/50 pt-2 text-xs leading-5">
          <div>平台：{resolution.clues.platform || resolution.clues.site_domain || '未确定'}</div>
          <div>标题：{resolution.clues.title}</div>
          {resolution.clues.author && <div>作者：{resolution.clues.author}</div>}
        </div>
      )}
      {!!resolution.stages.length && (
        <ol className="mt-3 space-y-1 border-t border-ash/50 pt-2 text-xs">
          {resolution.stages.map((stage, index) => (
            <li key={`${stage.name}-${index}`} className="flex justify-between gap-3">
              <span>{stageLabels[stage.name] || stage.name}</span>
              <span className="text-ash">{statusLabels[stage.status] || stage.status}</span>
            </li>
          ))}
        </ol>
      )}
      {!!resolution.candidates.length && (
        <div className="mt-3 border-t border-ash/50 pt-2">
          <h3 className="text-xs font-bold">相似内容，请确认</h3>
          <div className="mt-2 space-y-2">
            {resolution.candidates.map((candidate) => (
              <div key={candidate.url} className="border border-ash/60 p-2 text-xs leading-5">
                <div className="font-semibold break-words">{candidate.title}</div>
                <div className="text-ash">{candidate.author || '作者未知'} · {candidate.source === 'site' ? '站内' : '域名搜索'} · 标题相似度 {Math.round(candidate.score * 100)}%</div>
                <div className="mt-1 flex gap-3">
                  <button type="button" className="font-bold underline" onClick={() => onConfirm(candidate.url)}>确认并转换</button>
                  <a href={candidate.url} target="_blank" rel="noopener noreferrer" className="underline">先查看网页</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 border-t border-ash/50 pt-3 text-xs leading-5">
          <h3 className="font-bold">手动搜索原内容</h3>
          <p className="mt-1 break-words">{manualSearch.query
            ? `已填关键词（仅标题）：${manualSearch.query}`
            : '没有提取到可预填的标题，请在搜索页自行输入。'}</p>
          {resolution.clues?.author && <p className="text-ash">作者仅用于核对：{resolution.clues.author}</p>}
          <a href={manualSearch.url} target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-block border border-ink px-2 py-1 font-bold">
            {manualSearch.kind === 'site'
              ? `打开${manualSearch.platform}站内搜索`
              : manualSearch.kind === 'domain'
                ? `打开${manualSearch.platform}定向搜索`
                : '打开网页搜索'}
          </a>
          <p className="mt-2 text-ash">搜索页用于人工查找，图片卡片不会因此自动转换。</p>
      </div>
      {resolution.search_page && (
        <div className="mt-3 border-t border-ash/50 pt-3 text-xs">
          <h3 className="font-bold">小红书站内搜索</h3>
          <p className="mt-1 leading-5">若没有列出笔记，请在搜索页选择原帖，并复制它的具体链接。</p>
          <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); onConfirm(manualUrl.trim()); }}>
            <input value={manualUrl} onChange={(event) => setManualUrl(event.target.value)}
              aria-label="小红书笔记链接" placeholder="粘贴选中的笔记链接"
              className="min-w-0 flex-1 border border-ash bg-paper px-2 py-1" />
            <button type="submit" disabled={!manualUrl.trim()} className="border border-ink px-2 py-1 font-bold disabled:opacity-40">确认</button>
          </form>
        </div>
      )}
    </aside>
  );
};
