export interface Account {
  id: string;
  issuer: string;
  account: string;
  code: string;
  remainingSeconds: number;
  /** Exclusive expiry in Unix seconds. */
  validUntil: number;
  period: number;
  digits: number;
  algorithm: string;
  groupId: string;
  /** 空=自动匹配；si:<slug>=内置图标；data:image/png;base64=自定义图片。 */
  icon: string;
  createdAt: number;
}

export interface Group {
  id: string;
  name: string;
  createdAt: number;
}

export interface AddAccountParams {
  issuer: string;
  account: string;
  secret: string;
  digits?: number;
  period?: number;
  algorithm?: string;
  /** 账号必须加入一个已存在的分组。 */
  groupId: string;
}

export interface BatchAccountItem {
  issuer: string;
  account: string;
  secret: string;
  digits?: number;
  period?: number;
  algorithm?: string;
}

export interface AddAccountsBatchParams {
  groupId: string;
  accounts: BatchAccountItem[];
}

export interface BatchImportResult {
  added: number;
  duplicates: number;
  accounts: Account[];
}

export interface ParsedUriData {
  issuer: string;
  account: string;
  secret: string;
  digits: number;
  period: number;
  algorithm: string;
}

/** Google Authenticator 迁移链接中的单个账号。 */
export interface MigrationAccount {
  issuer: string;
  account: string;
  secret: string;
  digits: number;
  period: number;
  algorithm: string;
}

export interface MigrationParseResult {
  accounts: MigrationAccount[];
  /** 无法导入的条目数（HOTP / MD5 / 损坏）。 */
  skipped: number;
  batchSize: number;
  batchIndex: number;
}

export interface ExportAccountData {
  id: string;
  issuer: string;
  account: string;
  secret: string;
  uri: string;
  digits: number;
  period: number;
  algorithm: string;
}

export interface AuthenticatorAPI {
  /** 主进程 app.getLocale() 检测到的系统默认语言。 */
  locale: string;
  listAccounts: () => Promise<Account[]>;
  addAccount: (params: AddAccountParams) => Promise<Account>;
  addAccountsBatch: (params: AddAccountsBatchParams) => Promise<BatchImportResult>;
  deleteAccount: (id: string) => Promise<boolean>;
  updateAccount: (params: {
    id: string;
    issuer: string;
    account: string;
    groupId: string;
    icon?: string;
  }) => Promise<Account>;
  parseUri: (uri: string) => Promise<ParsedUriData>;
  parseMigration: (uri: string) => Promise<MigrationParseResult>;
  validateSecret: (secret: string) => Promise<{ valid: boolean }>;
  listGroups: () => Promise<Group[]>;
  addGroup: (name: string) => Promise<Group>;
  renameGroup: (id: string, name: string) => Promise<Group>;
  deleteGroup: (id: string) => Promise<{ deleted: boolean; removedAccounts: number }>;
  reorderGroups: (ids: string[]) => Promise<boolean>;
  reorderAccounts: (ids: string[]) => Promise<boolean>;
  exportAccount: (id: string) => Promise<ExportAccountData>;
  copyAccountCode: (id: string) => Promise<boolean>;
  copyToClipboard: (text: string) => Promise<boolean> | boolean;
  minimize: () => Promise<void>;
  maximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange?: (callback: (isMax: boolean) => void) => () => void;
}

declare global {
  interface Window {
    authenticatorAPI: AuthenticatorAPI;
  }
}
