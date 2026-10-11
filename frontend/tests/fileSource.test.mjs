import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const directory = await mkdtemp(path.join(tmpdir(), 'dropit-file-source-'));
const output = path.join(directory, 'fileSource.mjs');
await build({ entryPoints: [fileURLToPath(new URL('../src/utils/fileSource.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'browser', outfile: output });
const intakeOutput = path.join(directory, 'intake.mjs');
await build({ entryPoints: [fileURLToPath(new URL('../src/utils/ingestScreenshot.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'browser', outfile: intakeOutput });
const { ingestScreenshot } = await import(pathToFileURL(intakeOutput));
after(() => rm(directory, { recursive: true, force: true }));
const { validFileSource, sourceCardUpdates, screenshotSource, openSource, selectSource } = await import(pathToFileURL(output));
const source = { path: 'C:\\projects\\source.psd', name: 'source.psd', linkedBy: 'detected' };
const card = { id: '1', type: 'image', width: 360, height: 200, x: 10, y: 20, zIndex: 1 };

test('adding, changing and removing references preserves image geometry and OCR text', () => {
  const added = { ...card, ...sourceCardUpdates(card, source) };
  assert.equal(added.type, 'file'); assert.equal(added.height, 268);
  const changed = { ...added, ...sourceCardUpdates(added, { ...source, name: 'second.pdf', path: 'C:\\second.pdf' }) };
  assert.equal(changed.height, 268);
  const removed = sourceCardUpdates(changed);
  assert.equal(removed.type, 'image'); assert.equal(removed.height, 200); assert.equal(removed.fileSource, null);
  assert.equal(sourceCardUpdates({ ...card, type: 'text', content: 'OCR' }, source).type, 'text');
  const scaled = sourceCardUpdates({ ...card, height: 400, defaultHeight: 200, contentScale: 2 }, source);
  assert.equal(scaled.height, 536); assert.equal(scaled.defaultHeight, 268);
  assert.equal(removed.title, undefined);
});

test('only clipboard images consult the capture record; identical dropped images stay images', async () => {
  let matches = 0;
  globalThis.window = { setTimeout, clearTimeout, pywebview: { api: {
    match_screenshot_source: async () => { matches++; return source; },
  } } };
  globalThis.FileReader = class { readAsDataURL() { this.result = 'data:image/png;base64,sample'; this.onload(); } };
  globalThis.Image = class { naturalWidth = 400; naturalHeight = 200; set src(_) { queueMicrotask(() => this.onload()); } };
  globalThis.fetch = async () => ({ ok: false });
  const created = [];
  const actions = { createCard: (value) => { created.push(value); return value; },
    updateCard() {}, getCard() {}, showToast() {}, position: { x: 0, y: 0 } };
  await ingestScreenshot({}, actions);
  assert.equal(matches, 0); assert.equal(created[0].type, 'image');
  await ingestScreenshot({}, { ...actions, matchClipboardSource: true });
  assert.equal(matches, 1); assert.equal(created[1].type, 'file');
  assert.equal(created[1].height, 248); assert.deepEqual(created[1].fileSource, source);
});

test('browser fallback and malformed native results never create a file card', async () => {
  globalThis.window = { setTimeout };
  assert.equal(await screenshotSource('image'), undefined);
  await assert.rejects(openSource(source), /桌面版/);
  window.pywebview = { api: { match_screenshot_source: async () => ({ ...source, path: 'https://wrong.test' }) } };
  assert.equal(await screenshotSource('image'), undefined);
  assert.equal(validFileSource({ ...source, linkedBy: 'guess' }), false);
});

test('native references are read without rewriting the image and opening errors reach callers', async () => {
  let seen;
  globalThis.window = { setTimeout, pywebview: { api: {
    match_screenshot_source: async (image) => { seen = image; return source; },
    open_source_file: async () => ({ success: false, error: '找不到原文件' }),
    select_source_file: async () => ({ success: true, source: { ...source, linkedBy: 'selected' } }),
  } } };
  assert.deepEqual(await screenshotSource('original image data'), source);
  assert.equal(seen, 'original image data');
  await assert.rejects(openSource(source), /找不到原文件/);
  assert.equal((await selectSource()).linkedBy, 'selected');
});
