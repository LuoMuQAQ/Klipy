const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, spawn } = require('node:child_process');
const { createHmac } = require('node:crypto');
const { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const { once } = require('node:events');
const { validate, validateClipboard } = require('../src/main/ipc-validation');
const { assetPath } = require('../src/main/renderer-security');

const backend = path.resolve(__dirname, '../bin/backend/AuthenticatorBackend.exe');
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // RFC test vector only
const account = { id: 'legacy-id', issuer: 'GitHub', account: 'fixture@example.com', secret,
  digits: 6, period: 30, algorithm: 'SHA1', groupId: 'test-group', createdAt: 42 };
const group = { id: account.groupId, name: 'Fixture', createdAt: 41 };
const prefixV2 = Buffer.from('KLIPY-DPAPI-2\n');

function fixture(t, initial = JSON.stringify([account]), initialGroups = JSON.stringify([group])) {
  const data = mkdtempSync(path.join(os.tmpdir(), 'klipy-security-'));
  const vault = path.join(data, 'accounts.json');
  const groupsFile = path.join(data, 'groups.json');
  t.after(() => rmSync(data, { recursive: true, force: true }));
  if (initial !== null) writeFileSync(vault, initial);
  if (initialGroups !== null) writeFileSync(groupsFile, initialGroups);
  return { data, vault, groupsFile, env: { ...process.env, AUTHENTICATOR_DATA_DIR: data } };
}

function run(fixture, commands) {
  const input = commands.map(([action, params], index) => JSON.stringify({ id: String(index), action, params })).join('\n');
  const result = spawnSync(backend, { input: input + '\n', encoding: 'utf8', env: fixture.env, windowsHide: true, timeout: 15000 });
  if (result.error) throw result.error;
  assert.equal(result.stderr, '');
  return { status: result.status, responses: result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) };
}

