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
import { plural, t } from '../i18n';
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
          setErrorMsg(t('migrationNoAccounts'));
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
        setErrorMsg(formatError(error, source === 'uri' ? t('errorInvalidLink') : t('errorInvalidQr')));
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
      setErrorMsg(t('errorImageTooLarge'));
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
        else setErrorMsg(t('errorQrNotRecognized'));
      } catch {
        if (requestId === parseRequestRef.current) setErrorMsg(t('errorImageReadFailed'));
      }
    };
    img.onerror = () => {
      if (requestId !== parseRequestRef.current) return;
      clearQrPreview();
      setErrorMsg(t('errorImageLoadFailed'));
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
        issuer: item.issuer || t('unnamed'),
        account: item.account || t('accountFallback'),
        secret: item.secret,
        digits: item.digits,
        period: item.period,
        algorithm: item.algorithm,
      })),
    });

    if (result.added === 0 && result.duplicates > 0) {
      addToast({
        title: t('allDuplicates', { count: result.duplicates }),
        color: 'warning',
        timeout: 1_800,
      });
      return;
    }

    addToast({
      title:
        result.duplicates > 0
          ? t('importedWithSkipped', { count: result.added, duplicates: result.duplicates })
          : plural(result.added, t('importedCountOne'), t('importedCountMany'), { count: result.added }),
      color: 'success',
      timeout: 1_800,
    });
  };

  const handleSubmit = async () => {
    if (submitting.current) return;
    setErrorMsg(null);

    if (!groupId) {
      setErrorMsg(t('errorSelectGroupFirst'));
      return;
    }

    submitting.current = true;
    setLoading(true);

    try {
      if (activeTab === 'manual') {
        const cleanSecret = secret.trim().replace(/[\s-]/g, '').toUpperCase();
        if (!cleanSecret) {
          throw new Error(t('errorEnterSecret'));
        }

        await onAdd({
          issuer: issuer.trim() || t('unnamed'),
          account: account.trim() || t('accountFallback'),
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
            issuer: uriParsed.issuer || t('unnamed'),
            account: uriParsed.account || t('accountFallback'),
            secret: uriParsed.secret,
            digits: uriParsed.digits,
            period: uriParsed.period,
            algorithm: uriParsed.algorithm,
            groupId,
          });
        } else {
          throw new Error(t('errorInvalidLinkInput'));
        }
      } else {
        if (migration) {
          await importMigration(migration);
        } else if (qrParsed) {
          await onAdd({
            issuer: qrParsed.issuer || t('unnamed'),
            account: qrParsed.account || t('accountFallback'),
            secret: qrParsed.secret,
            digits: qrParsed.digits,
            period: qrParsed.period,
            algorithm: qrParsed.algorithm,
            groupId,
          });
        } else {
          throw new Error(t('errorImportQrFirst'));
        }
      }

      await onAdded();
      resetForm();
      onClose();
    } catch (err) {
      setErrorMsg(formatError(err, t('errorAddFailed')));
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
          <span>
            {plural(migration.accounts.length, t('migrationFoundOne'), t('migrationFoundMany'), {
              count: migration.accounts.length,
            })}
          </span>
          {migration.skipped > 0 && (
            <Chip size="sm" variant="flat" color="warning" className="h-5 text-[10px]">
              {t('migrationSkippedChip', { count: migration.skipped })}
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
                  {item.issuer || t('unnamed')}
                </div>
                <div className="truncate text-[11px] text-default-500">{item.account || t('accountFallback')}</div>
              </div>
              <Chip size="sm" variant="flat" className="h-5 flex-shrink-0 text-[10px]">
                {t('migrationDigits', { digits: item.digits })} · {item.algorithm}
              </Chip>
            </div>
          ))}
        </div>
        <p className="text-[11px] leading-4 text-default-500">
          {t('migrationHelp')}
          {migration.batchSize > 1 && ` ${t('migrationMultiBatch')}`}
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
              {t('addAccountTitle')}
            </ModalHeader>

            <ModalBody className="py-2 flex flex-col gap-3">
              <Select
                size="sm"
                variant="bordered"
                label={t('groupLabel')}
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
                      <span>{t('tabManual')}</span>
                    </div>
                  }
                />
                <Tab
                  key="uri"
                  title={
                    <div className="flex items-center gap-1 text-xs">
                      <Link size={12} />
                      <span>{t('tabLink')}</span>
                    </div>
                  }
                />
                <Tab
                  key="qr"
                  title={
                    <div className="flex items-center gap-1 text-xs">
                      <QrCode size={12} />
                      <span>{t('tabQr')}</span>
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
                    label={t('platformLabel')}
                    size="sm"
                    variant="bordered"
                    isDisabled={loading}
                    value={issuer}
                    onValueChange={setIssuer}
                  />

                  <Input
                    label={t('accountLabel')}
                    size="sm"
                    variant="bordered"
                    isDisabled={loading}
                    value={account}
                    onValueChange={setAccount}
                  />

                  <Input
                    label={t('secretLabel')}
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
                    label={t('otpAuthLinkLabel')}
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
                          <span>{t('platformLabel')}</span>
                          <Chip size="sm" variant="flat" color="primary" className="h-5 text-xs">
                            {uriParsed.issuer || '-'}
                          </Chip>
                        </div>
                        <div className="flex justify-between items-center text-default-600">
                          <span>{t('accountLabel')}</span>
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
                        {t('qrUploadHint')}
                      </span>
                    </CardBody>
                  </Card>

                  {qrParsed && (
                    <Card shadow="none" className="border border-default-200 bg-default-50">
                      <CardBody className="p-2.5 flex flex-col gap-1 text-xs">
                        <div className="flex justify-between items-center text-default-600">
                          <span>{t('platformLabel')}</span>
                          <Chip size="sm" variant="flat" color="primary" className="h-5 text-xs">
                            {qrParsed.issuer || '-'}
                          </Chip>
                        </div>
                        <div className="flex justify-between items-center text-default-600">
                          <span>{t('accountLabel')}</span>
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
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                color="primary"
                isLoading={loading}
                isDisabled={!canSubmit}
                onPress={handleSubmit}
              >
                {migration ? t('importN', { count: migration.accounts.length }) : t('addAction')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
