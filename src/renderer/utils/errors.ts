import { LANGUAGE, t } from '../i18n';

/**
 * Electron 在 ipcRenderer.invoke 失败时会把错误包成
 * "Error invoking remote method 'xxx': Error: 真实信息"，
 * 这里剥掉外层包装，只把后端返回的提示交给界面；英文界面会翻译已知的后端文案。
 */
const backendMessagesEn: Record<string, string> = {
  '请先选择分组。': 'Select a group first.',
  '分组不存在。': 'Group not found.',
  '分组名称已存在。': 'A group with this name already exists.',
  '请输入分组名称。': 'Enter a group name.',
  '验证码位数或周期无效。': 'Invalid code digits or period.',
  '图标格式无效。': 'Invalid icon format.',
  '没有可导入的账号。': 'There are no accounts to import.',
  '单次批量导入最多支持 500 个账号。': 'A batch can import at most 500 accounts.',
  '批量导入包含无效条目。': 'The batch contains an invalid entry.',
  '无法写入剪贴板。': "Couldn't write to the clipboard.",
  '操作失败，未能完成请求。': 'The operation could not be completed.',
  '参数类型无效。': 'Invalid parameter type.',
  '请输入密钥。': 'Enter a secret.',
  '密钥无效。': 'Invalid secret.',
  '密钥含有无效的 Base32 字符。': 'The secret contains invalid Base32 characters.',
  '不支持该 TOTP 算法。': 'Unsupported TOTP algorithm.',
  '只支持 6 位或 8 位验证码。': 'Only 6- or 8-digit codes are supported.',
  '验证码周期必须为正整数。': 'The period must be a positive integer.',
  '链接不能为空。': 'The link cannot be empty.',
  '不是 otpauth-migration:// 链接。': 'This is not an otpauth-migration:// link.',
  '链接缺少 data 参数。': 'The link is missing the data parameter.',
  'data 参数不是有效的 Base64。': 'The data parameter is not valid Base64.',
  'data 参数为空。': 'The data parameter is empty.',
  '迁移数据包含不支持的字段类型。': 'The migration data contains an unsupported field type.',
  '迁移链接无效。': 'Invalid migration link.',
  '迁移批次信息无效。': 'Invalid migration batch information.',
  '迁移数据损坏。': 'The migration data is corrupted.',
  '请求格式无效。': 'Invalid request format.',
  '分组排序失败。': "Couldn't reorder groups.",
  '不支持的数据文件版本。': 'Unsupported data file version.',
  '数据文件超出大小限制。': 'The data file is too large.',
  'Account not found.': 'Account not found.',
  'Account not found or already deleted.': 'Account not found or already deleted.',
};

export function formatError(error: unknown, fallback = t('operationFailed')): string {
  if (!(error instanceof Error)) return fallback;

  const message = error.message || '';
  const match = message.match(/Error:\s*([\s\S]*)$/);
  const cleaned = (match ? match[1] : message).trim();
  if (!cleaned) return fallback;

  if (LANGUAGE === 'en') {
    const translated = backendMessagesEn[cleaned];
    if (translated) return translated;
    // 未收录的中文后端提示在英文界面回退到本地化通用文案。
    return /[\u4e00-\u9fff]/.test(cleaned) ? fallback : cleaned;
  }
  return cleaned;
}
