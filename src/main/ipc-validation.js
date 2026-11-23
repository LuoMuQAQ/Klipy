const string = (max, min = 1) => (value) => typeof value === 'string' &&
  value.length >= min && value.length <= max && !value.includes('\0');
const integer = (min, max) => (value) => Number.isInteger(value) && value >= min && value <= max;
const optional = (test) => (value) => value === undefined || test(value);
const id = string(128);
const name = string(20, 0);
const issuer = string(256, 0);
const account = string(512, 0);
const secret = string(4096);
const ids = (value) => Array.isArray(value) && value.length > 0 && value.length <= 10_000 && value.every(id);

const PNG_ICON_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_ICON_LENGTH = 256 * 1024;

/** 空字符串=自动匹配，si:<slug>=内置图标，data:image/png=已缩放的自定义图片。 */
function accountIcon(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || value.length > MAX_ICON_LENGTH) return false;
  if (/^si:[a-z0-9-]{1,64}$/.test(value)) return true;
  if (!value.startsWith(PNG_ICON_PREFIX)) return false;
  const payload = value.slice(PNG_ICON_PREFIX.length);
  if (payload.length === 0 || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return false;
  const bytes = Buffer.from(payload, 'base64');
  if (bytes.length < 24 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return false;
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') return false;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && width <= 512 && height > 0 && height <= 512;
}

const accountInputSchema = {
  issuer,
  account,
  secret,
  digits: optional((v) => v === 6 || v === 8),
  period: optional(integer(1, 2_147_483_647)),
  algorithm: optional((v) => ['SHA1', 'SHA256', 'SHA512'].includes(v)),
};

const matchesObject = (schema) => (value) =>
  Boolean(value) &&
  Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).every((key) => Object.hasOwn(schema, key)) &&
  Object.entries(schema).every(([key, test]) => test(value[key]));

const batchAccounts = (value) =>
  Array.isArray(value) && value.length > 0 && value.length <= 500 && value.every(matchesObject(accountInputSchema));

const schemas = {
  list: null,
  add: { ...accountInputSchema, groupId: id },
  addBatch: { groupId: id, accounts: batchAccounts },
  delete: { id },
  update: { id, issuer, account, groupId: id, icon: optional(accountIcon) },
  parseUri: { uri: string(8192) },
  parseMigration: { uri: string(256 * 1024) },
  validateSecret: { secret },
  groupList: null,
  groupAdd: { name },
  groupRename: { id, name },
  groupDelete: { id },
  groupReorder: { ids },
  reorder: { ids },
  export: { id },
  copyCode: { id },
};

function validate(channel, params) {
  const schema = schemas[channel];
  if (schema === null && params === undefined) return;
  if (!schema || !matchesObject(schema)(params)) {
    throw new Error('请求参数无效或超出长度限制。');
  }
}

function validateClipboard(text) {
  if (!string(8192)(text) || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new Error('剪贴板内容无效。');
  }
}

module.exports = { validate, validateClipboard };
