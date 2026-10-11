import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'dropit-board-window-tests-'));
const modulePath = path.join(temporary, 'boards.mjs');
await build({ entryPoints: [path.join(frontend, 'src/utils/boardWindows.ts')],
  bundle: true, format: 'esm', platform: 'browser', outfile: modulePath });
after(() => rm(temporary, { recursive: true, force: true }));
const { openBoardWindow, consumeOpenFileRequest } = await import(pathToFileURL(modulePath));

test('desktop Open checkpoints the original and requests a distinct file-opening window', async () => {
  const calls = [];
  const original = { cards: ['unsaved'], selection: ['card'], viewport: { x: 99, zoom: .5 } };
  globalThis.window = { pywebview: { api: { new_board: async flag => calls.push(['child', flag]) } } };
  await openBoardWindow(true, async () => calls.push(['checkpoint']));
  assert.deepEqual(calls, [['checkpoint'], ['child', true]]);
  assert.deepEqual(original, { cards: ['unsaved'], selection: ['card'], viewport: { x: 99, zoom: .5 } });
  calls.length = 0;
  await openBoardWindow();
  assert.deepEqual(calls, [['child', false]]);
});

test('a failed checkpoint leaves the original desktop window active without spawning a child', async () => {
  let spawned = false;
  globalThis.window = { pywebview: { api: { new_board: () => { spawned = true; } } } };
  await assert.rejects(openBoardWindow(true, async () => { throw new Error('disk full'); }), /disk full/);
  assert.equal(spawned, false);
});

test('browser Open reserves a separate tab during the click and navigates it after checkpoint', async () => {
  const calls = [];
  const child = { opener: {}, location: { replace: url => calls.push(['navigate', url]) }, close() {} };
  const location = { origin: 'http://localhost:5173', pathname: '/canvas', href: 'http://localhost:5173/canvas' };
  globalThis.window = { location, open: (...args) => { calls.push(['open', ...args]); return child; } };
  const operation = openBoardWindow(true, async () => calls.push(['checkpoint']));
  assert.equal(calls[0][0], 'open');
  await operation;
  assert.equal(child.opener, null);
  assert.deepEqual(calls.slice(0, 2), [['open', 'about:blank', '_blank'], ['checkpoint']]);
  const target = new URL(calls[2][1]);
  assert.equal(target.pathname, '/canvas');
  assert.equal(target.searchParams.get('new-board'), '1');
  assert.equal(target.searchParams.get('open-file'), '1');
  assert.ok(target.searchParams.get('board-id'));
  assert.equal(location.href, 'http://localhost:5173/canvas');
});

test('browser checkpoint failure closes only the newly reserved blank tab', async () => {
  let closed = 0;
  globalThis.window = { open: () => ({ opener: {}, close: () => closed++, location: {} }) };
  await assert.rejects(openBoardWindow(true, async () => { throw new Error('disk full'); }), /disk full/);
  assert.equal(closed, 1);
});

test('blocked tabs report an error before starting a checkpoint', async () => {
  let checkpoint = false;
  globalThis.window = { open: () => null };
  await assert.rejects(openBoardWindow(true, async () => { checkpoint = true; }, 'blocked'), /blocked/);
  assert.equal(checkpoint, false);
});

test('only a new board consumes the file picker request, once across reloads', () => {
  const location = { href: 'http://localhost/?desktop=1&new-board=1&board-id=abc&open-file=1#canvas' };
  globalThis.window = { location, history: { state: { keep: true }, replaceState: (state, title, href) => {
    assert.deepEqual(state, { keep: true }); location.href = href;
  } } };
  assert.equal(consumeOpenFileRequest(), true);
  assert.equal(consumeOpenFileRequest(), false);
  const consumed = new URL(location.href);
  assert.equal(consumed.searchParams.get('board-id'), 'abc');
  assert.equal(consumed.hash, '#canvas');
  location.href = 'http://localhost/?open-file=1';
  assert.equal(consumeOpenFileRequest(), false);
});
