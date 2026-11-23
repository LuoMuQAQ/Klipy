// Run with electron ./tests/electron-smoke.cjs; never opens the real user vault.
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, clipboard, ipcMain } = require('electron');
const temp = mkdtempSync(path.join(os.tmpdir(), 'klipy-electron-'));
const data = path.join(temp, 'data');
const profile = path.join(temp, 'profile');
const skipClipboard = process.env.KLIPY_TEST_SKIP_CLIPBOARD === '1';
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // synthetic RFC vector
mkdirSync(data);
mkdirSync(profile);
app.setPath('userData', profile);
process.env.AUTHENTICATOR_DATA_DIR = data;
const dev = process.env.AUTHENTICATOR_DEV_URL === 'http://127.0.0.1:5173/';
writeFileSync(path.join(data, 'accounts.json'), JSON.stringify([{ id: 'fixture', issuer: 'GitHub',
  account: 'fixture@example.com', secret, groupId: 'test-group', period: 2 }]));
writeFileSync(path.join(data, 'groups.json'), JSON.stringify([{ id: 'test-group', name: 'Fixture' }]));
const deadline = setTimeout(() => finish(new Error('Electron smoke timed out')), 35000);
let done = false;
function finish(error) {
  if (done) return;
  done = true;
  clearTimeout(deadline);
  if (error) console.error(error);
  if (error) app.exit(1); else app.quit();
}

