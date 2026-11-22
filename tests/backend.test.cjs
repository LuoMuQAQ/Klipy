const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const backend = path.resolve(__dirname, '../bin/backend/AuthenticatorBackend.exe');
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // RFC test fixture
const secret2 = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const secret3 = 'MFRGGZDFMZTWQ2LKMFRGGZDFMZTWQ2LK';
const group = { id: 'test-group', name: 'Fixture', createdAt: 1 };
const account = { groupId: group.id, issuer: 'Team:West', account: 'name:sub', secret, period: 7, algorithm: 'sha256' };
const windowsOnly = { skip: process.platform !== 'win32' };

function fixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'klipy-backend-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'groups.json'), JSON.stringify([group]));
  return { dir, run(commands) {
    const input = commands.map(([action, params], id) => JSON.stringify({ id: String(id), action, params })).join('\n') + '\n';
    const result = spawnSync(backend, {
      input, encoding: 'utf8', env: { ...process.env, AUTHENTICATOR_DATA_DIR: dir }, windowsHide: true, timeout: 15000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim().split('\n').map(line => JSON.parse(line));
  } };
}

test('TOTP import canonicalizes supported parameters and rejects invalid ones before saving', windowsOnly, (t) => {
  const { run } = fixture(t);
  const uri = `otpauth://totp/Fixture?secret=${secret}`;
  const [valid, ...invalid] = run([
    ['parseuri', { uri: `${uri}&algorithm=sha256&digits=8&period=7` }],
    ['parseuri', { uri: 'otpauth://totp/Fixture?secret=A' }],
    ['parseuri', { uri: 'otpauth://totp/Fixture' }],
    ['parseuri', { uri: `${uri}&algorithm=MD5` }],
    ['parseuri', { uri: `${uri}&digits=7` }],
    ['parseuri', { uri: `${uri}&period=0` }],
    ['validatesecret', { secret: 'A' }],
    ['add', { ...account, algorithm: 'MD5' }],
  ]);
  assert.deepEqual([valid.success, valid.data.algorithm, valid.data.digits, valid.data.period], [true, 'SHA256', 8, 7]);
  assert(invalid.every(value => !value.success));
  assert.deepEqual(run([['list']])[0].data, []);
});

test('exported account round-trips labels with colons and list reports its actual expiry', windowsOnly, (t) => {
  const { run } = fixture(t);
  const [added, list] = run([['add', account], ['list']]);
  assert(added.success && list.success);
  const [details] = list.data;
  assert.equal(details.validUntil % account.period, 0);
  assert(details.validUntil > Math.floor(Date.now() / 1000) - 2);
  assert(details.remainingSeconds > 0 && details.remainingSeconds <= account.period);
  const [exported] = run([['export', { id: added.data.id }]]);
  const [parsed] = run([['parseuri', { uri: exported.data.uri }]]);
  assert.deepEqual([parsed.data.issuer, parsed.data.account, parsed.data.secret], [account.issuer, account.account, secret]);
});

test('a no-op reorder does not rewrite the unified encrypted vault', windowsOnly, (t) => {
  const { run, dir } = fixture(t);
  const [added] = run([['add', account]]);
  assert(added.success);
  const vault = path.join(dir, 'accounts.json');
  assert.equal(existsSync(path.join(dir, 'groups.json')), false);
  const beforeVault = readFileSync(vault);
  const result = run([['reorder', { ids: [added.data.id] }], ['groupreorder', { ids: [group.id] }]]);
  assert(result.every(value => value.success));
  assert(readFileSync(vault).equals(beforeVault), 'vault bytes changed');
});

function migrationUri(entries, param = 'data') {
  const payload = Buffer.concat(entries.map(({ type = 2, algorithm = 1, digits = 1 }) => {
    const entry = [0x0a, 2, 1, 2, 0x20, algorithm, 0x28, digits, 0x30, type];
    return Buffer.from([0x0a, entry.length, ...entry]);
  }));
  return `otpauth-migration://offline?${param}=${encodeURIComponent(payload.toString('base64'))}`;
}

test('migration imports supported TOTP entries and ignores unknown or incompatible parameters', windowsOnly, (t) => {
  const { run } = fixture(t);
  const [supported, wrongParameter] = run([
    ['parsemigration', { uri: migrationUri([{}, { type: 1 }, { algorithm: 4 }, { type: 3 }, { digits: 3 }, { algorithm: 5 }]) }],
    ['parsemigration', { uri: migrationUri([{}], 'notdata') }],
  ]);
  assert(supported.success);
  assert.equal(supported.data.accounts.length, 1);
  assert.equal(supported.data.skipped, 5);
  assert.equal(wrongParameter.success, false);
});

test('batch import commits once, deduplicates by TOTP key/parameters, allows same name with different secret, and rejects invalid batches atomically', windowsOnly, (t) => {
  const { run, dir } = fixture(t);
  const vault = path.join(dir, 'accounts.json');

  // Initial batch with an internal duplicate (differently formatted Base32)
  const [first] = run([[
    'addbatch',
    {
      groupId: group.id,
      accounts: [
        { issuer: 'GitHub', account: 'alice@example.com', secret, digits: 6, period: 30, algorithm: 'SHA1' },
        { issuer: 'GitHub Dup', account: 'other@example.com', secret: 'gezd-gnbv gy3t qojq gezd gnbv gy3t qojq====', digits: 6, period: 30, algorithm: 'sha1' },
        { issuer: 'GitHub', account: 'alice@example.com', secret: secret2, digits: 6, period: 30, algorithm: 'SHA1' },
      ],
    },
  ]]);
  assert(first.success);
  assert.equal(first.data.added, 2);
  assert.equal(first.data.duplicates, 1);
  assert.equal(first.data.accounts.length, 2);

  // Re-importing the exact same batch is idempotent and does not rewrite the vault
  const afterFirstBytes = readFileSync(vault);
  const [retry] = run([[
    'addbatch',
    {
      groupId: group.id,
      accounts: [
        { issuer: 'GitHub', account: 'alice@example.com', secret, digits: 6, period: 30, algorithm: 'SHA1' },
        { issuer: 'GitHub', account: 'alice@example.com', secret: secret2, digits: 6, period: 30, algorithm: 'SHA1' },
      ],
    },
  ]]);
  assert(retry.success);
  assert.equal(retry.data.added, 0);
  assert.equal(retry.data.duplicates, 2);
  assert(readFileSync(vault).equals(afterFirstBytes), 'idempotent retry rewrote vault');

  // Same secret with different algorithm/digits is NOT considered a duplicate
  const [diffParams] = run([[
    'addbatch',
    {
      groupId: group.id,
      accounts: [
        { issuer: 'GitHub SHA256', account: 'alice@example.com', secret, digits: 8, period: 30, algorithm: 'SHA256' },
      ],
    },
  ]]);
  assert(diffParams.success);
  assert.equal(diffParams.data.added, 1);
  assert.equal(diffParams.data.duplicates, 0);

  // Batch with an invalid item fails atomically without saving valid preceding items
  const beforeInvalidBytes = readFileSync(vault);
  const [invalidBatch, listAfter] = run([
    [
      'addbatch',
      {
        groupId: group.id,
        accounts: [
          { issuer: 'Valid', account: 'ok', secret: secret3, digits: 6, period: 30, algorithm: 'SHA1' },
          { issuer: 'Broken', account: 'bad', secret: 'NOT!BASE32', digits: 6, period: 30, algorithm: 'SHA1' },
        ],
      },
    ],
    ['list'],
  ]);
  assert.equal(invalidBatch.success, false);
  assert.equal(listAfter.data.length, 3);
  assert(readFileSync(vault).equals(beforeInvalidBytes), 'failed batch modified vault');
});

test('deleting a group atomically removes both the group and its accounts without resurrecting orphans on restart', windowsOnly, (t) => {
  const { run } = fixture(t);
  const [secondGroup] = run([['groupadd', { name: 'KeepMe' }]]);
  assert(secondGroup.success);
  const keepId = secondGroup.data.id;

  const [a1, a2, a3] = run([
    ['add', { ...account, groupId: group.id, account: 'gone-1' }],
    ['add', { ...account, groupId: group.id, account: 'gone-2', secret: secret2 }],
    ['add', { ...account, groupId: keepId, account: 'kept', secret: secret3 }],
  ]);
  assert(a1.success && a2.success && a3.success);

  const [deleted] = run([['groupdelete', { id: group.id }]]);
  assert(deleted.success);
  assert.deepEqual(deleted.data, { deleted: true, removedAccounts: 2 });

  // Fresh backend restart must see only the remaining group and its account (no "默认分组").
  const [groupsAfter, accountsAfter] = run([['grouplist'], ['list']]);
  assert.deepEqual(groupsAfter.data.map(g => g.name), ['KeepMe']);
  assert.deepEqual(accountsAfter.data.map(a => a.account), ['kept']);
});

test('startup orphan recovery assigns missing-group legacy accounts to 默认分组 inside KLIPY-DPAPI-2', windowsOnly, (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'klipy-orphan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify([
    { id: 'orphan-1', issuer: 'GitHub', account: 'a@example.com', secret, digits: 6, period: 30, algorithm: 'SHA1', groupId: '', createdAt: 1 },
    { id: 'orphan-2', issuer: 'Google', account: 'b@example.com', secret: secret2, digits: 6, period: 30, algorithm: 'SHA1', groupId: 'deleted-gid', createdAt: 2 },
  ]));
  const input = [['grouplist'], ['list']].map(([action, params], id) => JSON.stringify({ id: String(id), action, params })).join('\n') + '\n';
  const result = spawnSync(backend, {
    input, encoding: 'utf8', env: { ...process.env, AUTHENTICATOR_DATA_DIR: dir }, windowsHide: true, timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
  const [groupsRes, accountsRes] = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(groupsRes.data.length, 1);
  assert.equal(groupsRes.data[0].name, '默认分组');
  assert(accountsRes.data.every(a => a.groupId === groupsRes.data[0].id));
  assert(readFileSync(path.join(dir, 'accounts.json')).subarray(0, 14).equals(Buffer.from('KLIPY-DPAPI-2\n')));
});

test('all supported TOTP algorithms agree with independent HMAC for their actual periods', windowsOnly, (t) => {
  const { run } = fixture(t);
  const options = [
    { algorithm: 'SHA1', digits: 6, period: 30 },
    { algorithm: 'SHA256', digits: 8, period: 7 },
    { algorithm: 'SHA512', digits: 8, period: 17 },
  ];
  const results = run(options.map(params => ['add', { ...account, ...params }]));
  for (const result of results) {
    assert(result.success);
    const { algorithm, digits, period, validUntil, code } = result.data;
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(validUntil / period - 1));
    const mac = createHmac(algorithm.toLowerCase(), '12345678901234567890').update(counter).digest();
    const truncated = mac.readUInt32BE(mac.at(-1) & 15) & 0x7fffffff;
    assert.equal(code, String(truncated % 10 ** digits).padStart(digits, '0'));
  }
});
