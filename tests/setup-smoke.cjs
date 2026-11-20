// Windows release check. Use either an unpacked Klipy.exe, or two Setup EXEs
// (older then newer) to test an in-place upgrade on an account without Klipy installed.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, readdirSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { once } = require('node:events');
const { listPackage, extractFile } = require('@electron/asar');

const [, , first, second] = process.argv;
assert(first && process.platform === 'win32', 'Usage: node tests/setup-smoke.cjs Klipy.exe OR older-setup.exe newer-setup.exe');
const temp = mkdtempSync(path.join(os.tmpdir(), 'klipy-setup-test-'));
const data = path.join(temp, 'data');
const installDir = path.join(temp, 'app');
const vault = path.join(data, 'accounts.json');
const fixture = { id: 'setup-fixture', groupId: 'setup-group', issuer: 'GitHub', account: 'setup-fixture@example.com',
  secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' };
mkdirSync(data);
writeFileSync(vault, JSON.stringify([fixture]));
writeFileSync(path.join(data, 'groups.json'), JSON.stringify([{ id: fixture.groupId, name: 'Setup fixture' }]));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(read, description) {
  for (let tries = 0; tries < 120; tries++) {
    const value = await read();
    if (value) return value;
    await delay(150);
  }
  throw new Error(`Timed out: ${description}`);
}

function packagedVersion(executable) {
  const resources = path.join(path.dirname(executable), 'resources');
  const asar = path.join(resources, 'app.asar');
  const files = listPackage(asar);
  assert(files.includes('\\src\\main\\main.js') && files.includes('\\dist\\index.html'));
  assert(!files.some(f => /(^|[\\/])(?:accounts\.json|groups\.json|\.git|\.env|node_modules)(?:$|[\\/])/i.test(f)));
  const backend = readdirSync(path.join(resources, 'backend'));
  for (const name of ['AuthenticatorBackend.exe', 'coreclr.dll', 'hostfxr.dll']) assert(backend.includes(name), name);
  assert(backend.every(f => /\.(exe|dll|json)$/i.test(f) && !/^(accounts|groups)\.json$/i.test(f)));
  return JSON.parse(extractFile(asar, 'package.json').toString()).version;
}

async function launch(executable, label) {
  const profile = path.join(temp, label);
  const portFile = path.join(profile, 'DevToolsActivePort');
  const child = spawn(executable, ['--remote-debugging-port=0', `--user-data-dir=${profile}`], {
    env: { ...process.env, AUTHENTICATOR_DATA_DIR: data }, windowsHide: true, stdio: ['ignore', 'ignore', 'inherit'],
  });
  const exit = once(child, 'exit');
  let socket;
  try {
    const port = await until(() => existsSync(portFile) && readFileSync(portFile, 'utf8').split(/\s/)[0], 'devtools endpoint');
    const target = await until(async () => {
      const res = await fetch(`http://127.0.0.1:${Number(port)}/json/list`);
      return (await res.json()).find(item => item.url === 'klipy://app/index.html');
    }, 'packaged rendering');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let next = 0;
    async function evaluate(expression) {
      const id = ++next;
      return new Promise(resolve => {
        const receive = event => {
          const res = JSON.parse(event.data);
          if (res.id !== id) return;
          socket.removeEventListener('message', receive);
          resolve(res.result?.result?.value);
        };
        socket.addEventListener('message', receive);
        socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
      });
    }
    await until(() => evaluate(`document.body.innerText.includes(${JSON.stringify(fixture.account)})`), 'account card');
    const [account] = await evaluate('authenticatorAPI.listAccounts()');
    assert.equal(account.id, fixture.id);
    assert.equal(account.groupId, fixture.groupId);
    assert.match(account.code, /^\d{6}$/);
    assert(!('secret' in account));
    socket.send(JSON.stringify({ id: ++next, method: 'Runtime.evaluate', params: { expression: 'authenticatorAPI.close()' } }));
    const [code] = await Promise.race([exit, delay(5000).then(() => { throw new Error('App did not close'); })]);
    assert.equal(code, 0);
  } finally {
    socket?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await exit;
    }
  }
}

function runInstaller(exe, args) {
  const result = spawnSync(path.resolve(exe), args, {
    windowsHide: true, stdio: 'inherit', timeout: 120_000,
    env: { ...process.env, AUTHENTICATOR_DATA_DIR: data },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Installer failed: ${path.basename(exe)}`);
}

function guardNoExistingInstall() {
  const script = `$roots = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKCU:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');
    if ((Get-ItemProperty $roots -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Klipy*' }) -or
      (Get-Process Klipy -ErrorAction SilentlyContinue) -or
      (Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\\Klipy'))) { 'present' } else { 'clear' }`;
  const check = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true });
  assert.equal(check.status, 0);
  assert.equal(check.stdout.trim(), 'clear', 'Refusing to touch an existing Klipy installation');
}

(async () => {
  let uninstaller;
  const groupsFile = path.join(data, 'groups.json');
  try {
    if (!second) {
      const exe = path.resolve(first);
      const version = packagedVersion(exe);
      await launch(exe, 'unpacked');
      assert(readFileSync(vault).subarray(0, 14).toString().startsWith('KLIPY-DPAPI-1'));
      console.log(`PASS packaged Klipy ${version}: self-contained backend, asset allowlist, migrated test vault, account UI.`);
      return;
    }
    guardNoExistingInstall();
    assert(!installDir.includes(' '), 'NSIS /D smoke requires a temp path without spaces');
    uninstaller = path.join(installDir, 'Uninstall Klipy.exe');
    runInstaller(first, ['/S', `/D=${installDir}`]);
    const exe = path.join(installDir, 'Klipy.exe');
    const old = packagedVersion(exe);
    await launch(exe, 'old');
    const before = readFileSync(vault);
    const groupsBefore = readFileSync(groupsFile);
    assert(before.toString('utf8', 0, 14).startsWith('KLIPY-DPAPI-1'));
    // Deliberately omit /D on upgrade. The installer must find the existing per-user install directory.
    runInstaller(second, ['/S']);
    const next = packagedVersion(exe);
    assert.notEqual(old, next, 'The existing version was not replaced');
    await launch(exe, 'new');
    assert.deepEqual(readFileSync(vault), before);
    assert.deepEqual(readFileSync(groupsFile), groupsBefore);
    runInstaller(uninstaller, ['/S']);
    uninstaller = undefined;
    // NSIS launches its uninstaller from a temporary location after the original exits.
    await until(() => !existsSync(exe), 'NSIS uninstall');
    assert.deepEqual(readFileSync(vault), before);
    console.log(`PASS NSIS ${old} -> ${next}: same install directory, verified UI and encrypted accounts, vault kept after uninstall.`);
  } finally {
    if (uninstaller && existsSync(uninstaller)) runInstaller(uninstaller, ['/S']);
    try { rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
    catch (error) { console.warn(`Could not remove temporary test folder: ${error.message}`); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
