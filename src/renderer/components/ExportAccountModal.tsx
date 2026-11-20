import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Tabs,
  Tab,
  Image,
  Snippet,
  Textarea,
  Spinner,
  addToast,
} from '@heroui/react';
import { QrCode, Link, Key, Copy, Download } from 'lucide-react';
import QRCode from 'qrcode';
import { ExportAccountData } from '../types';

interface ExportAccountModalProps {
  accountId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportAccountModal: React.FC<ExportAccountModalProps> = ({
  accountId,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<string>('qr');
  const [exportData, setExportData] = useState<ExportAccountData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !accountId) {
      setExportData(null);
      setQrDataUrl('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    window.authenticatorAPI
      ?.exportAccount(accountId)
      .then(async (data) => {
        if (cancelled) return;
        setExportData(data);
        const url = await QRCode.toDataURL(data.uri, {
          width: 480,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#11181c',
            light: '#ffffff',
          },
        });
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Export failed:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, accountId]);

  const handleCopyText = (text: string, label: string) => {
    if (window.authenticatorAPI?.copyToClipboard) {
      window.authenticatorAPI.copyToClipboard(text);
    } else {
      navigator.clipboard.writeText(text);
    }
    addToast({
      title: `已复制${label}`,
      color: 'success',
      timeout: 1500,
    });
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl || !exportData) return;
    const filename = `${exportData.issuer}-${exportData.account}-2fa.png`;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = filename;
    link.click();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      placement="center"
      backdrop="opaque"
      classNames={{
        base: 'bg-content1 border border-default-200',
      }}
    >
      <ModalContent>
        {(modalClose) => (
          <>
            <ModalHeader className="pb-1 flex flex-col gap-0.5">
              <span className="text-sm font-bold text-foreground">
                导出账号
              </span>
              {exportData && (
                <span className="text-xs font-normal text-default-600">
                  {exportData.issuer} · {exportData.account}
                </span>
              )}
            </ModalHeader>

            <ModalBody className="py-2 flex flex-col gap-3">
              {loading || !exportData ? (
                <div className="flex items-center justify-center h-44">
                  <Spinner size="md" color="primary" />
                </div>
              ) : (
                <>
                  <Tabs
                    selectedKey={activeTab}
                    onSelectionChange={(key) => setActiveTab(key as string)}
                    color="primary"
                    size="sm"
                    variant="bordered"
                    fullWidth
                  >
                    <Tab
                      key="qr"
                      title={
                        <div className="flex items-center gap-1 text-xs">
                          <QrCode size={12} />
                          <span>二维码</span>
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
                      key="base32"
                      title={
                        <div className="flex items-center gap-1 text-xs">
                          <Key size={12} />
                          <span>Base32</span>
                        </div>
                      }
                    />
                  </Tabs>

                  {activeTab === 'qr' && (
                    <div className="flex flex-col items-center gap-3 py-2">
                      {qrDataUrl && (
                        <Image
                          src={qrDataUrl}
                          alt="2FA QR Code"
                          width={180}
                          height={180}
                          radius="md"
                          className="border border-default-200 bg-white p-1.5"
                        />
                      )}
                      <Button
                        size="sm"
                        color="primary"
                        variant="flat"
                        startContent={<Download size={14} />}
                        onPress={handleDownloadQr}
                      >
                        保存图片
                      </Button>
                    </div>
                  )}

                  {activeTab === 'uri' && (
                    <div className="flex flex-col gap-2.5 py-1">
                      <Textarea
                        isReadOnly
                        variant="bordered"
                        minRows={3}
                        maxRows={4}
                        value={exportData.uri}
                        classNames={{
                          input: 'font-mono text-xs',
                        }}
                      />
                      <Button
                        size="sm"
                        color="primary"
                        variant="flat"
                        startContent={<Copy size={14} />}
                        onPress={() => handleCopyText(exportData.uri, '链接')}
                      >
                        复制链接
                      </Button>
                    </div>
                  )}

                  {activeTab === 'base32' && (
                    <div className="flex flex-col gap-2.5 py-2">
                      <Snippet
                        hideSymbol
                        fullWidth
                        variant="flat"
                        color="primary"
                        codeString={exportData.secret}
                        onCopy={() => handleCopyText(exportData.secret, 'Base32 密钥')}
                        classNames={{
                          pre: 'font-mono text-sm font-semibold tracking-wide break-all whitespace-pre-wrap',
                        }}
                      >
                        {exportData.secret}
                      </Snippet>
                    </div>
                  )}
                </>
              )}
            </ModalBody>

            <ModalFooter className="pt-2 pb-3">
              <Button size="sm" variant="light" onPress={modalClose}>
                关闭
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
