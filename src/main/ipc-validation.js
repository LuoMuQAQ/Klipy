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

const schemas = {
  list: null,
  add: { issuer, account, secret, groupId: id, digits: optional((v) => v === 6 || v === 8),
    period: optional(integer(1, 2_147_483_647)), algorithm: optional((v) => ['SHA1', 'SHA256', 'SHA512'].includes(v)) },
  delete: { id },
  update: { id, issuer, account, groupId: id },
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
};

function validate(channel, params) {
  const schema = schemas[channel];
  if (schema === null && params === undefined) return;
  if (!schema || !params || Object.getPrototypeOf(params) !== Object.prototype ||
      Object.keys(params).some((key) => !Object.hasOwn(schema, key)) ||
      !Object.entries(schema).every(([key, test]) => test(params[key]))) {
    throw new Error('请求参数无效或超出长度限制。');
  }
}

function validateClipboard(text) {
  if (!string(8192)(text) || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new Error('剪贴板内容无效。');
  }
}

module.exports = { validate, validateClipboard };