async function until(read, description) {
  for (let tries = 0; tries < 80; tries++) {
    const result = await read();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${description}`);
}

app.once('browser-window-created', (_event, win) => {
  win.show = () => {}; // Keep the test window hidden.
  win.webContents.once('did-fail-load', (_e, _code, desc) => finish(new Error(desc)));
  win.webContents.once('did-finish-load', async () => {
    const { webContents: wc } = win;
    const js = (code) => wc.executeJavaScript(code);
    try {
      assert.equal(process.versions.electron, require('../package.json').devDependencies.electron);
      const [width, height] = win.getContentSize();
      assert(Math.abs(width - 400) <= 2 && Math.abs(height - 620) <= 2, `Unexpected content size: ${width}×${height}`);
      assert.equal(win.isResizable(), false);
      assert.equal(wc.getURL(), dev ? process.env.AUTHENTICATOR_DEV_URL : 'klipy://app/index.html');
      await until(() => js("document.body.innerText.includes('fixture@example.com')"), 'account card');
      await until(() => js("[...document.images].some(img => img.src.endsWith('/brands/si/github.svg') && img.naturalWidth > 0)"), 'brand logo');
      const [account] = await js('authenticatorAPI.listAccounts()');
      assert.equal(account.id, 'fixture');
      assert(!('secret' in account));
      assert.equal(await js("authenticatorAPI.copyAccountCode('missing-fixture-id')"), false);
      assert(await js("authenticatorAPI.exportAccount([]).then(() => false, () => true)"));
      assert(await js("fetch('https://example.invalid/').then(() => false, () => true)"));
      assert(await js("Notification.requestPermission().then(value => value === 'denied', () => true)"));
      assert.equal(await js("window.open('https://example.invalid/') === null"), true);
      assert(await js(`(async () => {
        const uri = 'otpauth://totp/Fixture?secret=${secret}';
        return (await authenticatorAPI.parseUri(uri)).secret === '${secret}';
      })()`));
      // Custom non-30s period card renders its own per-card countdown badge.
      assert(await js("document.querySelector('[data-slot=\"custom-period\"]')?.textContent.includes('/ 2s')"));

      // Account icon: pick from the bundled library, upload a custom image, then reset to auto.
      const openEdit = async () => {
        await js(`(() => {
          const card = [...document.querySelectorAll('button')].find(el => el.innerText.includes('fixture@example.com'));
          card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 220, clientY: 240 }));
        })()`);
        await until(() => js("[...document.querySelectorAll('[role=menuitem]')].some(el => el.innerText === '编辑')"), 'account context menu');
        await js("[...document.querySelectorAll('[role=menuitem]')].find(el => el.innerText === '编辑').click()");
        await until(() => js("document.querySelector('#account-icon-btn') !== null"), 'edit dialog');
      };
      const openIconPicker = async () => {
        await js("document.querySelector('#account-icon-btn').click()");
        await until(() => js("document.querySelector('[data-icon-picker]') !== null"), 'icon picker');
      };
      const saveEdit = () => js("document.querySelector('#save-account-btn').click()");

      await openEdit();
      await openIconPicker();
      assert(await js(`(() => {
        const grid = document.querySelector('[data-icon-grid]');
        const choose = document.querySelector('#choose-icon-image-btn');
        const top = choose.getBoundingClientRect().top;
        const first = grid.querySelector('button');
        const last = [...grid.querySelectorAll('button')].at(-1);
        const topGap = first.getBoundingClientRect().top - grid.getBoundingClientRect().top;
        grid.scrollTop = grid.scrollHeight;
        const bottomGap = grid.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
        grid.scrollTop = 0;
        return topGap >= 5 && bottomGap >= 5 && top === choose.getBoundingClientRect().top &&
          !grid.querySelector('[data-icon-slug="xiaomi"], [data-icon-slug="netflix"]');
      })()`));
      await js("document.querySelector('[data-icon-picker] [data-icon-slug=\"canva\"]').click()");
      await until(() => js("!document.querySelector('[data-icon-picker]')"), 'icon picker closed after library choice');
      await saveEdit();
      await until(() => js("!document.querySelector('[role=dialog]')"), 'library icon saved');
      await until(() => js("[...document.images].some(img => img.src.endsWith('/brands/si/canva.svg') && img.naturalWidth > 0)"), 'library icon rendered');

      await openEdit();
      await openIconPicker();
      await until(() => js("document.querySelector('[data-icon-picker] input[type=file]') !== null"), 'icon upload input');
      const uploadIcon = () => js(`(async () => {
        const input = document.querySelector('[data-icon-picker] input[type=file]');
        const source = document.createElement('canvas');
        source.width = 240;
        source.height = 120;
        const ctx = source.getContext('2d');
        ctx.fillStyle = '#f00';
        ctx.fillRect(0, 0, 120, 120);
        ctx.fillStyle = '#00f';
        ctx.fillRect(120, 0, 120, 120);
        const blob = await new Promise(resolve => source.toBlob(resolve));
        const upload = new DataTransfer();
        upload.items.add(new File([blob], 'icon.png', { type: 'image/png' }));
        input.files = upload.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await uploadIcon();
      await until(() => js("!!document.querySelector('[data-icon-crop]')"), 'crop editor opens before applying');
      assert(await js(`(() => {
        const crop = document.querySelector('[data-icon-crop]');
        const help = crop.querySelector('canvas').getAttribute('aria-description');
        return !!help && !crop.innerText.includes(help);
      })()`));
      await js("document.querySelector('#cancel-icon-crop-btn').click()");
      await until(() => js("!!document.querySelector('[data-icon-picker]')"), 'cancel crop returns to picker');
      assert(await js("document.querySelector('[data-icon-slug=canva]').getAttribute('aria-pressed') === 'true'"));
      await uploadIcon();
      await until(() => js("!!document.querySelector('[data-icon-crop] canvas')"), 'crop preview');
      await js(`(() => {
        const slider = document.querySelector('[data-icon-crop] input[type=range]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, '2');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        const canvas = document.querySelector('[data-icon-crop] canvas');
        canvas.focus();
        for (let i = 0; i < 25; i++) canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      })()`);
      await until(() => js(`(() => {
        const crop = document.querySelector('[data-icon-crop]');
        return crop.textContent.includes('200%') && crop.querySelector('canvas').getContext('2d').getImageData(0, 128, 1, 1).data[2] === 255;
      })()`), 'zoomed crop preview moved right');
      await js("document.querySelector('#confirm-icon-crop-btn').click()");
      await until(() => js("!document.querySelector('[data-icon-crop], [data-icon-picker]')"), 'confirmed crop returns to edit');
      assert.equal(await js("authenticatorAPI.listAccounts().then(list => list.find(a => a.id === 'fixture').icon)"), 'si:canva');
      await saveEdit();
      await until(() => js("!document.querySelector('[role=dialog]')"), 'custom icon saved');
      assert(await js(`(async () => {
        const account = (await authenticatorAPI.listAccounts()).find(a => a.id === 'fixture');
        if (!account.icon.startsWith('data:image/png;base64,')) return false;
        const image = new Image();
        image.src = account.icon;
        await image.decode();
        if (image.naturalWidth !== 128 || image.naturalHeight !== 128) return false;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return Array.from(ctx.getImageData(0, 64, 1, 1).data).join(',') === '0,0,255,255';
      })()`));
      await until(() => js("[...document.images].some(img => img.src.startsWith('data:image/png;base64,') && img.naturalWidth === 128)"), 'custom icon rendered');

      await openEdit();
      await openIconPicker();
      await until(() => js("document.querySelector('[data-icon-picker] [data-icon-auto]') !== null"), 'auto icon option');
      await js("document.querySelector('[data-icon-picker] [data-icon-auto]').click()");
      await until(() => js("!document.querySelector('[data-icon-picker]')"), 'icon picker closed after auto choice');
      await saveEdit();
      await until(() => js("!document.querySelector('[role=dialog]')"), 'auto icon restored');
      await until(() => js("[...document.images].some(img => img.src.endsWith('/brands/si/github.svg') && img.naturalWidth > 0)"), 'auto icon rendered');
      assert.equal(await js("authenticatorAPI.listAccounts().then(list => list.find(a => a.id === 'fixture').icon)"), '');

      // Keyboard Shift+F10 opens the card context menu cleanly.
      await js(`(() => {
        const card = [...document.querySelectorAll('button')].find(el => el.innerText.includes('fixture@example.com'));
        card.focus();
        card.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
      })()`);
      await until(() => js("[...document.querySelectorAll('[role=menuitem]')].some(el => el.innerText === '导出')"), 'keyboard context menu');
      await js("[...document.querySelectorAll('[role=menuitem]')].find(el => el.innerText === '导出').click()");
      await until(() => js("document.querySelector('img[alt=\"2FA QR Code\"]')?.naturalWidth > 0"), 'export QR');

      const png = path.join(temp, 'fixture-qr.png');
      const downloaded = new Promise((resolve, reject) => {
        wc.session.once('will-download', (event, item) => {
          if (event.defaultPrevented) return reject(new Error('QR download blocked'));
          item.setSavePath(png);
          item.once('done', (_e, state) => state === 'completed' ? resolve() : reject(new Error(`Download: ${state}`)));
        });
      });
      await js("[...document.querySelectorAll('button')].find(el => el.innerText === '保存图片').click()");
      await downloaded;
      assert.equal(readFileSync(png).subarray(1, 4).toString(), 'PNG');
      const pngBase64 = readFileSync(png).toString('base64');
      rmSync(png);
      await js("[...document.querySelectorAll('[role=tab]')].find(el => el.textContent.includes('Base32')).click()");
      await until(() => js(`document.body.innerText.includes('${secret}')`), 'Base32 tab');

      // Never overwrite an occupied OS clipboard. Only the test vector can be copied.
      let checkedClipboard = false;
      if (!skipClipboard && (await clipboard.read()).length === 0) {
        try {
          await js("document.querySelector('button[aria-label=\"Copy to clipboard\"]').click()");
          await until(async () => (await clipboard.readText()) === secret, 'Windows clipboard text');
          for (const format of ['ExcludeClipboardContentFromMonitorProcessing', 'CanIncludeInClipboardHistory', 'CanUploadToCloudClipboard']) {
            assert(await clipboard.has(`electron application/osclipboard;format="${format}"`), `missing ${format}`);
          }
          checkedClipboard = true;
        } finally {
          if (await clipboard.readText() === secret) clipboard.clear();
        }
      }
      await js("[...document.querySelectorAll('button')].find(el => el.innerText === '关闭').click()");
      await until(() => js(`!document.body.innerText.includes('${secret}') && !document.querySelector('img[alt="2FA QR Code"]')`), 'export cleanup');
      await js("document.querySelector('#add-account-btn').click()");
      await until(() => js("[...document.querySelectorAll('[role=tab]')].some(el => el.textContent.includes('二维码'))"), 'add modal');
      await js("[...document.querySelectorAll('[role=tab]')].find(el => el.textContent.includes('二维码')).click()");
      await until(() => js("document.querySelector('input[type=file]') !== null"), 'QR upload input');
      await js(`(() => {
        const input = document.querySelector('input[type=file]');
        const bytes = Uint8Array.from(atob('${pngBase64}'), value => value.charCodeAt(0));
        const upload = new DataTransfer();
        upload.items.add(new File([bytes], 'fixture.png', {type: 'image/png'}));
        input.files = upload.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await until(() => js("[...document.querySelectorAll('[role=dialog] button')].some(el => el.innerText === '添加' && !el.disabled)"), 're-import QR');
      await js("[...document.querySelectorAll('[role=dialog] button')].find(el => el.innerText === '添加').click()");
      await until(() => js('authenticatorAPI.listAccounts().then(list => list.length === 2)'), 'persisted imported QR');
      await until(() => js("!document.querySelector('[role=dialog]')"), 'add dialog closed');
      await until(() => js("document.querySelectorAll('.otp-code').length === 2"), 'account list refreshed');
      const initialCode = await js("document.querySelector('.otp-code').textContent");
      await until(() => js(`document.querySelector('.otp-code').textContent !== ${JSON.stringify(initialCode)}`), 'non-30-second code refresh');

      // Verify batch import deduplication through the full preload -> IPC -> backend path.
      const batchResult = await js(`authenticatorAPI.addAccountsBatch({
        groupId: 'test-group',
        accounts: [
          { issuer: 'GitHub', account: 'dup', secret: '${secret}', digits: 6, period: 2, algorithm: 'SHA1' },
          { issuer: 'BatchNew', account: 'new@example.com', secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', digits: 6, period: 30, algorithm: 'SHA1' },
        ],
      })`);
      assert.equal(batchResult.added, 1);
      assert.equal(batchResult.duplicates, 1);

      // Control just the reply timing; earlier assertions exercise the real parser/bridge.
      let releaseParse;
      ipcMain.removeHandler('authenticator:parseMigration');
      ipcMain.handle('authenticator:parseMigration', () => new Promise(resolve => { releaseParse = resolve; }));
      await js("document.querySelector('#add-account-btn').click()");
      const tab = (label) => js(`[...document.querySelectorAll('[role=tab]')].find(el => el.textContent.includes('${label}')).click()`);
      await until(() => js("[...document.querySelectorAll('[role=tab]')].some(el => el.textContent.includes('链接'))"), 'import tabs');
      await tab('链接');
      const setUri = (value) => js(`(() => {
        const input = [...document.querySelectorAll('[role=dialog] input')].find(el => el.labels?.[0]?.textContent.includes('OTP Auth'));
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await setUri('otpauth-migration://offline?data=fixture');
      await until(() => releaseParse, 'pending link response');
      await setUri('');
      await tab('二维码');
      releaseParse({ accounts: [{ issuer: 'STALE_IMPORT_FIXTURE', account: 'stale', secret }], skipped: 0, batchSize: 1 });
      await js('new Promise(resolve => setTimeout(resolve, 300))');
      assert.equal(await js("document.body.innerText.includes('STALE_IMPORT_FIXTURE')"), false);
      assert(await js("[...document.querySelectorAll('[role=dialog] button')].some(el => el.innerText === '添加' && el.disabled)"));
      console.log(`PASS Electron ${process.versions.electron} (${dev ? 'dev' : 'production'}): fixed window, local assets, IPC, PNG export/re-import, custom periods, stale import, clipboard ${checkedClipboard ? 'with privacy marker' : 'not modified'}`);
      finish();
    } catch (error) { finish(error); }
  });
});
require('../src/main/main');
