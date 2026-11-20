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
import jsQR from 'jsqr';
import { AddAccountParams, Group, MigrationParseResult, ParsedUriData } from '../types';
import { formatError } from '../utils/errors';

interface AddAccountModalProps {
  isOpen: boolean;
  groups: Group[];
  defaultGroupId?: string;
  onClose: () => void;
  onAdd: (params: AddAccountParams) => Promise<void>;
}

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  isOpen,
  groups,
  defaultGroupId,
  onClose,
  onAdd,
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
  const uriRequestRef = useRef(0);

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
    setGroupId(preferred);
  }, [isOpen, defaultGroupId, groups]);

  const resetForm = () => {
    setIssuer('');
    setAccount('');
    setSecret('');
    setUri('');
    setUriParsed(null);
    setMigration(null);
    setQrPreviewUrl(null);
    setQrParsed(null);
    setErrorMsg(null);
  };

  const handleUriChange = async (val: string) => {
    setUri(val);
    setErrorMsg(null);
    setUriParsed(null);
    setMigration(null);

    const trimmed = val.trim();
    if (!trimmed) return;

    const requestId = ++uriRequestRef.current;
    try {
      if (trimmed.toLowerCase().startsWith('otpauth-migration://')) {
        const parsed = await window.authenticatorAPI.parseMigration(trimmed);
        if (requestId !== uriRequestRef.current) return;
        if (parsed.accounts.length === 0) {
          setErrorMsg(parsed.skipped > 0 ? '链接中没有可导入的 TOTP 账号' : '链接中没有账号');
          return;
        }
        setMigration(parsed);
        return;
      }

      const parsed = await window.authenticatorAPI.parseUri(trimmed);
      if (requestId !== uriRequestRef.current) return;
      setUriParsed(parsed);
    } catch {
      if (requestId !== uriRequestRef.current) return;
      setUriParsed(null);
      setErrorMsg('链接格式无效');
    }
  };

  const decodeQrFromFile = (file: File) => {
    setErrorMsg(null);
    setQrParsed(null);
    setMigration(null);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setQrPreviewUrl(dataUrl);

      const img = new window.Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setErrorMsg('无法读取图片画布');
          return;
        }

        // Fill white backdrop so transparent QR PNGs decode cleanly
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (!code || !code.data) {
          setErrorMsg('未识别到有效二维码');
          return;
        }

        try {
          const raw = code.data.trim();
          if (raw.toLowerCase().startsWith('otpauth-migration://')) {
            const parsed = await window.authenticatorAPI.parseMigration(raw);
            if (parsed.accounts.length === 0) {
              setErrorMsg('二维码中没有可导入的 TOTP 账号');
              return;
            }
            setMigration(parsed);
          } else {
            const parsed = await window.authenticatorAPI.parseUri(raw);
            setQrParsed(parsed);
          }
        } catch {
          setErrorMsg('二维码内容不是有效的 otpauth 链接');
        }
      };
      img.onerror = () => setErrorMsg('图片加载失败');
      img.src = dataUrl;
    };
    reader.onerror = () => setErrorMsg('文件读取失败');
    reader.readAsDataURL(file);
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
    let added = 0;
    const failed: string[] = [];

    for (const item of payload.accounts) {
      try {
        await onAdd({
          issuer: item.issuer || '未命名',
          account: item.account || '账号',
          secret: item.secret,
          digits: item.digits,
          period: item.period,
          algorithm: item.algorithm,
          groupId,
        });
        added += 1;
      } catch {
        failed.push(item.account || item.issuer || '未命名');
      }
    }

    if (added === 0) {
      throw new Error('导入失败，请检查链接内容');
    }

    addToast({
      title: failed.length ? `已导入 ${added} 个，${failed.length} 个失败` : `已导入 ${added} 个账号`,
      color: failed.length ? 'warning' : 'success',
      timeout: 1_800,
    });
  };

  const handleSubmit = async () => {
    setErrorMsg(null);

    if (!groupId) {
      setErrorMsg('请先选择分组。');
      return;
    }

    setLoading(true);

    try {
      if (activeTab === 'manual') {
        const cleanSecret = secret.trim().replace(/[\s-]/g, '').toUpperCase();
        if (!cleanSecret) {
          throw new Error('请输入密钥');
        }

        if (window.authenticatorAPI?.validateSecret) {
          await window.authenticatorAPI.validateSecret(cleanSecret);
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

      resetForm();
      onClose();
    } catch (err: any) {
      setErrorMsg(formatError(err, '添加失败'));
    } finally {
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
          来自 Google Authenticator 迁移链接；「跳过」为 HOTP/MD5 或不兼容条目。
        </p>
      </CardBody>
    </Card>
  ) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
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
                  setActiveTab(key as string);
                  setErrorMsg(null);
                  setUriParsed(null);
                  setQrParsed(null);
                  setMigration(null);
                }}
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
                    value={issuer}
                    onValueChange={setIssuer}
                  />

                  <Input
                    label="账号"
                    size="sm"
                    variant="bordered"
                    value={account}
                    onValueChange={setAccount}
                  />

                  <Input
                    label="密钥 (Base32)"
                    size="sm"
                    variant="bordered"
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
              <Button size="sm" variant="light" onPress={modalClose}>
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
