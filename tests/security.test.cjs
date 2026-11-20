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
const prefix = Buffer.from('KLIPY-DPAPI-1\n');

function fixture(t, initial = JSON.stringify([account])) {
  const data = mkdtempSync(path.join(os.tmpdir(), 'klipy-security-'));
  const vault = path.join(data, 'accounts.json');
  t.after(() => rmSync(data, { recursive: true, force: true }));
  if (initial !== null) writeFileSync(vault, initial);
  writeFileSync(path.join(data, 'groups.json'), JSON.stringify([group]));
  return { data, vault, env: { ...process.env, AUTHENTICATOR_DATA_DIR: data } };
}

function run(fixture, commands) {
  const input = commands.map(([action, params], index) => JSON.stringify({ id: String(index), action, params })).join('\n');
  const result = spawnSync(backend, { input: input + '\n', encoding: 'utf8', env: fixture.env, windowsHide: true, timeout: 15000 });
  if (result.error) throw result.error;
  assert.equal(result.stderr, '');
  return { status: result.status, responses: result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) };
}

function vector(time) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(Math.floor(time / 30)));
  const mac = createHmac('sha1', '12345678901234567890').update(bytes).digest();
  const offset = mac.at(-1) & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const windowsOnly = { skip: process.platform !== 'win32' };
test('legacy vault migrates in place with identical account, TOTP, and grouping', windowsOnly, (t) => {
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
  assert(ciphertext.subarray(0, prefix.length).equals(prefix));
  assert(!ciphertext.includes(secret));
  assert(!ciphertext.includes(account.account));
  assert.deepEqual(readdirSync(f.data).sort(), ['.klipy.lock', 'accounts.json', 'groups.json']);
  const again = run(f, [['export', { id: account.id }]]);
  assert.deepEqual(again.responses, [ { ...exported, id: '0' } ]);
  assert.deepEqual(readFileSync(f.vault), ciphertext);
});

test('corruption and incomplete migrations cannot turn into an empty writable vault', windowsOnly, (t) => {
  for (const initial of ['[{"secret":', '[null]', 'null', 'KLIPY-DPAPI-2\nbad', 'KLIPY-DPAPI-1\ntruncated']) {
    const f = fixture(t, initial);
    assert.deepEqual(run(f, [['list'], ['add', account]]), { status: 20, responses: [] });
    assert.equal(readFileSync(f.vault, 'utf8'), initial);
  }
  const f = fixture(t);
  writeFileSync(f.vault + '.interrupted.tmp', Buffer.concat([prefix, Buffer.from('uncommitted')]));
  assert(run(f, [['list']]).responses[0].success);
  const good = readFileSync(f.vault);
  good[good.length - 1] ^= 1;
  writeFileSync(f.vault, good);
  assert.deepEqual(run(f, [['list']]), { status: 20, responses: [] });
  assert.deepEqual(readFileSync(f.vault), good);
});

test('fresh vault, CRUD, reorder, and export persist only encrypted accounts', windowsOnly, (t) => {
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
  const { id, createdAt, ...validAdd } = account;
  assert.doesNotThrow(() => validate('add', validAdd));
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
