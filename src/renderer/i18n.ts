/**
 * 界面语言：跟随 Windows / Chromium 的系统默认语言（由主进程 app.getLocale() 注入），
 * 目前提供简体中文与英语；没有手动切换入口。
 */
export type Language = 'zh' | 'en';

function readSystemLocale(): string {
  try {
    const injected = window.authenticatorAPI?.locale;
    if (injected) return injected;
  } catch {
    // Preload 尚未就绪时回退到浏览器语言。
  }
  return navigator.language || 'en';
}

export const LANGUAGE: Language = readSystemLocale().toLowerCase().startsWith('zh')
  ? 'zh'
  : 'en';
export const IS_CHINESE = LANGUAGE === 'zh';
export const LOCALE = IS_CHINESE ? 'zh-Hans-CN' : 'en-US';

const zh = {
  // 通用
  cancel: '取消',
  save: '保存',
  close: '关闭',
  create: '创建',
  delete: '删除',
  edit: '编辑',
  rename: '重命名',
  moveUp: '上移',
  moveDown: '下移',
  retry: '重试',
  operationFailed: '操作失败，请重试。',
  copyFailed: '复制失败，请重试。',

  // 标题栏 / 进度条
  backToAccounts: '返回账号列表',
  groupManagement: '分组管理',
  newGroup: '新建分组',
  addAccount: '添加账号',
  minimize: '最小化',
  standardPeriod: '标准 30 秒周期参考',
  remainingSeconds: '剩余 {count} 秒',
  customPeriodAria: '周期 {period} 秒，剩余 {remaining} 秒',

  // 账号列表
  loadAllFailed: '无法读取账号和分组',
  loadAccountsFailed: '无法读取账号',
  loadGroupsFailed: '无法读取分组',
  noGroups: '还没有分组',
  noGroupsHint: '账号需要保存在分组中，先创建一个分组再添加账号。',
  noAccounts: '还没有账号',
  noAccountsInGroup: '该分组暂无账号',
  groupEmptyHint: '「{group}」下还没有账号',
  deleteAccountFailed: '删除失败，请重试',
  accountUpdated: '账号信息已更新',
  saveFailed: '保存失败，请重试',
  copyCodeFailed: '复制失败，请重试',
  copiedCode: '已复制 {issuer} 验证码',
  saveAccountOrderFailed: '未能保存账号顺序',
  saveGroupOrderFailed: '未能保存分组顺序',
  accountActions: '账号操作',
  exportAction: '导出',
  editAction: '编辑',
  deleteAction: '删除',

  // 编辑账号
  editAccount: '编辑账号',
  changeIcon: '更换图标',
  serviceName: '服务名称',
  accountLabel: '账号',
  groupLabel: '分组',
  enterServiceName: '请输入服务名称。',
  enterAccountName: '请输入账号。',
  selectGroup: '请选择分组。',

  // 删除账号
  confirmDelete: '确认删除',
  deleteAccountQuestion: '确定要删除 {issuer} ({account}) 吗？',

  // 导出账号
  exportAccountTitle: '导出账号',
  cannotExportAccount: '无法导出账号，请关闭后重试。',
  tabQr: '二维码',
  tabLink: '链接',
  tabBase32: 'Base32',
  saveImage: '保存图片',
  copyLink: '复制链接',
  cannotGenerateQr: '无法生成二维码，请使用链接或 Base32 密钥。',
  copiedLabel: '已复制{label}',
  linkLabel: '链接',
  base32KeyLabel: 'Base32 密钥',

  // 添加账号
  addAccountTitle: '添加账号',
  addAction: '添加',
  tabManual: '手动',
  platformLabel: '平台',
  secretLabel: '密钥 (Base32)',
  otpAuthLinkLabel: 'OTP Auth 链接',
  migrationNoAccounts: '迁移数据中没有可导入的 TOTP 账号',
  errorInvalidLink: '链接格式无效',
  errorInvalidQr: '二维码内容无效',
  errorImageTooLarge: '图片不能超过 20 MB。',
  errorQrNotRecognized: '未识别到有效二维码',
  errorImageReadFailed: '无法读取图片内容',
  errorImageLoadFailed: '图片加载失败',
  errorSelectGroupFirst: '请先选择分组。',
  errorEnterSecret: '请输入密钥',
  errorInvalidLinkInput: '请输入有效的链接',
  errorImportQrFirst: '请先导入有效二维码',
  errorAddFailed: '添加失败',
  unnamed: '未命名',
  accountFallback: '账号',
  migrationFoundOne: '识别到 {count} 个账号',
  migrationFoundMany: '识别到 {count} 个账号',
  migrationSkippedChip: '跳过 {count}',
  migrationDigits: '{digits} 位',
  migrationHelp: '来自 Google Authenticator 迁移链接；「跳过」为 HOTP/MD5 或不兼容条目，已存在相同密钥的账号会自动跳过。',
  migrationMultiBatch: '这份迁移含多个批次，请分别导入其余批次。',
  allDuplicates: '所有 {count} 个账号均已存在，未重复导入',
  importedWithSkipped: '已导入 {count} 个账号，跳过 {duplicates} 个重复',
  importedCountOne: '已导入 {count} 个账号',
  importedCountMany: '已导入 {count} 个账号',
  importN: '导入 {count} 个',
  qrUploadHint: '点击选择图片、拖拽或 Ctrl+V 粘贴',

  // 分组管理
  createGroupHint: '点击右上角「+」或下方按钮新建分组',
  groupNameLabel: '分组名称',
  createGroup: '新建分组',
  renameGroupTitle: '重命名分组',
  deleteGroupTitle: '删除分组',
  groupCreated: '已创建分组「{name}」',
  groupRenamed: '分组已重命名',
  groupDeleted: '分组已删除',
  groupDeletedWithAccountsOne: '已删除分组，{count} 个账号一并删除',
  groupDeletedWithAccountsMany: '已删除分组，{count} 个账号一并删除',
  deleteGroupQuestion: '确定要删除分组 {name} 吗？',
  deleteGroupWarningOne: '组内 {count} 个账号会被一并删除，此操作无法撤销。',
  deleteGroupWarningMany: '组内 {count} 个账号会被一并删除，此操作无法撤销。',
  groupHasNoAccounts: '该分组下暂无账号。',
  accountCountOne: '{count} 个账号',
  accountCountMany: '{count} 个账号',
  noAccountsShort: '暂无账号',
  enterGroupName: '请输入分组名称。',
  groupActionsAria: '分组操作',

  // 账号图标
  chooseAccountIcon: '选择账号图标',
  chooseImage: '选择图片',
  cropIcon: '裁切图标',
  cropIconHelp: '拖动图片或使用方向键调整位置，滑动下方滑块缩放。圆形区域是图标预览。',
  cropIconZoom: '缩放',
  useIconCrop: '使用裁切结果',
  autoMatch: '自动匹配',
  currentCustomImage: '当前自定义图片',
  processingImage: '正在处理图片…',
  iconTooLarge: '图片不能超过 20 MB。',
  iconUnsupported: '仅支持 PNG、JPEG、WebP、GIF、BMP、ICO、AVIF 或 SVG 图片。',
  iconLoadFailed: '图片加载失败，请确认文件未损坏。',
  iconSizeUnknown: '无法读取图片尺寸。',
  iconTooLargeDimensions: '图片尺寸过大，请选择边长不超过 16384 像素的图片。',
  iconCanvasUnavailable: '当前环境无法处理图片。',
  iconConvertFailed: '图片无法转换，请换一张图片重试。',
  iconStillTooLarge: '图片处理后仍然过大，请换一张更简单的图片。',
} as const;

