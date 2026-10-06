import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'dropit-clipboard-tests-'));
const modulePath = path.join(temporary, 'clipboard.mjs');
await build({ stdin: { resolveDir: frontend, contents: `
  export * from './src/utils/canvasClipboard';
  export * from './src/utils/canvasClipboardTransport';
  export * from './src/utils/groupMenuActions';
  export * from './src/utils/marqueeSelection';
` }, bundle: true, format: 'esm', platform: 'browser', outfile: modulePath });
globalThis.window = { location: { search: '', href: 'http://localhost/' } };
globalThis.location = window.location;
after(() => rm(temporary, { recursive: true, force: true }));
const { collectClipboardSnapshot, cloneClipboardSnapshot, removeClipboardSnapshot,
  serializeClipboardSnapshot, parseClipboardSnapshot, readClipboardSnapshot,
  clipboardSnapshotHtml, writeClipboardSnapshot, hasCanvasClipboardPayload, CANVAS_CLIPBOARD_MIME,
  applyGroupMenuAction, marqueeSelection } = await import(pathToFileURL(modulePath));

const card = (id, values = {}) => ({ id, type: 'text', x: 10, y: 20, width: 200, height: 100, zIndex: 1, ...values });
const group = (id, values = {}) => ({ id, kind: 'bundle', title: 'Group', x: 0, y: 0, width: 400, height: 300, ...values });
const pin = (index, values = {}) => ({ id: `pin-${index}`, index, x: 600, y: 250, zoom: 1.2, createdAt: 1234, ...values });

test('ordinary marquee selects Group, origin and pins, while interior selections stay individual', () => {
  const cards = [card('member', { bundleId: 'bundle', x: 50, y: 80 })];
  const groups = [group('bundle'), group('origin', { kind: 'parent', x: 400, y: 80, width: 120, height: 120 })];
  const selection = marqueeSelection({ x: 0, y: 0, width: 700, height: 400 }, cards, groups, [pin(1)]);
  assert.deepEqual([...selection.groupIds], ['bundle', 'origin']);
  assert.deepEqual([...selection.cardIds], ['member']);
  assert.deepEqual([...selection.pinIds], ['pin-1']);
  const interior = { x: 70, y: 90, width: 20, height: 20 };
  assert.equal(marqueeSelection(interior, cards, groups).groupIds.size, 0);
  assert.deepEqual([...marqueeSelection(interior, cards, groups).cardIds], ['member']);
  assert.deepEqual([...marqueeSelection(interior, cards, groups, [], true).groupIds], ['bundle']);
});

test('collapsed Group marquee uses all member rows but excludes hidden cards', () => {
  const cards = Array.from({ length: 5 }, (_, i) => card(`member-${i}`, { bundleId: 'bundle', x: 3000 }));
  const selected = marqueeSelection({ x: 5, y: 150, width: 10, height: 10 }, cards, [group('bundle', { collapsed: true })]);
  assert.deepEqual([...selected.groupIds], ['bundle']);
  assert.equal(selected.cardIds.size, 0);
});

test('mixed selection copies and clones complete Groups, origins and pins with relative layout', () => {
  const cards = [card('a', { bundleId: 'bundle', headerTitle: '成员标题' }), card('b', { bundleId: 'bundle', x: 300 })];
  const groups = [group('bundle', { parentIds: ['origin'] }), group('origin', { kind: 'parent', x: 500, width: 120, height: 120 })];
  const copied = collectClipboardSnapshot(cards, groups, new Set(), new Set(['bundle', 'origin']), [pin(1)], new Set(['pin-1']));
  const parsed = parseClipboardSnapshot(serializeClipboardSnapshot(copied));
  assert.ok(parsed);
  const pasted = cloneClipboardSnapshot(parsed, { x: 1000, y: 800 }, [], [], () => 10, false);
  assert.equal(pasted.cards.length, 2);
  assert.equal(pasted.groups.length, 2);
  assert.equal(pasted.pins.length, 1);
  assert.equal(pasted.cards[0].headerTitle, '成员标题');
  assert.equal(pasted.cards[0].bundleId, pasted.groups[0].id);
  assert.deepEqual(pasted.groups[0].parentIds, [pasted.groups[1].id]);
  assert.equal(pasted.pins[0].x - pasted.groups[1].x, copied.pins[0].x - copied.groups[1].x);
  assert.equal(pasted.pins[0].zoom, 1.2);
  assert.notEqual(pasted.pins[0].id, copied.pins[0].id);
});

