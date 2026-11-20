import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ScrollShadow,
  addToast,
} from '@heroui/react';
import { Reorder, useReducedMotion, type Transition } from 'framer-motion';
import { Folder, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Account, Group } from '../types';
import { formatError } from '../utils/errors';

const REORDER_TRANSITION = {
  type: 'tween',
  duration: 0.21,
  ease: [0.22, 1, 0.36, 1],
} satisfies Transition;
const INSTANT_REORDER_TRANSITION = { ...REORDER_TRANSITION, duration: 0 };
const DROP_TRANSITION = {
  bounceStiffness: 1600,
  bounceDamping: 80,
  restDelta: 0.1,
  restSpeed: 3,
};

interface GroupManagementPageProps {
  groups: Group[];
  accounts: Account[];
  isCreateOpen: boolean;
  onCreateOpen: () => void;
  onCreateClose: () => void;
  onReorder: (newOrder: Group[]) => void;
  onReorderEnd: () => void;
  /** 分组变更后由外层刷新分组与账号列表。 */
  onChanged: () => Promise<void>;
}

export function GroupManagementPage({
  groups,
  accounts,
  isCreateOpen,
  onCreateOpen,
  onCreateClose,
  onReorder,
  onReorderEnd,
  onChanged,
}: GroupManagementPageProps) {
  const reorderTransition = useReducedMotion() ? INSTANT_REORDER_TRANSITION : REORDER_TRANSITION;

  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [renameTarget, setRenameTarget] = useState<Group | null>(null);
  const [draft, setDraft] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    group: Group;
    x: number;
    y: number;
  } | null>(null);

  const busyRef = useRef(false);

  useEffect(() => {
    if (isCreateOpen) {
      setNewName('');
      setCreateError('');
    }
  }, [isCreateOpen]);

  const accountCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const account of accounts) {
      map.set(account.groupId, (map.get(account.groupId) ?? 0) + 1);
    }
    return map;
  }, [accounts]);

  const countFor = (groupId: string) => accountCounts.get(groupId) ?? 0;

  const handleCreate = async () => {
    if (busyRef.current) return;
    const clean = newName.trim();
    if (!clean) {
      setCreateError('请输入分组名称。');
      return;
    }

    busyRef.current = true;
    setCreating(true);
    setCreateError('');
    try {
      await window.authenticatorAPI.addGroup(clean);
      onCreateClose();
      await onChanged();
      addToast({ title: `已创建分组「${clean}」`, color: 'success', timeout: 1_400 });
    } catch (err) {
      setCreateError(formatError(err));
    } finally {
      busyRef.current = false;
      setCreating(false);
    }
  };

  const openRename = (group: Group) => {
    setRenameTarget(group);
    setDraft(group.name);
    setRenameError('');
  };

  const closeRename = () => {
    if (renaming) return;
    setRenameTarget(null);
    setRenameError('');
  };

  const handleRename = async () => {
    if (!renameTarget || busyRef.current) return;
    const clean = draft.trim();
    if (!clean) {
      setRenameError('请输入分组名称。');
      return;
    }

    busyRef.current = true;
    setRenaming(true);
    setRenameError('');
    try {
      await window.authenticatorAPI.renameGroup(renameTarget.id, clean);
      setRenameTarget(null);
      await onChanged();
      addToast({ title: '分组已重命名', color: 'success', timeout: 1_400 });
    } catch (err) {
      setRenameError(formatError(err));
    } finally {
      busyRef.current = false;
      setRenaming(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);

    try {
      const result = await window.authenticatorAPI.deleteGroup(target.id);
      await onChanged();
      addToast({
        title:
          result.removedAccounts > 0
            ? `已删除分组，${result.removedAccounts} 个账号一并删除`
            : '分组已删除',
        color: 'success',
        timeout: 1_800,
      });
    } catch (err) {
      addToast({ title: formatError(err), color: 'danger', timeout: 1_800 });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, group: Group) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      group,
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
    });
  };

  const deleteCount = deleteTarget ? countFor(deleteTarget.id) : 0;

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-background">
      {/* Draggable Groups List */}
      <ScrollShadow className="flex-1 overflow-y-auto px-3 py-3">
        {groups.length === 0 ? (
          <Card
            shadow="none"
            radius="lg"
            className="mx-auto my-16 max-w-[230px] text-center border border-default-200 bg-content1 shadow-[0_1px_2px_rgba(17,24,28,0.04)]"
          >
            <CardBody className="flex flex-col items-center gap-3 px-5 py-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FolderPlus size={20} />
              </div>
              <span className="text-sm font-semibold text-foreground">暂无分组</span>
              <span className="text-xs leading-5 text-default-500">
                点击右上角「+」或下方按钮新建分组
              </span>
              <Button
                size="sm"
                color="primary"
                variant="flat"
                startContent={<Plus size={14} />}
                onPress={onCreateOpen}
              >
                新建分组
              </Button>
            </CardBody>
          </Card>
        ) : (
          <Reorder.Group
            axis="y"
            values={groups}
            onReorder={onReorder}
            className="m-0 flex list-none flex-col gap-2.5 p-0"
          >
            {groups.map((group) => {
              const count = countFor(group.id);
              return (
                <Reorder.Item
                  key={group.id}
                  value={group}
                  layout="position"
                  dragMomentum={false}
                  dragTransition={DROP_TRANSITION}
                  transition={{ layout: reorderTransition }}
                  onDragEnd={onReorderEnd}
                  whileDrag={{
                    zIndex: 30,
                    boxShadow: '0 10px 24px rgba(17, 24, 28, 0.14)',
                  }}
                  className="list-none rounded-large"
                >
                  <Card
                    shadow="none"
                    radius="lg"
                    onContextMenu={(e) => handleContextMenu(e, group)}
                    className="w-full border border-default-200 bg-content1 shadow-[0_1px_2px_rgba(17,24,28,0.05)] hover:border-primary hover:shadow-[0_6px_16px_rgba(79,70,229,0.10)] transition-[border-color,box-shadow,background-color] duration-150 cursor-grab active:cursor-grabbing"
                  >
                    <CardBody className="flex flex-row items-center justify-between gap-3 px-3.5 py-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Folder size={16} />
                        </div>
                        <span className="truncate text-sm font-semibold leading-5 text-foreground">
                          {group.name}
                        </span>
                      </div>

                      <span
                        className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium tabular-nums ${
                          count > 0
                            ? 'bg-primary/10 text-primary'
                            : 'bg-default-100 text-default-500'
                        }`}
                      >
                        {count > 0 ? `${count} 个账号` : '暂无账号'}
                      </span>
                    </CardBody>
                  </Card>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        )}
      </ScrollShadow>

      {/* Right-Click Context Menu */}
      <Dropdown
        key={contextMenu ? `${contextMenu.group.id}-${contextMenu.x}-${contextMenu.y}` : 'closed'}
        isOpen={Boolean(contextMenu)}
        onOpenChange={(open) => {
          if (!open) setContextMenu(null);
        }}
        placement="bottom-start"
        disableAnimation
      >
        <DropdownTrigger>
          <div
            style={{
              position: 'fixed',
              left: contextMenu?.x ?? 0,
              top: contextMenu?.y ?? 0,
              width: 1,
              height: 1,
              pointerEvents: 'none',
            }}
          />
        </DropdownTrigger>
        <DropdownMenu
          aria-label="分组操作"
          onAction={(key) => {
            const target = contextMenu?.group;
            setContextMenu(null);
            if (!target) return;
            if (key === 'rename') {
              openRename(target);
            } else if (key === 'delete') {
              setDeleteTarget(target);
            }
          }}
        >
          <DropdownItem key="rename" startContent={<Pencil size={14} />}>
            重命名
          </DropdownItem>
          <DropdownItem
            key="delete"
            color="danger"
            className="text-danger"
            startContent={<Trash2 size={14} />}
          >
            删除
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      {/* Create Group Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          if (!creating) onCreateClose();
        }}
        size="xs"
        placement="center"
        backdrop="opaque"
        classNames={{ base: 'bg-content1 border border-default-200' }}
      >
        <ModalContent>
          {(modalClose) => (
            <>
              <ModalHeader className="flex items-center gap-2 pb-1 text-sm font-semibold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FolderPlus size={14} />
                </span>
                <span>新建分组</span>
              </ModalHeader>
              <ModalBody className="gap-2.5 py-2">
                <Input
                  autoFocus
                  size="sm"
                  radius="md"
                  variant="bordered"
                  label="分组名称"
                  value={newName}
                  onValueChange={(value) => {
                    setNewName(value);
                    if (createError) setCreateError('');
                  }}
                  isDisabled={creating}
                  maxLength={20}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleCreate();
                  }}
                />
                {createError && (
                  <Alert
                    color="danger"
                    variant="flat"
                    title={createError}
                    classNames={{
                      base: 'py-1.5 px-2.5 items-center',
                      title: 'text-xs font-medium',
                    }}
                  />
                )}
              </ModalBody>
              <ModalFooter className="pb-3 pt-2">
                <Button size="sm" variant="light" isDisabled={creating} onPress={modalClose}>
                  取消
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  isLoading={creating}
                  isDisabled={!newName.trim()}
                  onPress={() => void handleCreate()}
                >
                  创建
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Rename Group Modal */}
      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={closeRename}
        size="xs"
        placement="center"
        backdrop="opaque"
        classNames={{ base: 'bg-content1 border border-default-200' }}
      >
        <ModalContent>
          {(modalClose) => (
            <>
              <ModalHeader className="flex items-center gap-2 pb-1 text-sm font-semibold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Pencil size={14} />
                </span>
                <span>重命名分组</span>
              </ModalHeader>
              <ModalBody className="gap-2.5 py-2">
                <Input
                  autoFocus
                  size="sm"
                  radius="md"
                  variant="bordered"
                  label="分组名称"
                  value={draft}
                  onValueChange={(value) => {
                    setDraft(value);
                    if (renameError) setRenameError('');
                  }}
                  isDisabled={renaming}
                  maxLength={20}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleRename();
                  }}
                />
                {renameError && (
                  <Alert
                    color="danger"
                    variant="flat"
                    title={renameError}
                    classNames={{
                      base: 'py-1.5 px-2.5 items-center',
                      title: 'text-xs font-medium',
                    }}
                  />
                )}
              </ModalBody>
              <ModalFooter className="pb-3 pt-2">
                <Button size="sm" variant="light" isDisabled={renaming} onPress={modalClose}>
                  取消
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  isLoading={renaming}
                  isDisabled={!draft.trim()}
                  onPress={() => void handleRename()}
                >
                  保存
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        size="xs"
        placement="center"
        backdrop="opaque"
        classNames={{ base: 'bg-content1 border border-default-200' }}
      >
        <ModalContent>
          {(modalClose) => (
            <>
              <ModalHeader className="flex items-center gap-2 pb-1 text-sm font-semibold text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger/10 text-danger">
                  <Trash2 size={14} />
                </span>
                <span>删除分组</span>
              </ModalHeader>
              <ModalBody className="gap-2 py-2 text-sm text-foreground">
                <p className="m-0 leading-6">
                  确定要删除分组
                  <span className="px-1 font-semibold text-primary">{deleteTarget?.name}</span>
                  吗？
                </p>
                {deleteCount > 0 ? (
                  <div className="rounded-medium bg-danger-50 px-3 py-2 text-xs leading-5 text-danger">
                    组内 {deleteCount} 个账号会被一并删除，此操作无法撤销。
                  </div>
                ) : (
                  <p className="m-0 text-xs leading-5 text-default-500">该分组下暂无账号。</p>
                )}
              </ModalBody>
              <ModalFooter className="pb-3 pt-2">
                <Button size="sm" variant="light" onPress={modalClose}>
                  取消
                </Button>
                <Button size="sm" color="danger" onPress={() => void confirmDelete()}>
                  确认删除
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
