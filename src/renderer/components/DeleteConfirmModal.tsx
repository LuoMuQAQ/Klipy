import React, { useRef, useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from '@heroui/react';
import { Trash2 } from 'lucide-react';
import { Account } from '../types';
import { t } from '../i18n';

interface DeleteConfirmModalProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  account,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const pending = useRef(false);
  const [deleting, setDeleting] = useState(false);
  if (!account) return null;

  const confirm = async () => {
    if (pending.current) return;
    pending.current = true;
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      pending.current = false;
      setDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isDismissable={!deleting}
      isKeyboardDismissDisabled={deleting}
      size="xs"
      placement="center"
      backdrop="opaque"
      classNames={{
        base: 'bg-content1 border border-default-200',
      }}
    >
      <ModalContent>
        {(modalClose) => (
          <>
            <ModalHeader className="flex items-center gap-1.5 text-danger text-sm font-semibold pb-1">
              <Trash2 size={15} />
              <span>{t('confirmDelete')}</span>
            </ModalHeader>
            <ModalBody className="py-2 text-sm text-foreground">
              {t('deleteAccountQuestion', {
                issuer: account.issuer,
                account: account.account,
              })}
            </ModalBody>
            <ModalFooter className="pt-2 pb-3">
              <Button size="sm" variant="light" onPress={modalClose} isDisabled={deleting}>
                {t('cancel')}
              </Button>
              <Button size="sm" color="danger" onPress={confirm} isLoading={deleting}>
                {t('delete')}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