type MessageKey = keyof typeof zh;

const en: Record<MessageKey, string> = {
  cancel: 'Cancel',
  save: 'Save',
  close: 'Close',
  create: 'Create',
  delete: 'Delete',
  edit: 'Edit',
  rename: 'Rename',
  moveUp: 'Move up',
  moveDown: 'Move down',
  retry: 'Retry',
  operationFailed: 'Something went wrong. Please try again.',
  copyFailed: "Couldn't copy. Please try again.",

  backToAccounts: 'Back to accounts',
  groupManagement: 'Groups',
  newGroup: 'New group',
  addAccount: 'Add account',
  minimize: 'Minimize',
  standardPeriod: 'Standard 30-second cycle',
  remainingSeconds: '{count} seconds remaining',
  customPeriodAria: '{period}-second period, {remaining} seconds remaining',

  loadAllFailed: "Couldn't load accounts and groups",
  loadAccountsFailed: "Couldn't load accounts",
  loadGroupsFailed: "Couldn't load groups",
  noGroups: 'No groups yet',
  noGroupsHint: 'Accounts must belong to a group. Create a group before adding accounts.',
  noAccounts: 'No accounts yet',
  noAccountsInGroup: 'No accounts in this group',
  groupEmptyHint: 'No accounts in “{group}” yet',
  deleteAccountFailed: "Couldn't delete. Please try again.",
  accountUpdated: 'Account updated',
  saveFailed: "Couldn't save. Please try again.",
  copyCodeFailed: "Couldn't copy. Please try again.",
  copiedCode: 'Copied {issuer} code',
  saveAccountOrderFailed: "Couldn't save the account order",
  saveGroupOrderFailed: "Couldn't save the group order",
  accountActions: 'Account actions',
  exportAction: 'Export',
  editAction: 'Edit',
  deleteAction: 'Delete',

  editAccount: 'Edit account',
  changeIcon: 'Change icon',
  serviceName: 'Service name',
  accountLabel: 'Account',
  groupLabel: 'Group',
  enterServiceName: 'Enter a service name.',
  enterAccountName: 'Enter an account.',
  selectGroup: 'Select a group.',

  confirmDelete: 'Delete account',
  deleteAccountQuestion: 'Delete {issuer} ({account})?',

  exportAccountTitle: 'Export account',
  cannotExportAccount: "Couldn't export the account. Close this dialog and try again.",
  tabQr: 'QR code',
  tabLink: 'Link',
  tabBase32: 'Base32',
  saveImage: 'Save image',
  copyLink: 'Copy link',
  cannotGenerateQr: "Couldn't generate a QR code. Use the link or Base32 key instead.",
  copiedLabel: 'Copied {label}',
  linkLabel: 'link',
  base32KeyLabel: 'Base32 key',

  addAccountTitle: 'Add account',
  addAction: 'Add',
  tabManual: 'Manual',
  platformLabel: 'Service',
  secretLabel: 'Secret (Base32)',
  otpAuthLinkLabel: 'OTP Auth link',
  migrationNoAccounts: 'No importable TOTP accounts found in this migration data.',
  errorInvalidLink: 'Invalid link format',
  errorInvalidQr: 'Invalid QR code contents',
  errorImageTooLarge: 'The image must be under 20 MB.',
  errorQrNotRecognized: 'No valid QR code found',
  errorImageReadFailed: "Couldn't read the image",
  errorImageLoadFailed: "Couldn't load the image",
  errorSelectGroupFirst: 'Select a group first.',
  errorEnterSecret: 'Enter a secret.',
  errorInvalidLinkInput: 'Enter a valid link.',
  errorImportQrFirst: 'Import a valid QR code first.',
  errorAddFailed: "Couldn't add the account",
  unnamed: 'Unnamed',
  accountFallback: 'Account',
  migrationFoundOne: 'Found {count} account',
  migrationFoundMany: 'Found {count} accounts',
  migrationSkippedChip: 'Skipped {count}',
  migrationDigits: '{digits} digits',
  migrationHelp: 'Imported from a Google Authenticator migration link. Skipped entries are HOTP/MD5 or incompatible; accounts with the same secret are skipped automatically.',
  migrationMultiBatch: 'This migration has multiple batches. Import the remaining batches separately.',
  allDuplicates: 'All {count} accounts already exist. Nothing was imported.',
  importedWithSkipped: 'Imported {count} accounts and skipped {duplicates} duplicates',
  importedCountOne: 'Imported {count} account',
  importedCountMany: 'Imported {count} accounts',
  importN: 'Import {count}',
  qrUploadHint: 'Click to choose an image, drop one, or press Ctrl+V',

  createGroupHint: 'Click “+” above or the button below to create a group',
  groupNameLabel: 'Group name',
  createGroup: 'Create group',
  renameGroupTitle: 'Rename group',
  deleteGroupTitle: 'Delete group',
  groupCreated: 'Created group “{name}”',
  groupRenamed: 'Group renamed',
  groupDeleted: 'Group deleted',
  groupDeletedWithAccountsOne: 'Group deleted along with {count} account',
  groupDeletedWithAccountsMany: 'Group deleted along with {count} accounts',
  deleteGroupQuestion: 'Delete group {name}?',
  deleteGroupWarningOne: '{count} account in this group will also be deleted. This cannot be undone.',
  deleteGroupWarningMany: '{count} accounts in this group will also be deleted. This cannot be undone.',
  groupHasNoAccounts: 'This group has no accounts.',
  accountCountOne: '{count} account',
  accountCountMany: '{count} accounts',
  noAccountsShort: 'No accounts',
  enterGroupName: 'Enter a group name.',
  groupActionsAria: 'Group actions',

  chooseAccountIcon: 'Choose account icon',
  chooseImage: 'Choose image',
  cropIcon: 'Crop icon',
  cropIconHelp: 'Drag the image or use the arrow keys to position it. Use the slider to zoom. The circle previews the icon.',
  cropIconZoom: 'Zoom',
  useIconCrop: 'Use crop',
  autoMatch: 'Auto',
  currentCustomImage: 'Current custom image',
  processingImage: 'Processing image…',
  iconTooLarge: 'The image must be under 20 MB.',
  iconUnsupported: 'Use a PNG, JPEG, WebP, GIF, BMP, ICO, AVIF or SVG image.',
  iconLoadFailed: "Couldn't load the image. Make sure the file isn't corrupted.",
  iconSizeUnknown: "Couldn't read the image dimensions.",
  iconTooLargeDimensions: 'The image is too large. Choose one under 16,384 px per side.',
  iconCanvasUnavailable: 'Image processing is not available here.',
  iconConvertFailed: "Couldn't convert the image. Try another one.",
  iconStillTooLarge: 'The processed image is still too large. Try a simpler image.',
};

export type Vars = Record<string, string | number>;

const messages: Record<Language, Record<MessageKey, string>> = { zh, en };

const collator = new Intl.Collator(LOCALE, { sensitivity: 'base', numeric: true });

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}

export function t(key: MessageKey, vars?: Vars): string {
  return fill(messages[LANGUAGE][key] ?? messages.zh[key] ?? key, vars);
}

/** 英文按数量选择单复数模板；中文两个模板相同。 */
export function plural(
  count: number,
  one: string,
  many: string,
  vars?: Vars,
): string {
  return fill(LANGUAGE === 'en' && count === 1 ? one : many, { count, ...vars });
}

/** 按当前界面语言排序（中文使用拼音顺序）。 */
export function compareLocalized(a: string, b: string): number {
  return collator.compare(a, b);
}

export function localizeDocument(): void {
  document.documentElement.lang = IS_CHINESE ? 'zh-CN' : 'en';
}