test('pin-only paste assigns free indices without replacing target pins or stealing preferred indices', () => {
  const copied = { cards: [], groups: [], pins: [pin(1), pin(2, { x: 900 })] };
  const parsed = parseClipboardSnapshot(serializeClipboardSnapshot(copied));
  assert.ok(parsed);
  const existing = [pin(1)];
  const cloned = cloneClipboardSnapshot(parsed, { x: 1000, y: 500 }, [], [], () => 1, false, existing);
  assert.deepEqual(cloned.pins.map((item) => item.index), [3, 2]);
  assert.deepEqual(existing, [pin(1)]);
  const full = Array.from({ length: 8 }, (_, i) => pin(i + 1));
  assert.throws(() => cloneClipboardSnapshot(parsed, { x: 0, y: 0 }, [], [], () => assert.fail('must stop before mutating z-index'), false, full), /最多 8/);
});

test('cutting pins removes only selected pins; malformed or duplicate pin metadata is rejected', () => {
  const pins = [pin(1), pin(2)];
  assert.deepEqual(removeClipboardSnapshot([], [], { cards: [], groups: [], pins: [pins[0]] }, pins).pins, [pins[1]]);
  for (const invalid of [[pin(9)], [pin(1, { x: null })], [pin(1), pin(1, { id: 'other' })], [null]]) {
    assert.equal(parseClipboardSnapshot(serializeClipboardSnapshot({ cards: [], groups: [], pins: invalid })), null);
  }
});

test('group-menu multi-detach moves every selected member and preserves upstream links', () => {
  const cards = [card('a', { bundleId: 'bundle', contentScale: 2 }), card('b', { bundleId: 'bundle' }),
    card('remaining', { bundleId: 'bundle' })];
  const groups = [group('bundle', { parentIds: ['origin'] }), group('origin', { kind: 'parent' })];
  const result = applyGroupMenuAction('detach', cards, groups, new Set(['a', 'b']), new Set());
  assert.deepEqual(result.cards.slice(0, 2).map((item) => [item.bundleId, item.groupId, item.contentScale]),
    [[null, 'origin', 1], [null, 'origin', 1]]);
  assert.equal(result.cards[2].bundleId, 'bundle');
  assert.ok(result.groups.some((item) => item.id === 'bundle'));
  assert.equal(cards[0].bundleId, 'bundle');
});

test('group-menu dissolving nested groups reconnects members to the surviving origin', () => {
  const cards = [card('member', { bundleId: 'inner' }), card('child', { groupId: 'inner' })];
  const groups = [group('inner', { parentIds: ['outer'] }), group('outer', { parentIds: ['origin'] }),
    group('origin', { kind: 'parent' })];
  const result = applyGroupMenuAction('ungroup', cards, groups, new Set(), new Set(['inner', 'outer']));
  assert.deepEqual(result.groups.map((item) => item.id), ['origin']);
  assert.ok(result.cards.every((item) => item.groupId === 'origin'));
  assert.equal(result.cards[0].bundleId, null);
});

const snapshot = { sourceContext: 'source-window:workspace', groups: [], cards: [
  card('first', { headerTitle: '标题一 <&"', title: '原标题', content: '# 标题\n第一段',
    tags: ['灵感'], reminder: '2026-10-06', color: '#fff000', textColor: '#123456',
    borderColor: '#112233', contentScale: 1.5, sizeLocked: true, defaultWidth: 150, defaultHeight: 80 }),
  card('second', { x: 400, y: -100, width: 320, height: 150, headerTitle: '标题二', content: '第二段' }),
] };

test('multiple notes round-trip with all titles, content and formatting', () => {
  assert.deepEqual(parseClipboardSnapshot(serializeClipboardSnapshot(snapshot)), snapshot);
});