function dpapiProtectV1(jsonText) {
  const b64 = Buffer.from(jsonText, 'utf8').toString('base64');
  const ps = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String('${b64}'); ` +
    `$enc=[System.Security.Cryptography.ProtectedData]::Protect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); ` +
    `[Console]::Out.Write([Convert]::ToBase64String($enc))`;
  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true });
  assert.equal(res.status, 0, res.stderr);
  return Buffer.concat([Buffer.from('KLIPY-DPAPI-1\n'), Buffer.from(res.stdout.trim(), 'base64')]);
}

function vector(time) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(Math.floor(time / 30)));
  const mac = createHmac('sha1', '12345678901234567890').update(bytes).digest();
  const offset = mac.at(-1) & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const windowsOnly = { skip: process.platform !== 'win32' };
test('legacy plaintext vault and groups.json migrate into single KLIPY-DPAPI-2 vault', windowsOnly, (t) => {
  const f = fixture(t, '\uFEFF' + JSON.stringify([account]));
  const before = Math.floor(Date.now() / 1000);
  const { status, responses: [list, exported, groups] } = run(f, [['list'], ['export', { id: account.id }], ['grouplist']]);
  assert.equal(status, 0);
  const after = Math.floor(Date.now() / 1000);
  assert(list.success && exported.success && groups.success);
  assert.deepEqual(groups.data, [group]);
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].id, account.id);
  assert.equal(list.data[0].groupId, account.groupId);
  assert([vector(before), vector(after)].includes(list.data[0].code));
  assert.equal('secret' in list.data[0], false);
  assert.equal(exported.data.secret, secret);
  const ciphertext = readFileSync(f.vault);
  assert(ciphertext.subarray(0, prefixV2.length).equals(prefixV2));
  assert(!ciphertext.includes(secret));
  assert(!ciphertext.includes(account.account));
  assert(!ciphertext.includes(group.name));
  assert.deepEqual(readdirSync(f.data).sort(), ['.klipy.lock', 'accounts.json']);
  const again = run(f, [['export', { id: account.id }]]);
  assert.deepEqual(again.responses, [{ ...exported, id: '0' }]);
  assert.deepEqual(readFileSync(f.vault), ciphertext);
});

test('KLIPY-DPAPI-1 vault + groups.json upgrades cleanly to KLIPY-DPAPI-2 and ignores stale groups.json afterwards', windowsOnly, (t) => {
  const f = fixture(t, dpapiProtectV1(JSON.stringify([account])), JSON.stringify([group]));
  const { status, responses: [list, groups] } = run(f, [['list'], ['grouplist']]);
  assert.equal(status, 0);
  assert(list.success && groups.success);
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].id, account.id);
  assert.deepEqual(groups.data, [group]);
  const v2Bytes = readFileSync(f.vault);
  assert(v2Bytes.subarray(0, prefixV2.length).equals(prefixV2));
  assert.deepEqual(readdirSync(f.data).sort(), ['.klipy.lock', 'accounts.json']);

  // Simulate interrupted migration: stale groups.json left beside valid KLIPY-DPAPI-2 vault
  writeFileSync(f.groupsFile, JSON.stringify([{ id: 'stale', name: 'StaleGroup', createdAt: 1 }]));
  const afterStale = run(f, [['grouplist'], ['list']]);
  assert.equal(afterStale.status, 0);
  assert.deepEqual(afterStale.responses[0].data, [group]);
  assert.equal(afterStale.responses[1].data.length, 1);
  assert.deepEqual(readdirSync(f.data).sort(), ['.klipy.lock', 'accounts.json']);
  assert.deepEqual(readFileSync(f.vault), v2Bytes);
});

test('corruption and incomplete migrations cannot turn into an empty writable vault', windowsOnly, (t) => {
  for (const initial of ['[{"secret":', '[null]', 'null', 'KLIPY-DPAPI-2\nbad', 'KLIPY-DPAPI-3\nbad', 'KLIPY-DPAPI-1\ntruncated']) {
    const f = fixture(t, initial);
    assert.deepEqual(run(f, [['list'], ['add', account]]), { status: 20, responses: [] });
    assert.equal(readFileSync(f.vault, 'utf8'), initial);
  }
  // Corrupt legacy groups.json must also refuse startup without wiping either file
  const corruptGroups = fixture(t, JSON.stringify([account]), '[{"id":');
  assert.deepEqual(run(corruptGroups, [['list']]), { status: 20, responses: [] });
  assert.equal(readFileSync(corruptGroups.groupsFile, 'utf8'), '[{"id":');

  // Stored icon values are part of the vault contract: an unsupported scheme fails closed.
  const badIcon = fixture(t, JSON.stringify([{ ...account, icon: 'javascript:alert(1)' }]), JSON.stringify([group]));
  assert.deepEqual(run(badIcon, [['list']]), { status: 20, responses: [] });
  assert.equal(readFileSync(badIcon.vault, 'utf8'), JSON.stringify([{ ...account, icon: 'javascript:alert(1)' }]));

  const f = fixture(t);
  writeFileSync(f.vault + '.interrupted.tmp', Buffer.concat([prefixV2, Buffer.from('uncommitted')]));
  assert(run(f, [['list']]).responses[0].success);
  const good = readFileSync(f.vault);
  good[good.length - 1] ^= 1;
  writeFileSync(f.vault, good);
  assert.deepEqual(run(f, [['list']]), { status: 20, responses: [] });
  assert.deepEqual(readFileSync(f.vault), good);
});

test('fresh vault, CRUD, reorder, and export persist only encrypted unified vault', windowsOnly, (t) => {
  const f = fixture(t, null);
  const { responses: [first, second] } = run(f, [['add', account], ['add', { ...account, account: 'second' }]]);
  assert(first.success && second.success);
  const { responses: [reorder, update, list, del, exp] } = run(f, [
    ['reorder', { ids: [first.data.id, second.data.id] }],
    ['update', { id: first.data.id, issuer: 'Fixture', account: 'updated', groupId: group.id }], ['list'],
    ['delete', { id: first.data.id }], ['export', { id: second.data.id }],
  ]);
  assert(reorder.success && update.success && del.success && exp.success);
  assert.deepEqual(list.data.map(a => a.account), ['updated', 'second']);
  assert.equal(exp.data.secret, secret);
  assert(!readFileSync(f.vault).includes(secret));
  assert.equal(run(f, [['list']]).responses[0].data.length, 1);
});

test('second backend cannot open the same data directory', windowsOnly, async (t) => {
  const f = fixture(t);
  const child = spawn(backend, [], { env: f.env, windowsHide: true });
  const exit = once(child, 'exit');
  const reader = readline.createInterface({ input: child.stdout });
  try {
    const line = once(reader, 'line');
    child.stdin.write('{"id":"first","action":"ping"}\n');
    assert(JSON.parse((await line)[0]).success);
    assert.deepEqual(run(f, [['list']]), { status: 21, responses: [] });
  } finally {
    child.stdin.end();
    reader.close();
    assert.equal((await exit)[0], 0);
  }
});

test('IPC schemas bound sizes without admitting extra arguments', () => {
  const { id, createdAt, groupId, ...validItem } = account;
  const validAdd = { ...validItem, groupId };
  const pngIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const hugePng = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(hugePng);
  hugePng.writeUInt32BE(13, 8);
  hugePng.write('IHDR', 12, 'ascii');
  hugePng.writeUInt32BE(10_000, 16);
  hugePng.writeUInt32BE(10_000, 20);
  const hugeIcon = `data:image/png;base64,${hugePng.toString('base64')}`;
  const updateWithIcon = (icon) => ({ id, issuer: 'Fixture', account: 'updated', groupId, icon });
  assert.doesNotThrow(() => validate('add', validAdd));
  assert.doesNotThrow(() => validate('addBatch', { groupId, accounts: [validItem] }));
  assert.throws(() => validate('addBatch', { groupId, accounts: [] }));
  assert.throws(() => validate('addBatch', { groupId, accounts: [{ ...validItem, extra: 1 }] }));
  assert.throws(() => validate('addBatch', { groupId, accounts: Array(501).fill(validItem) }));
  assert.doesNotThrow(() => validate('update', { id, issuer: 'Fixture', account: 'updated', groupId }));
  assert.doesNotThrow(() => validate('update', updateWithIcon('')));
  assert.doesNotThrow(() => validate('update', updateWithIcon('si:github')));
  assert.doesNotThrow(() => validate('update', updateWithIcon(pngIcon)));
  assert.throws(() => validate('update', updateWithIcon(42)));
  assert.throws(() => validate('update', updateWithIcon('si:../brands/github')));
  assert.throws(() => validate('update', updateWithIcon('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')));
  assert.throws(() => validate('update', updateWithIcon('data:image/png;base64,aGVsbG8=')));
  assert.throws(() => validate('update', updateWithIcon(hugeIcon)));
  assert.doesNotThrow(() => validate('list'));
  assert.throws(() => validate('list', {}));
  assert.throws(() => validate('export', { id: [] }));
  assert.throws(() => validate('export', { id, other: secret }));
  assert.throws(() => validate('groupAdd', { name: 'x'.repeat(21) }));
  assert.throws(() => validate('parseMigration', { uri: 'x'.repeat(262145) }));
  assert.throws(() => validate('reorder', { ids: [id, null] }));
  assert.throws(() => validateClipboard('a\0b'));
  assert.throws(() => validateClipboard('A'.repeat(8193)));
  assert.doesNotThrow(() => validateClipboard(secret));
});

test('renderer resource mapping permits only bundled assets', () => {
  assert.equal(assetPath('klipy://app/index.html'), 'index.html');
  assert.equal(assetPath('klipy://app/assets/MiSansVF.ada.20-A1.woff2'), 'assets/MiSansVF.ada.20-A1.woff2');
  assert.equal(assetPath('klipy://app/brands/si/github.svg'), 'brands/si/github.svg');
  for (const url of ['file:///C:/some/file', 'klipy://other/index.html', 'klipy://app/assets/../accounts.json',
    'klipy://app/assets/%2e%2e%5caccounts.json', 'klipy://app/assets/config.json', 'klipy://app/assets/local.js?q=1']) {
    assert.equal(assetPath(url), null);
  }
});
