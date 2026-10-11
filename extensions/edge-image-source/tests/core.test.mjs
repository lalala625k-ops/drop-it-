import test from 'node:test';
import assert from 'node:assert/strict';
import { webUrl, resolveSource, clipboardHtml, offlineHtml, filename } from '../core.js';

const page = 'https://example.com/article?mode=1';
const info = { pageUrl: page, srcUrl: 'https://cdn.example.com/photo.jpg' };
const item = { title: '<script>alert(1)</script>"&', dataUrl: 'data:image/png;base64,AAAA', sourceUrl: `${page}&x="quote"`, width: 100, height: 50 };

test('missing, executable and credential-bearing URLs are rejected', () => {
  for (const value of [undefined, null, '', ' ', 'javascript:alert(1)', 'data:text/html,abc', 'https://user:secret@example.com']) {
    assert.equal(webUrl(value, page), '');
  }
  assert.equal(webUrl('/story/123', page), 'https://example.com/story/123');
});

test('a feed image links to its content page; image-CDN and fragment links use the collection page', () => {
  assert.equal(resolveSource({ ...info, linkUrl: 'https://example.com/story/123' }, {}, {}).sourceUrl, 'https://example.com/story/123');
  for (const linkUrl of [undefined, info.srcUrl, 'https://cdn.example.com/full.png?q=1', `${page}#image`, 'javascript:alert(1)']) {
    assert.equal(resolveSource({ ...info, linkUrl }, {}, {}).sourceUrl, page);
  }
});

test('canonical is trusted only for the matching frame document and origin', () => {
  assert.equal(resolveSource(info, { pageUrl: page, canonical: '/article' }, {}).sourceUrl, 'https://example.com/article');
  assert.equal(resolveSource(info, { pageUrl: page, canonical: 'https://attacker.com' }, {}).sourceUrl, page);
  const framed = { ...info, frameUrl: 'https://embed.example.org/post/456' };
  assert.equal(resolveSource(framed, { pageUrl: page, canonical: '/article' }, {}).sourceUrl, framed.frameUrl);
  assert.throws(() => resolveSource({ pageUrl: 'edge://settings' }, {}, {}), /HTTP/);
});

test('rich text embeds offline pixels, escapes page-controlled strings and puts a link below the image', () => {
  const html = clipboardHtml(item);
  assert.ok(html.indexOf('<img ') < html.indexOf('<a '));
  assert.ok(html.includes('data:image/png;base64,AAAA'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('x="quote"'));
  const document = offlineHtml(item);
  assert.ok(document.includes('Content-Security-Policy'));
  assert.ok(document.includes('<meta charset="utf-8"'));
  assert.ok(document.includes(html));
  assert.throws(() => clipboardHtml({ ...item, dataUrl: 'data:image/png;base64," onerror="alert(1)' }), /无效/);
  assert.throws(() => clipboardHtml({ ...item, sourceUrl: 'javascript:alert(1)' }), /无效/);
});

test('download names work on Windows and do not create paths or device files', () => {
  assert.equal(filename('CON', 'html'), '图片_CON-含出处.html');
  assert.equal(filename('a/b\\c:..', 'png'), 'a_b_c_.png');
  assert.equal(filename('  ', 'html'), '图片-含出处.html');
  assert.ok(filename('x'.repeat(100), 'png').length <= 84);
});
