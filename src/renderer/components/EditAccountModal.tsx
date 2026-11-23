import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
} from '@heroui/react';
import { Pencil } from 'lucide-react';
import type { Account, Group } from '../types';
import { t } from '../i18n';
import { resolveAccountIcon } from '../utils/accountIcon';
import { AccountIconPickerModal } from './AccountIconPickerModal';

interface EditAccountModalProps {
  account: Account | null;
  groups: Group[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (params: {
    issuer: string;
    account: string;
    groupId: string;
    icon: string;
  }) => Promise<void>;
}

export function EditAccountModal({
  account,
  groups,
  isOpen,
  onClose,
  onSave,
}: EditAccountModalProps) {
  const [issuer, setIssuer] = useState('');
  const [accountName, setAccountName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [icon, setIcon] = useState('');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!isOpen || !account) return;
    setIssuer(account.issuer);
    setAccountName(account.account);
    setIcon(account.icon ?? '');
    setIconPickerOpen(false);
    // 账号必须归属分组；历史数据里的空/失效分组回退到第一个分组。
    setGroupId(
      account.groupId && groups.some((group) => group.id === account.groupId)
        ? account.groupId
        : groups[0]?.id ?? '',
    );
    setError('');
    setSaving(false);
    savingRef.current = false;
  }, [isOpen, account, groups]);

  if (!account) return null;

  const iconPreview = resolveAccountIcon(icon, issuer, accountName);
  const initials = (issuer.trim() || accountName.trim()).slice(0, 2).toUpperCase() || '2F';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;

    const nextIssuer = issuer.trim();
    const nextAccount = accountName.trim();
    if (!nextIssuer) {
      setError(t('enterServiceName'));
      return;
    }
    if (!nextAccount) {
      setError(t('enterAccountName'));
      return;
    }
    if (!groupId) {
      setError(t('selectGroup'));
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave({ issuer: nextIssuer, account: nextAccount, groupId, icon });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="sm"
        placement="center"
        backdrop="opaque"
        classNames={{ base: 'bg-content1 border border-default-200' }}
      >
        <ModalContent>
          {(modalClose) => (
            <Form className="block w-full" onSubmit={handleSubmit}>
              <ModalHeader className="flex items-center gap-2 text-sm">
                <Pencil size={15} className="text-primary" />
                {t('editAccount')}
              </ModalHeader>
              <ModalBody className="gap-3 py-2">
                <div className="flex justify-center">
                  <button
                    type="button"
                    id="account-icon-btn"
                    title={t('changeIcon')}
                    aria-label={t('changeIcon')}
                    onClick={() => setIconPickerOpen(true)}
                    disabled={saving}
                    className="group relative flex h-14 w-14 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60"
                  >
                    <Avatar
                      name={initials}
                      getInitials={() => initials}
                      src={iconPreview?.src}
                      showFallback
                      disableAnimation
                      aria-hidden
                      imgProps={{ draggable: false }}
                      className={`h-14 w-14 text-sm font-semibold transition duration-150 group-hover:grayscale ${
                        iconPreview ? 'border border-default-200 bg-white' : 'bg-default-100'
                      }`}
                      classNames={{
                        img:
                          iconPreview?.kind === 'custom'
                            ? 'object-cover pointer-events-none'
                            : 'object-contain p-2 pointer-events-none',
                      }}
                    />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition-colors duration-150 group-hover:bg-black/40 group-hover:opacity-100">
                      <Pencil size={18} />
                    </span>
                  </button>
                </div>

                <Input
                  autoFocus
                  type="text"
                  size="sm"
                  variant="bordered"
                  autoComplete="off"
                  label={t('serviceName')}
                  value={issuer}
                  onValueChange={(value) => {
                    setIssuer(value);
                    setError('');
                  }}
                  isDisabled={saving}
                  maxLength={60}
                />
                <Input
                  type="text"
                  size="sm"
                  variant="bordered"
                  autoComplete="off"
                  label={t('accountLabel')}
                  value={accountName}
                  onValueChange={(value) => {
                    setAccountName(value);
                    setError('');
                  }}
                  isDisabled={saving}
                  maxLength={120}
                />
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
                  isDisabled={saving || groups.length === 0}
                >
                  {(item) => <SelectItem key={item.id}>{item.name}</SelectItem>}
                </Select>
                {error && <Alert color="danger" variant="flat" title={error} />}
              </ModalBody>
              <ModalFooter>
                <Button size="sm" variant="light" onPress={modalClose} isDisabled={saving}>
                  {t('cancel')}
                </Button>
                <Button type="submit" size="sm" color="primary" isLoading={saving} id="save-account-btn">
                  {t('save')}
                </Button>
              </ModalFooter>
            </Form>
          )}
        </ModalContent>
      </Modal>

      <AccountIconPickerModal
        isOpen={iconPickerOpen && isOpen}
        value={icon}
        onClose={() => setIconPickerOpen(false)}
        onChange={(nextIcon) => {
          setIcon(nextIcon);
          setError('');
        }}
      />
    </>
  );
}
