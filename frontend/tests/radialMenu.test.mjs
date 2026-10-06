import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const frontend = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'dropit-menu-tests-'));
const modulePath = path.join(temporary, 'menus.mjs');
await build({ stdin: { resolveDir: frontend, contents: `
  export * from './src/utils/radialMenuModel';
  export * from './src/utils/radialMenuGeometry';
` }, bundle: true, format: 'esm', platform: 'browser', outfile: modulePath });
after(() => rm(temporary, { recursive: true, force: true }));
const { radialAction, radialBranch, commonRadialItems, radialButtons,
  radialMenuAt, placeRadialMenu, RADIAL_SIZE } = await import(pathToFileURL(modulePath));
const menu = [radialAction('title'), radialAction('tag'), radialAction('color'),
  radialAction('cut'), radialAction('copy'), radialAction('paste'), radialBranch('group-menu'),
  radialBranch('layout-menu'), radialBranch('recognize-menu'), ...commonRadialItems()];
test('shared commands stay at the same angle when capabilities disappear', () => {
  const sparse = menu.filter((item) => !['tag', 'color', 'recognize-menu', 'group-menu'].includes(item.id));
  for (const item of sparse) {
    const full = radialButtons(menu, null).find((button) => button.id === item.id);
    assert.deepEqual(radialButtons(sparse, null).find((button) => button.id === item.id).point, full.point);
  }
  assert.equal(radialAction('note').angle, radialAction('title').angle);
  assert.equal(radialAction('note').angle, -90);
});
test('each child owns its entire circle without hitting adjacent primary sectors', () => {
  for (const parent of menu.filter((item) => item.children)) {
    const buttons = radialButtons(menu, parent.id);
    for (const button of buttons.filter((item) => item.parent)) {
      for (let angle = 0; angle < 360; angle += 5) {
        const pointer = { x: button.point.x + 35 * Math.cos(angle * Math.PI / 180),
          y: button.point.y + 35 * Math.sin(angle * Math.PI / 180) };
        assert.equal(radialMenuAt(pointer, { x: 0, y: 0 }, 1, menu, parent.id), button.id);
      }
    }
    for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
      assert.ok(Math.hypot(buttons[i].point.x - buttons[j].point.x, buttons[i].point.y - buttons[j].point.y) > RADIAL_SIZE,
        `${buttons[i].id} and ${buttons[j].id} overlap`);
    }
  }
});
test('disabled children and the gap between file commands never select another action', () => {
  const items = [radialBranch('file-menu', { save: false }), radialAction('copy')];
  const children = radialButtons(items, 'file-menu').filter((item) => item.parent);
  const save = children.find((item) => item.id === 'save');
  assert.equal(radialMenuAt(save.point, { x: 0, y: 0 }, 1, items, 'file-menu'), null);
  const saveAs = children.find((item) => item.id === 'save-as');
  const gap = { x: (save.point.x + saveAs.point.x) / 2, y: (save.point.y + saveAs.point.y) / 2 };
  assert.equal(radialMenuAt(gap, { x: 0, y: 0 }, 1, items, 'file-menu'), null);
});
test('every expanded submenu fits near all viewport edges without moving its center', () => {
  for (const viewport of [{ width: 1600, height: 900 }, { width: 900, height: 600 }, { width: 320, height: 240 }]) {
    for (const origin of [{ x: 0, y: 0 }, { x: viewport.width, y: viewport.height }, { x: 10, y: viewport.height / 2 }]) {
      const { center, scale } = placeRadialMenu(origin, menu, viewport);
      for (const branch of menu.filter((item) => item.children)) for (const button of radialButtons(menu, branch.id)) {
        const x = center.x + button.point.x * scale, y = center.y + button.point.y * scale, r = RADIAL_SIZE / 2 * scale;
        assert.ok(x - r >= 0 && y - r >= 0 && x + r <= viewport.width && y + r <= viewport.height);
        if (!button.disabled) assert.equal(radialMenuAt({ x, y }, center, scale, menu, branch.id), button.id);
      }
    }
  }
});
