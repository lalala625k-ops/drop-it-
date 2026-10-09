import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'dropit-pinterest-tests-'));
const modulePath = path.join(temporary, 'pinterest.mjs');
await build({ entryPoints: [path.join(frontend, 'src/utils/pinterestTransfer.ts')],
  bundle: true, format: 'esm', platform: 'browser', outfile: modulePath });
after(() => rm(temporary, { recursive: true, force: true }));
const { readPinterestTransfer, PINTEREST_DRAG_TYPES } = await import(pathToFileURL(modulePath));
const [closeup, grid] = PINTEREST_DRAG_TYPES;
const id = '1084804628993834507';
const url = `https://www.pinterest.com/pin/${id}/`;
const image = 'https://i.pinimg.com/736x/2f/ed/a9/2feda954fe0ebb1456ed5a6d0ac5b6bf.jpg';
const read = formats => readPinterestTransfer({ getData: type => formats[type] || '' });

test('closeup-only custom data becomes a Pin link with its preview, without standard text or HTML', () => {
  assert.deepEqual(read({ [closeup]: JSON.stringify({ pinId: id, previewImageUrl: image,
    clientTrackingParams: 'discard-me', imageSignature: 'discard-me' }) }), { url, image });
});
test('grid custom format and Pinterest plain-text marker are also recognized', () => {
  assert.deepEqual(read({ [grid]: JSON.stringify({ pinId: id }) }), { url, image: undefined });
  assert.deepEqual(read({ 'text/plain': `pinterest-pin:${id}` }), { url });
});
test('closeup identity wins over conflicting grid data, image URL and standard page text', () => {
  assert.equal(read({ [closeup]: JSON.stringify({ pinId: id }),
    [grid]: JSON.stringify({ pinId: '123' }), 'text/plain': image, 'text/uri-list': image }).url, url);
});
test('malformed closeup can fall back to the grid data or the plain-text marker', () => {
  assert.equal(read({ [closeup]: '{', [grid]: JSON.stringify({ pinId: id }) }).url, url);
  assert.equal(read({ [closeup]: JSON.stringify({ pinId: {} }), 'text/plain': `pinterest-pin:${id}` }).url, url);
});
test('invalid Pin IDs and lossy numeric IDs never produce fabricated links', () => {
  for (const pinId of ['', '0', '-1', '../123', '123?other=pin', '123/456', 'https://example.com',
    '123abc', '1e18', '1'.repeat(31), [], {}, null, true, 1.5, Number(id)]) {
    assert.equal(read({ [closeup]: JSON.stringify({ pinId }) }), null, String(pinId));
  }
  assert.equal(read({ [closeup]: JSON.stringify({ pinId: 123 }) }).url, 'https://www.pinterest.com/pin/123/');
});
test('untrusted preview URLs are dropped while the known Pin link remains usable', () => {
  for (const previewImageUrl of ['javascript:alert(1)', 'data:image/png;base64,abc', 'http://i.pinimg.com/a.jpg',
    'https://pinimg.com.example.com/a.jpg', 'https://evilpinimg.com/a.jpg', 'https://user:pass@i.pinimg.com/a.jpg',
    'https://example.com/a.jpg', '/a.jpg', null, {}]) {
    assert.deepEqual(read({ [closeup]: JSON.stringify({ pinId: id, previewImageUrl }) }), { url, image: undefined });
  }
});
test('ordinary URLs, image transfers, text and unrelated JSON retain their existing intake path', () => {
  for (const formats of [{ 'text/plain': url }, { 'text/plain': image }, { 'text/plain': 'hello' },
    { 'text/plain': 'pinterest-pin:123\nother text' }, { 'text/plain': JSON.stringify({ pinId: id }) },
    { [closeup]: '[]' }, { [grid]: 'null' }, {}]) assert.equal(read(formats), null);
});
