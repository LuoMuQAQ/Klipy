import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Tabs,
  Tab,
  Alert,
  Card,
  CardBody,
  Chip,
  Image,
  Select,
  SelectItem,
  addToast,
} from '@heroui/react';
import { Key, Link, QrCode, Upload } from 'lucide-react';
import { AddAccountParams, Group, MigrationParseResult, ParsedUriData } from '../types';
import { formatError } from '../utils/errors';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_QR_EDGE = 2048;

interface AddAccountModalProps {
  isOpen: boolean;
  groups: Group[];
  defaultGroupId?: string;
  onClose: () => void;
  onAdd: (params: AddAccountParams) => Promise<void>;
  onAdded: () => Promise<void>;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  groups,
  defaultGroupId,
  onClose,
  onAdd,
  onAdded,
}) => {
  const [activeTab, setActiveTab] = useState<string>('manual');
  const [groupId, setGroupId] = useState(defaultGroupId ?? '');

  // Manual tab form state
  const [issuer, setIssuer] = useState('');
  const [account, setAccount] = useState('');
  const [secret, setSecret] = useState('');

  // URI tab state
  const [uri, setUri] = useState('');
  const [uriParsed, setUriParsed] = useState<ParsedUriData | null>(null);

  // Google Authenticator 迁移链接（otpauth-migration://）解析结果，URI 与二维码两个页签共用
  const [migration, setMigration] = useState<MigrationParseResult | null>(null);
  const parseRequestRef = useRef(0);
  const uriTimer = useRef<number>();
  const qrUrlRef = useRef<string>();
  const submitting = useRef(false);

  // QR tab state
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [qrParsed, setQrParsed] = useState<ParsedUriData | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 账号必须归属分组：每次打开都落在当前分组（或第一个分组）上。
  useEffect(() => {
    if (!isOpen) return;
    const preferred =
      defaultGroupId && groups.some((group) => group.id === defaultGroupId)
        ? defaultGroupId
        : groups[0]?.id ?? '';
    setGroupId((current) => groups.some((group) => group.id === current) ? current : preferred);
  }, [isOpen, defaultGroupId, groups]);

  useEffect(() => () => {
    parseRequestRef.current += 1;
    window.clearTimeout(uriTimer.current);
    if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current);
  }, []);

  const clearQrPreview = () => {
    if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current);
    qrUrlRef.current = undefined;
    setQrPreviewUrl(null);
  };

  const resetImport = () => {
    parseRequestRef.current += 1;
    window.clearTimeout(uriTimer.current);
    setUri('');
    setUriParsed(null);
    setMigration(null);
    clearQrPreview();
    setQrParsed(null);
    setErrorMsg(null);
  };

  const resetForm = () => {
    resetImport();
    setGroupId('');
    setIssuer('');
    setAccount('');
    setSecret('');
  };

  const parseImport = async (raw: string, source: 'uri' | 'qr', requestId: number) => {
    try {
      if (raw.toLowerCase().startsWith('otpauth-migration://')) {
        const parsed = await window.authenticatorAPI.parseMigration(raw);
        if (requestId !== parseRequestRef.current) return;
        if (parsed.accounts.length === 0) {
          setErrorMsg('迁移数据中没有可导入的 TOTP 账号');
          return;
        }
        setMigration(parsed);
      } else {
        const parsed = await window.authenticatorAPI.parseUri(raw);
        if (requestId !== parseRequestRef.current) return;
        if (source === 'uri') setUriParsed(parsed);
        else setQrParsed(parsed);
      }
    } catch (error) {
      if (requestId === parseRequestRef.current) {
        setErrorMsg(formatError(error, source === 'uri' ? '链接格式无效' : '二维码内容无效'));
      }
    }
  };

  const handleUriChange = (val: string) => {
    const requestId = ++parseRequestRef.current;
    window.clearTimeout(uriTimer.current);
    setUri(val);
    setErrorMsg(null);
    setUriParsed(null);
    setMigration(null);
    const trimmed = val.trim();
    if (trimmed) uriTimer.current = window.setTimeout(() => void parseImport(trimmed, 'uri', requestId), 180);
  };

  const decodeQrFromFile = (file: File) => {
    if (submitting.current) return;
    const requestId = ++parseRequestRef.current;
    setErrorMsg(null);
    setQrParsed(null);
    setMigration(null);
    clearQrPreview();
    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMsg('图片不能超过 20 MB。');
      return;
    }

    const url = URL.createObjectURL(file);
    qrUrlRef.current = url;
    const img = new window.Image();
    img.onload = async () => {
      if (requestId !== parseRequestRef.current) return;
      setQrPreviewUrl(url);
      try {
        const { default: jsQR } = await import('jsqr');
        if (requestId !== parseRequestRef.current) return;
        const scale = Math.min(1, MAX_QR_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error();
        // Fill a white backdrop so transparent QR PNGs decode cleanly.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const raw = jsQR(data.data, data.width, data.height)?.data.trim();
        if (raw) void parseImport(raw, 'qr', requestId);
        else setErrorMsg('未识别到有效二维码');
      } catch {
        if (requestId === parseRequestRef.current) setErrorMsg('无法读取图片内容');
      }
    };
    img.onerror = () => {
      if (requestId !== parseRequestRef.current) return;
      clearQrPreview();
      setErrorMsg('图片加载失败');
    };
    img.src = url;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) decodeQrFromFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      decodeQrFromFile(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (activeTab !== 'qr') return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          decodeQrFromFile(file);
          break;
        }
      }
    }
  };

  const importMigration = async (payload: MigrationParseResult) => {
    const result = await window.authenticatorAPI.addAccountsBatch({
      groupId,
      accounts: payload.accounts.map((item) => ({
        issuer: item.issuer || '未命名',
        account: item.account || '账号',
        secret: item.secret,
        digits: item.digits,
        period: item.period,
        algorithm: item.algorithm,
      })),
    });

    if (result.added === 0 && result.duplicates > 0) {
      addToast({
        title: `所有 ${result.duplicates} 个账号均已存在，未重复导入`,
        color: 'warning',
        timeout: 1_800,
      });
      return;
    }

    addToast({
      title:
        result.duplicates > 0
          ? `已导入 ${result.added} 个账号，跳过 ${result.duplicates} 个重复`
          : `已导入 ${result.added} 个账号`,
      color: 'success',
      timeout: 1_800,
    });
  };

  const handleSubmit = async () => {
    if (submitting.current) return;
    setErrorMsg(null);

    if (!groupId) {
      setErrorMsg('请先选择分组。');
      return;
    }

    submitting.current = true;
    setLoading(true);

    try {
      if (activeTab === 'manual') {
        const cleanSecret = secret.trim().replace(/[\s-]/g, '').toUpperCase();
        if (!cleanSecret) {
          throw new Error('请输入密钥');
        }

        await onAdd({
          issuer: issuer.trim() || '未命名',
          account: account.trim() || '账号',
          secret: cleanSecret,
          digits: 6,
          period: 30,
          algorithm: 'SHA1',
          groupId,
        });
      } else if (activeTab === 'uri') {
        if (migration) {
          await importMigration(migration);
        } else if (uriParsed) {
          await onAdd({
            issuer: uriParsed.issuer || '未命名',
            account: uriParsed.account || '账号',
            secret: uriParsed.secret,
            digits: uriParsed.digits,
            period: uriParsed.period,
            algorithm: uriParsed.algorithm,
            groupId,
          });
        } else {
          throw new Error('请输入有效的链接');
        }
      } else {
        if (migration) {
          await importMigration(migration);
        } else if (qrParsed) {
          await onAdd({
            issuer: qrParsed.issuer || '未命名',
            account: qrParsed.account || '账号',
            secret: qrParsed.secret,
            digits: qrParsed.digits,
            period: qrParsed.period,
            algorithm: qrParsed.algorithm,
            groupId,
          });
        } else {
          throw new Error('请先导入有效二维码');
        }
      }

      await onAdded();
      resetForm();
      onClose();
    } catch (err) {
      setErrorMsg(formatError(err, '添加失败'));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const canSubmit =
    Boolean(groupId) &&
    (activeTab === 'manual'
      ? Boolean(secret.trim())
      : activeTab === 'uri'
      ? Boolean(uriParsed || migration)
      : Boolean(qrParsed || migration));

  const migrationCard = migration ? (
    <Card shadow="none" className="border border-default-200 bg-content1">
      <CardBody className="flex flex-col gap-2 p-2.5">
        <div className="flex items-center justify-between text-xs text-default-600">
          <span>识别到 {migration.accounts.length} 个账号</span>
          {migration.skipped > 0 && (
            <Chip size="sm" variant="flat" color="warning" className="h-5 text-[10px]">
              跳过 {migration.skipped}
            </Chip>
          )}
        </div>
        <div className="flex max-h-36 flex-col gap-1.5 overflow-y-auto">
          {migration.accounts.map((item, index) => (
            <div
              key={`${item.account}-${index}`}
              className="flex items-center justify-between gap-2 rounded-medium bg-default-50 px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">
                  {item.issuer || '未命名'}
                </div>
                <div className="truncate text-[11px] text-default-500">{item.account || '账号'}</div>
              </div>
              <Chip size="sm" variant="flat" className="h-5 flex-shrink-0 text-[10px]">
                {item.digits} 位 · {item.algorithm}
              </Chip>
            </div>
          ))}
        </div>
        <p className="text-[11px] leading-4 text-default-500">
          来自 Google Authenticator 迁移链接；「跳过」为 HOTP/MD5 或不兼容条目，已存在相同密钥的账号会自动跳过。
          {migration.batchSize > 1 && '这份迁移含多个批次，请分别导入其余批次。'}
        </p>
      </CardBody>
    </Card>
  ) : null;

  return (
    <Modal
      isOpen={isOpen}
      isDismissable={!loading}
      isKeyboardDismissDisabled={loading}
      onClose={() => {
        if (submitting.current) return;
        resetForm();
        onClose();
      }}
      size="sm"
      placement="center"
      backdrop="opaque"
      classNames={{
        base: 'bg-content1 border border-default-200',
      }}
    >
      <ModalContent onPaste={handlePaste}>
        {(modalClose) => (
          <>
            <ModalHeader className="pb-1 text-sm font-bold text-foreground">
              添加账号
            </ModalHeader>

            <ModalBody className="py-2 flex flex-col gap-3">
              <Select
                size="sm"
                variant="bordered"
                label="分组"
                isRequired
                disallowEmptySelection
                items={groups}
                selectedKeys={groupId ? [groupId] : []}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0];
                  setGroupId(value ? String(value) : '');
                }}
                isDisabled={loading || groups.length === 0}
              >
                {(item) => <SelectItem key={item.id}>{item.name}</SelectItem>}
              </Select>

              <Tabs
                selectedKey={activeTab}
                onSelectionChange={(key) => {
                  if (submitting.current || key === activeTab) return;
                  resetImport();
                  setActiveTab(String(key));
                }}
                isDisabled={loading}
                color="primary"
                size="sm"
                variant="bordered"
                fullWidth
              >
                <Tab
                  key="manual"
                  title={
                    <div className="flex items-center gap-1 text-xs">
                      <Key size={12} />
                      <span>手动</span>
                    </div>
                  }
                />
                <Tab
                  key="uri"
                  title={
                    <div className="flex items-center gap-1 text-xs">
                      <Link size={12} />
                      <span>链接</span>
                    </div>
                  }
                />
                <Tab
                  key="qr"
                  title={
                    <div className="flex items-center gap-1 text-xs">
                      <QrCode size={12} />
                      <span>二维码</span>
                    </div>
                  }
                />
              </Tabs>

              {errorMsg && (
                <Alert
                  color="danger"
                  variant="faded"
                  title={errorMsg}
                />
              )}

              {activeTab === 'manual' && (
                <div className="flex flex-col gap-2.5">
                  <Input
                    label="平台"
                    size="sm"
                    variant="bordered"
                    isDisabled={loading}
                    value={issuer}
                    onValueChange={setIssuer}
                  />

                  <Input
                    label="账号"
                    size="sm"
                    variant="bordered"
                    isDisabled={loading}
                    value={account}
                    onValueChange={setAccount}
                  />

                  <Input
                    label="密钥 (Base32)"
                    size="sm"
                    variant="bordered"
                    isDisabled={loading}
                    value={secret}
                    onValueChange={(val) => {
                      setSecret(val.toUpperCase());
                      setErrorMsg(null);
                    }}
                  />
                </div>
              )}

              {activeTab === 'uri' && (
                <div className="flex flex-col gap-2.5">
                  <Input
                    label="OTP Auth 链接"
                    size="sm"
                    variant="bordered"
                    isDisabled={loading}
                    value={uri}
                    onValueChange={handleUriChange}
                  />

                  {uriParsed && (
                    <Card shadow="none" className="border border-default-200 bg-default-50">
                      <CardBody className="p-2.5 flex flex-col gap-1 text-xs">
                        <div className="flex justify-between items-center text-default-600">
                          <span>平台</span>
                          <Chip size="sm" variant="flat" color="primary" className="h-5 text-xs">
                            {uriParsed.issuer || '-'}
                          </Chip>
                        </div>
                        <div className="flex justify-between items-center text-default-600">
                          <span>账号</span>
                          <span className="font-medium text-foreground">{uriParsed.account || '-'}</span>
                        </div>
                      </CardBody>
                    </Card>
                  )}
                  {migrationCard}
                </div>
              )}

              {activeTab === 'qr' && (
                <div
                  className="flex flex-col gap-2.5"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  <Card
                    isPressable
                    isDisabled={loading}
                    disableRipple
                    shadow="none"
                    onPress={() => fileInputRef.current?.click()}
                    className="border border-dashed border-default-300 bg-default-50 hover:bg-default-100 data-[pressed=true]:scale-100 transition-colors"
                  >
                    <CardBody className="py-5 flex flex-col items-center justify-center gap-2 text-center">
                      {qrPreviewUrl ? (
                        <Image
                          src={qrPreviewUrl}
                          alt="QR Preview"
                          width={96}
                          height={96}
                          radius="md"
                          className="object-contain border border-default-200 bg-white p-1"
                        />
                      ) : (
                        <Upload size={24} className="text-default-400" />
                      )}
                      <span className="text-xs text-default-600">
                        点击选择图片、拖拽或 Ctrl+V 粘贴
                      </span>
                    </CardBody>
                  </Card>

                  {qrParsed && (
                    <Card shadow="none" className="border border-default-200 bg-default-50">
                      <CardBody className="p-2.5 flex flex-col gap-1 text-xs">
                        <div className="flex justify-between items-center text-default-600">
                          <span>平台</span>
                          <Chip size="sm" variant="flat" color="primary" className="h-5 text-xs">
                            {qrParsed.issuer || '-'}
                          </Chip>
                        </div>
                        <div className="flex justify-between items-center text-default-600">
                          <span>账号</span>
                          <span className="font-medium text-foreground">{qrParsed.account || '-'}</span>
                        </div>
                      </CardBody>
                    </Card>
                  )}
                  {migrationCard}
                </div>
              )}
            </ModalBody>

            <ModalFooter className="pt-2 pb-3">
              <Button size="sm" variant="light" onPress={modalClose} isDisabled={loading}>
                取消
              </Button>
              <Button
                size="sm"
                color="primary"
                isLoading={loading}
                isDisabled={!canSubmit}
                onPress={handleSubmit}
              >
                {migration ? `导入 ${migration.accounts.length} 个` : '添加'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