// CardModel.model_dump() persists absent optional properties as null.
const persistedCard = (id, values = {}) => card(id, {
  groupId: null, bundleId: null, content: null, title: null, headerTitle: null,
  url: null, image: null, description: null, favicon: null, reminder: null,
  tags: null, sizeLocked: null, defaultWidth: null, defaultHeight: null,
  contentScale: null, color: null, textColor: null, borderColor: null, ...values,
});

test('saved notes with backend null fields remain separate and preserve titles', () => {
  const stored = { cards: [persistedCard('saved-one', { headerTitle: '保存的标题一', content: '正文一' }),
    persistedCard('saved-two', { headerTitle: '保存的标题二', content: '正文二', x: 500 })], groups: [] };
  const parsed = parseClipboardSnapshot(JSON.stringify({ __type: 'infinite-canvas-objects', version: 1, ...stored }));
  assert.ok(parsed, 'a normal backend persistence record must be a valid snapshot');
  assert.equal(parsed.cards.length, 2);
  assert.deepEqual(parsed.cards.map((item) => item.headerTitle), ['保存的标题一', '保存的标题二']);
  assert.equal(parsed.cards[0].title, undefined);
  assert.equal(parsed.cards[0].contentScale, undefined);
  assert.equal(parsed.cards[0].groupId, null);
  assert.equal(stored.cards[0].title, null, 'normalization must not mutate source data');
});

test('saved Group and legacy parent tolerate empty optional metadata', () => {
  const stored = { cards: [persistedCard('member', { bundleId: 'saved-group' })], groups: [
    group('saved-group', { parentIds: ['saved-parent'], color: null, tags: null, collapsed: null, outlinePadding: null }),
    group('saved-parent', { kind: null, parentIds: null, color: null, zIndex: null, tags: null, collapsed: null,
      outlinePadding: null, reminder: null, textColor: null, borderColor: null }),
  ] };
  const parsed = parseClipboardSnapshot(JSON.stringify({ __type: 'infinite-canvas-objects', version: 1, ...stored }));
  assert.ok(parsed);
  const cloned = cloneClipboardSnapshot(parsed, { x: 1000, y: 500 }, [], [], () => 3, false);
  assert.equal(cloned.cards[0].bundleId, cloned.groups[0].id);
  assert.deepEqual(cloned.groups[0].parentIds, [cloned.groups[1].id]);
  assert.equal(cloned.groups[1].kind, undefined);
});

test('copies of persisted notes emit legacy-compatible metadata without losing either title', () => {
  const stored = { cards: [persistedCard('saved-one', { headerTitle: '标题一', content: '正文一' }),
    persistedCard('saved-two', { headerTitle: '标题二', content: '正文二', x: 500 })], groups: [
    group('origin', { kind: null, color: null, parentIds: null, zIndex: null }),
  ] };
  const emitted = JSON.parse(serializeClipboardSnapshot(stored));
  assert.equal(emitted.cards.length, 2);
  assert.deepEqual(emitted.cards.map((item) => item.headerTitle), ['标题一', '标题二']);
  for (const item of emitted.cards) {
    for (const key of ['title', 'tags', 'sizeLocked', 'contentScale', 'image', 'color']) {
      assert.equal(Object.hasOwn(item, key), false, `old readers must not receive ${key}: null`);
    }
    assert.equal(item.groupId, null);
    assert.equal(item.bundleId, null);
    assert.equal(item.reminder, null);
  }
  assert.equal(Object.hasOwn(emitted.groups[0], 'kind'), false);
  assert.equal(stored.cards[0].tags, null, 'writing must not mutate the source board');
});

test('repeated copying and pasting saved multi-selections retains object count and titles', () => {
  let selected = [persistedCard('repeat-one', { headerTitle: '一', content: 'A' }),
    persistedCard('repeat-two', { headerTitle: '二', content: 'B' })];
  const canvas = [...selected];
  for (let i = 0; i < 3; i++) {
    const copied = collectClipboardSnapshot(canvas, [], new Set(selected.map((item) => item.id)), new Set());
    const parsed = parseClipboardSnapshot(serializeClipboardSnapshot(copied));
    assert.ok(parsed);
    selected = cloneClipboardSnapshot(parsed, { x: 1000 + i * 300, y: 500 }, canvas, [], () => i + 10).cards;
    assert.equal(selected.length, 2);
    assert.deepEqual(selected.map((item) => item.headerTitle), ['一', '二']);
    canvas.push(...selected);
  }
  assert.equal(canvas.length, 8);
  assert.equal(new Set(canvas.map((item) => item.id)).size, 8);
});

