import { webUrl } from './core.js';
import { writeImageWithSource } from './clipboard.js';

const $ = id => document.getElementById(id);
const send = (type, fields = {}) => chrome.runtime.sendMessage({ target: 'background', type, ...fields });
let busy = false;
let itemId;

function showStatus(message, state = '') {
  $('status').textContent = message;
  $('status').dataset.state = state;
}

function sourceUrl() {
  const value = webUrl($('source').value.trim());
  if (!value) throw new Error('请输入完整的 HTTP 或 HTTPS 网页链接。');
  return value;
}

function updateLink() {
  const link = webUrl($('source').value.trim());
  $('open-source').hidden = !link;
  if (link) $('open-source').href = link;
  else $('open-source').removeAttribute('href');
}

async function refresh() {
  const state = await send('GET_STATE');
  if (!state.ok) throw new Error(state.error);
  showStatus(state.message || '在网页图片上右键开始。', state.state);
  $('empty').hidden = !!state.item;
  $('result').hidden = !state.item;
  if (state.item) {
    itemId = state.item.id;
    $('preview').src = state.item.preview;
    $('dimensions').textContent = `${state.item.width} × ${state.item.height} px`;
    $('source-kind').textContent = state.item.sourceKind;
    $('source').value = state.item.sourceUrl;
    updateLink();
  }
}

async function run(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try { await action(); }
  catch (error) { showStatus(error.message || '操作失败，请重试。', 'error'); }
  finally {
    busy = false;
    document.querySelectorAll('button').forEach(button => { button.disabled = false; });
  }
}

$('source').addEventListener('input', updateLink);
$('copy').addEventListener('click', () => run(async () => {
  const response = await send('GET_DATA', { sourceUrl: sourceUrl(), itemId });
  if (!response.ok) throw new Error(response.error);
  const png = await fetch(response.item.dataUrl).then(result => result.blob());
  await writeImageWithSource(response.item, png);
  const marked = await send('COPIED', { itemId });
  if (!marked.ok) throw new Error(marked.error);
  showStatus('已复制图片和原链接。', 'copied');
}));

for (const format of ['html', 'png']) {
  $(`save-${format}`).addEventListener('click', () => run(async () => {
    const response = await send('DOWNLOAD', { format, sourceUrl: sourceUrl(), itemId });
    if (!response.ok) throw new Error(response.error);
    showStatus('已打开保存窗口。');
  }));
}

$('clear').addEventListener('click', () => run(async () => {
  const response = await send('CLEAR');
  if (!response.ok) throw new Error(response.error);
  await refresh();
}));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && (changes.state || changes.message) && !busy) refresh().catch(error => showStatus(error.message, 'error'));
});
refresh().catch(error => showStatus(error.message, 'error'));
