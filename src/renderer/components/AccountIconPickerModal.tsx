import { useRef, useState } from 'react';
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Spinner,
} from '@heroui/react';
import { Sparkles, Upload } from 'lucide-react';
import { BRAND_LIBRARY, brandIconUrl } from '../brandIcons';
import { t } from '../i18n';
import { ICON_ACCEPT, loadAccountIcon } from '../utils/accountIcon';
import { AccountIconCrop } from './AccountIconCrop';

interface AccountIconPickerModalProps {
  isOpen: boolean;
  value: string;
  onClose: () => void;
  onChange: (icon: string) => void;
}

/** 独立的图标选择弹窗：顶部选择图片按钮固定，下方圆形图标区域独立滚动。 */
export function AccountIconPickerModal({
  isOpen,
  value,
  onClose,
  onChange,
}: AccountIconPickerModalProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedSlug = value.startsWith('si:') ? value.slice(3) : '';
  const isCustom = value.startsWith('data:image/');

  const close = () => {
    setImage(null);
    setError('');
    onClose();
  };

  const select = (icon: string) => {
    onChange(icon);
    close();
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file || processing) return;
    setProcessing(true);
    setError('');
    try {
      setImage(await loadAccountIcon(file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('iconConvertFailed'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={image ? () => setImage(null) : close}
      size="sm"
      placement="center"
      backdrop="opaque"
      isDismissable={!processing}
      isKeyboardDismissDisabled={processing}
      hideCloseButton={processing}
      classNames={{ base: 'bg-content1 border border-default-200' }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex items-center gap-2 pb-1 text-sm">
              <Sparkles size={15} className="text-primary" />
              {t(image ? 'cropIcon' : 'chooseAccountIcon')}
            </ModalHeader>
            {image ? (
              <AccountIconCrop image={image} onCancel={() => setImage(null)} onConfirm={select} />
            ) : (
            <ModalBody className="flex flex-col gap-2.5 py-2" data-icon-picker="true">
              <input
                ref={fileInputRef}
                type="file"
                accept={ICON_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void handleFile(file);
                }}
              />
              <Button
                id="choose-icon-image-btn"
                size="sm"
                variant="flat"
                color="primary"
                className="w-full flex-shrink-0"
                startContent={
                  processing ? <Spinner size="sm" color="current" /> : <Upload size={14} />
                }
                onPress={() => fileInputRef.current?.click()}
                isDisabled={processing}
              >
                {processing ? t('processingImage') : t('chooseImage')}
              </Button>

              {error && (
                <p className="text-[11px] leading-4 text-danger" role="alert">
                  {error}
                </p>
              )}

              {/* 仅这个区域滚动，顶部按钮始终可见。 */}
              <div className="max-h-[292px] overflow-y-auto pr-1" data-icon-grid>
                <div className="grid grid-cols-6 gap-2 py-1.5">
                  <button
                    type="button"
                    data-icon-auto="true"
                    title={t('autoMatch')}
                    aria-label={t('autoMatch')}
                    aria-pressed={value === ''}
                    onClick={() => select('')}
                    disabled={processing}
                    className={`flex h-11 w-11 items-center justify-center justify-self-center rounded-full border transition-colors ${
                      value === ''
                        ? 'border-primary bg-primary-50 text-primary ring-2 ring-inset ring-primary'
                        : 'border-default-200 bg-white text-default-500 hover:border-primary/60'
                    }`}
                  >
                    <Sparkles size={18} />
                  </button>

                  {isCustom && (
                    <button
                      type="button"
                      data-icon-custom="true"
                      title={t('currentCustomImage')}
                      aria-label={t('currentCustomImage')}
                      aria-pressed
                      onClick={() => select(value)}
                      disabled={processing}
                      className="relative h-11 w-11 justify-self-center overflow-hidden rounded-full border border-primary bg-white after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:ring-2 after:ring-inset after:ring-primary"
                    >
                      <img
                        src={value}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  )}

                  {BRAND_LIBRARY.map((item) => {
                    const selected = item.slug === selectedSlug;
                    return (
                      <button
                        key={item.slug}
                        type="button"
                        data-icon-slug={item.slug}
                        title={item.label}
                        aria-label={item.label}
                        aria-pressed={selected}
                        onClick={() => select(`si:${item.slug}`)}
                        disabled={processing}
                        className={`flex h-11 w-11 items-center justify-center justify-self-center rounded-full border bg-white transition-colors ${
                          selected
                            ? 'border-primary ring-2 ring-inset ring-primary'
                            : 'border-default-200 hover:border-primary/60'
                        }`}
                      >
                        <img
                          src={brandIconUrl(item.slug)}
                          alt=""
                          draggable={false}
                          className="h-6 w-6 object-contain pointer-events-none"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </ModalBody>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