test('standard HTML carries the full snapshot while escaping displayed text', () => {
  const html = clipboardSnapshotHtml(snapshot);
  const payload = decodeURIComponent(html.match(/data-infinite-canvas-clipboard="([^"]+)"/)[1]);
  assert.deepEqual(parseClipboardSnapshot(payload), snapshot);
  const external = clipboardSnapshotHtml({ cards: [card('external', { content: '<script> & "' })], groups: [] });
  assert.ok(external.includes('&lt;script&gt; &amp; &quot;'));
});

test('clipboard payload wins regardless of previous in-memory text matches', () => {
  const data = { getData: (type) => type === CANVAS_CLIPBOARD_MIME ? serializeClipboardSnapshot(snapshot) : 'old text' };
  assert.deepEqual(readClipboardSnapshot(data), snapshot);
});

test('malformed, unsupported and duplicate objects cannot masquerade as canvas snapshots', () => {
  for (const raw of ['{', '{}', JSON.stringify({ __type: 'infinite-canvas-objects', version: 2, ...snapshot }),
    serializeClipboardSnapshot({ cards: [{ ...card('bad'), content: { invalid: true } }], groups: [] }),
    serializeClipboardSnapshot({ cards: [card('bad-scale', { contentScale: 'broken' })], groups: [] }),
    serializeClipboardSnapshot({ cards: [card('same'), card('same')], groups: [] }),
    serializeClipboardSnapshot({ cards: [null], groups: [] })]) assert.equal(parseClipboardSnapshot(raw), null);
});

test('recognizable but invalid object payload is distinguishable from external plain text', () => {
  const invalid = serializeClipboardSnapshot({ cards: [card('broken', { width: null })], groups: [] });
  const data = { getData: (type) => type === 'text/plain' ? invalid : '' };
  assert.equal(parseClipboardSnapshot(invalid), null);
  assert.equal(hasCanvasClipboardPayload(data), true);
  assert.equal(hasCanvasClipboardPayload({ getData: (type) => type === 'text/plain' ? 'ordinary external text' : '' }), false);
});

test('image-only HTML displays the image and keeps the title inside structured metadata', () => {
  const html = clipboardSnapshotHtml({ cards: [card('picture', { type: 'image', image: 'data:image/png;base64,test', headerTitle: '图标题' })], groups: [] });
  assert.ok(html.includes('<img src="data:image/png;base64,test">'));
  assert.ok(!html.includes('<pre>'));
  const payload = decodeURIComponent(html.match(/data-infinite-canvas-clipboard="([^"]+)"/)[1]);
  assert.equal(parseClipboardSnapshot(payload).cards[0].headerTitle, '图标题');
});

test('pasting multiple notes creates distinct IDs and preserves relative positions and metadata', () => {
  let z = 0;
  const pasted = cloneClipboardSnapshot(snapshot, { x: 1000, y: 500 }, [], [], () => ++z, false);
  assert.equal(pasted.cards.length, 2);
  assert.notEqual(pasted.cards[0].id, pasted.cards[1].id);
  for (let i = 0; i < 2; i++) {
    const { id, x, y, zIndex, groupId, bundleId, ...rest } = pasted.cards[i];
    const { id: oldId, x: oldX, y: oldY, zIndex: oldZ, ...original } = snapshot.cards[i];
    assert.notEqual(id, oldId);
    assert.deepEqual(rest, original);
  }
  assert.equal(pasted.cards[1].x - pasted.cards[0].x, snapshot.cards[1].x - snapshot.cards[0].x);
  assert.equal(pasted.cards[1].y - pasted.cards[0].y, snapshot.cards[1].y - snapshot.cards[0].y);
});

