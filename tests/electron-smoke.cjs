// Run with electron ./tests/electron-smoke.cjs; never opens the real user vault.
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, clipboard } = require('electron');
const temp = mkdtempSync(path.join(os.tmpdir(), 'klipy-electron-'));
const data = path.join(temp, 'data');
const profile = path.join(temp, 'profile');
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // synthetic RFC vector
mkdirSync(data);
mkdirSync(profile);
app.setPath('userData', profile);
process.env.AUTHENTICATOR_DATA_DIR = data;
const dev = process.env.AUTHENTICATOR_DEV_URL === 'http://127.0.0.1:5173/';
writeFileSync(path.join(data, 'accounts.json'), JSON.stringify([{ id: 'fixture', issuer: 'GitHub',
  account: 'fixture@example.com', secret, groupId: 'test-group' }]));
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
      assert.equal(win.getSize()[0], 400);
      assert(Math.abs(win.getSize()[1] - 620) <= 2);
      assert.equal(win.isResizable(), false);
      assert.equal(wc.getURL(), dev ? process.env.AUTHENTICATOR_DEV_URL : 'klipy://app/index.html');
      await until(() => js("document.body.innerText.includes('fixture@example.com')"), 'account card');
      await until(() => js("[...document.images].some(img => img.src.endsWith('/brands/si/github.svg') && img.naturalWidth > 0)"), 'brand logo');
      const [account] = await js('authenticatorAPI.listAccounts()');
      assert.equal(account.id, 'fixture');
      assert(!('secret' in account));
      assert(await js("authenticatorAPI.exportAccount([]).then(() => false, () => true)"));
      assert(await js("fetch('https://example.invalid/').then(() => false, () => true)"));
      assert(await js("Notification.requestPermission().then(value => value === 'denied', () => true)"));
      assert.equal(await js("window.open('https://example.invalid/') === null"), true);
      assert(await js(`(async () => {
        const uri = 'otpauth://totp/Fixture?secret=${secret}';
        return (await authenticatorAPI.parseUri(uri)).secret === '${secret}';
      })()`));

      await js(`(() => {
        const card = [...document.querySelectorAll('button')].find(el => el.innerText.includes('fixture@example.com'));
        card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 180, clientY: 180 }));
      })()`);
      await until(() => js("[...document.querySelectorAll('[role=menuitem]')].some(el => el.innerText === '导出')"), 'context menu');
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
      if ((await clipboard.read()).length === 0) {
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
      console.log(`PASS Electron ${process.versions.electron} (${dev ? 'dev' : 'production'}): fixed window, local assets, IPC, link parse, PNG export/re-import, cleanup, clipboard ${checkedClipboard ? 'with privacy marker' : 'skipped (occupied)'}`);
      finish();
    } catch (error) { finish(error); }
  });
});
require('../src/main/main');
