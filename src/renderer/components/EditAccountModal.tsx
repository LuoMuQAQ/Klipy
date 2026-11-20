import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Alert,
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

interface EditAccountModalProps {
  account: Account | null;
  groups: Group[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (params: { issuer: string; account: string; groupId: string }) => Promise<void>;
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
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!isOpen || !account) return;
    setIssuer(account.issuer);
    setAccountName(account.account);
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;

    const nextIssuer = issuer.trim();
    const nextAccount = accountName.trim();
    if (!nextIssuer) {
      setError('请输入服务名称。');
      return;
    }
    if (!nextAccount) {
      setError('请输入账号。');
      return;
    }
    if (!groupId) {
      setError('请选择分组。');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      await onSave({ issuer: nextIssuer, account: nextAccount, groupId });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
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
              编辑账号
            </ModalHeader>
            <ModalBody className="gap-3 py-2">
              <Input
                autoFocus
                type="text"
                size="sm"
                variant="bordered"
                autoComplete="off"
                label="服务名称"
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
                label="账号"
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
                label="分组"
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
                取消
              </Button>
              <Button type="submit" size="sm" color="primary" isLoading={saving}>
                保存
              </Button>
            </ModalFooter>
          </Form>
        )}
      </ModalContent>
    </Modal>
  );
}