test('selected Group copies all members; a selected member stays independent', () => {
  const cards = [card('one', { bundleId: 'bundle' }), card('two', { bundleId: 'bundle' }), card('outside')];
  const groups = [group('bundle')];
  assert.equal(collectClipboardSnapshot(cards, groups, new Set(), new Set(['bundle'])).cards.length, 2);
  const member = collectClipboardSnapshot(cards, groups, new Set(['one']), new Set());
  assert.equal(member.cards.length, 1);
  assert.equal(member.groups.length, 0);
  assert.equal(cloneClipboardSnapshot(member, { x: 0, y: 0 }, cards, groups, () => 2).cards[0].bundleId, null);
});

test('internal links remap and cross-board external parents do not attach to colliding target IDs', () => {
  const cards = [card('one', { bundleId: 'bundle' }), card('two', { groupId: 'bundle' }), card('three', { groupId: 'parent' })];
  const groups = [group('bundle', { parentIds: ['parent'] }), group('parent', { kind: 'parent' })];
  const cloned = cloneClipboardSnapshot({ cards, groups }, { x: 0, y: 0 }, [], [], () => 2, false);
  assert.equal(cloned.cards[0].bundleId, cloned.groups[0].id);
  assert.equal(cloned.cards[1].groupId, cloned.groups[0].id);
  assert.equal(cloned.cards[2].groupId, cloned.groups[1].id);
  assert.deepEqual(cloned.groups[0].parentIds, [cloned.groups[1].id]);
  const child = { cards: [card('child', { groupId: 'parent' })], groups: [] };
  assert.equal(cloneClipboardSnapshot(child, { x: 0, y: 0 }, [], groups, () => 2, false).cards[0].groupId, null);
  assert.equal(cloneClipboardSnapshot(child, { x: 0, y: 0 }, [], groups, () => 2, true).cards[0].groupId, 'parent');
});

test('cutting a parent leaves unselected descendants and clears their dangling links', () => {
  const cards = [card('child', { groupId: 'parent' }), card('member', { bundleId: 'bundle' })];
  const groups = [group('parent', { kind: 'parent' }), group('bundle', { parentIds: ['parent'] })];
  const result = removeClipboardSnapshot(cards, groups, { cards: [], groups: [groups[0]] });
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0].groupId, null);
  assert.deepEqual(result.groups[0].parentIds, []);
});

test('cutting a member refreshes remaining Group bounds and removes only newly empty Groups', () => {
  const cards = [card('one', { bundleId: 'bundle' }), card('two', { x: 1000, bundleId: 'bundle' })];
  const groups = [group('bundle'), group('unrelated-empty')];
  const result = removeClipboardSnapshot(cards, groups, { cards: [cards[0]], groups: [] });
  assert.equal(result.cards.length, 1);
  assert.equal(result.groups[0].x, 982);
  assert.equal(result.groups.length, 2);
  const empty = removeClipboardSnapshot(result.cards, result.groups, { cards: result.cards, groups: [] });
  assert.deepEqual(empty.groups.map((item) => item.id), ['unrelated-empty']);
});

test('standard HTML and plain text preserve full metadata without requiring custom MIME support', async () => {
  globalThis.ClipboardItem = class { constructor(formats) { this.formats = formats; } };
  const writes = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { write: async (items) => {
    writes.push(items[0].formats);
    if (items[0].formats[CANVAS_CLIPBOARD_MIME]) throw new Error('Unsupported custom MIME');
  } } } });
  await writeClipboardSnapshot(snapshot);
  assert.equal(writes.length, 1);
  assert.ok(writes[0]['text/html']);
  assert.equal(await writes[0]['text/plain'].text(), '# 标题\n第一段\n第二段');
  const html = await writes[0]['text/html'].text();
  assert.deepEqual(parseClipboardSnapshot(decodeURIComponent(html.match(/data-infinite-canvas-clipboard="([^"]+)"/)[1])), snapshot);
});

test('a failed structured clipboard write rejects instead of reporting a safe cut', async () => {
  navigator.clipboard.write = async () => { throw new Error('Write denied'); };
  await assert.rejects(writeClipboardSnapshot(snapshot), /Write denied/);
});
