import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ScrollShadow,
  Tooltip,
  addToast,
} from '@heroui/react';
import { Check, Folder, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Account, Group } from '../types';
import { formatError } from '../utils/errors';

interface GroupManagementPageProps {
  groups: Group[];
  accounts: Account[];
  /** 分组变更后由外层刷新分组与账号列表。 */
  onChanged: () => Promise<void>;
}

export function GroupManagementPage({ groups, accounts, onChanged }: GroupManagementPageProps) {
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
  const [createError, setCreateError] = useState('');
  const [renameError, setRenameError] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const busyRef = useRef(false);

  const accountCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const account of accounts) {
      map.set(account.groupId, (map.get(account.groupId) ?? 0) + 1);
    }
    return map;
  }, [accounts]);

  const countFor = (groupId: string) => accountCounts.get(groupId) ?? 0;

  const create = async () => {
    if (busyRef.current) return;
    const clean = name.trim();
    if (!clean) {
      setCreateError('请输入分组名称。');
      return;
    }

    busyRef.current = true;
    setCreating(true);
    setCreateError('');
    try {
      await window.authenticatorAPI.addGroup(clean);
      setName('');
      await onChanged();
      addToast({ title: `已创建分组「${clean}」`, color: 'success', timeout: 1_400 });
    } catch (err) {
      setCreateError(formatError(err));
    } finally {
      busyRef.current = false;
      setCreating(false);
    }
  };

  const startRename = (group: Group) => {
    setEditingId(group.id);
    setDraft(group.name);
    setRenameError('');
    setCreateError('');
  };

  const cancelRename = () => {
    setEditingId(null);
    setRenameError('');
  };

  const commitRename = async () => {
    if (!editingId || busyRef.current) return;
    const clean = draft.trim();
    if (!clean) {
      setRenameError('请输入分组名称。');
      return;
    }

    busyRef.current = true;
    setRenaming(true);
    setRenameError('');
    try {
      await window.authenticatorAPI.renameGroup(editingId, clean);
      setEditingId(null);
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

  const deleteCount = deleteTarget ? countFor(deleteTarget.id) : 0;

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-background">
      {/* Compact Inline Create Bar */}
      <div className="px-3 pt-3 pb-2">
        <Card
          shadow="none"
          radius="lg"
          className="border border-default-200 bg-content1 shadow-[0_1px_2px_rgba(17,24,28,0.04)]"
        >
          <CardBody className="gap-2 p-2.5">
            <div className="flex items-center gap-2">
              <Input
                size="sm"
                radius="md"
                variant="flat"
                aria-label="新分组名称"
                placeholder="输入新分组名称"
                startContent={<FolderPlus size={15} className="text-default-400 flex-shrink-0" />}
                value={name}
                isClearable
                onClear={() => {
                  setName('');
                  setCreateError('');
                }}
                onValueChange={(value) => {
                  setName(value);
                  if (createError) setCreateError('');
                }}
                isDisabled={creating}
                maxLength={20}
                classNames={{
                  base: 'flex-1',
                  inputWrapper:
                    'h-9 min-h-9 bg-default-100/80 data-[hover=true]:bg-default-100 group-data-[focus=true]:bg-content1 border border-transparent group-data-[focus=true]:border-primary shadow-none',
                  input: 'text-[13px]',
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void create();
                }}
              />
              <Button
                size="sm"
                radius="md"
                color="primary"
                startContent={!creating ? <Plus size={15} strokeWidth={2.2} /> : undefined}
                isLoading={creating}
                isDisabled={!name.trim() || groups.length >= 50}
                onPress={() => void create()}
                className="h-9 px-3.5 font-medium flex-shrink-0"
              >
                新建
              </Button>
            </div>
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
          </CardBody>
        </Card>
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between px-4 pt-1.5 pb-2">
        <span className="text-xs font-semibold text-default-600">分组列表</span>
        <span className="rounded-full bg-default-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-default-500">
          {groups.length} / 50
        </span>
      </div>

      {/* Groups List */}
      <ScrollShadow className="flex-1 overflow-y-auto px-3 pb-3">
        {groups.length === 0 ? (
          <Card
            shadow="none"
            radius="lg"
            className="mx-auto my-12 max-w-[240px] text-center border border-default-200 bg-content1 shadow-[0_1px_2px_rgba(17,24,28,0.04)]"
          >
            <CardBody className="flex flex-col items-center gap-2.5 px-5 py-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FolderPlus size={20} />
              </div>
              <span className="text-sm font-semibold text-foreground">暂无分组</span>
              <span className="text-xs leading-5 text-default-500">
                在上方输入名称即可新建第一个分组
              </span>
            </CardBody>
          </Card>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {groups.map((group) => {
              const isEditing = editingId === group.id;
              const count = countFor(group.id);
              return (
                <li
                  key={group.id}
                  className={`rounded-large border bg-content1 transition-[border-color,box-shadow,background-color] duration-150 ${
                    isEditing
                      ? 'border-primary shadow-[0_4px_14px_rgba(79,70,229,0.12)]'
                      : 'border-default-200 shadow-[0_1px_2px_rgba(17,24,28,0.05)] hover:border-primary/50 hover:shadow-[0_4px_12px_rgba(79,70,229,0.08)]'
                  }`}
                >
                  {isEditing ? (
                    <div className="flex flex-col gap-1.5 p-2">
                      <div className="flex items-center gap-1.5">
                        <Input
                          autoFocus
                          size="sm"
                          radius="md"
                          variant="bordered"
                          value={draft}
                          onValueChange={(value) => {
                            setDraft(value);
                            if (renameError) setRenameError('');
                          }}
                          isDisabled={renaming}
                          maxLength={20}
                          aria-label="分组名称"
                          classNames={{
                            base: 'flex-1',
                            inputWrapper: 'h-8 min-h-8 border-default-300 data-[focus=true]:border-primary',
                            input: 'text-[13px]',
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void commitRename();
                            if (event.key === 'Escape') cancelRename();
                          }}
                        />
                        <Button
                          isIconOnly
                          size="sm"
                          radius="md"
                          color="primary"
                          variant="flat"
                          isLoading={renaming}
                          aria-label="保存名称"
                          onPress={() => void commitRename()}
                          className="h-8 w-8 min-w-8"
                        >
                          <Check size={14} strokeWidth={2.2} />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          radius="md"
                          variant="light"
                          isDisabled={renaming}
                          aria-label="取消改名"
                          onPress={cancelRename}
                          className="h-8 w-8 min-w-8 text-default-500"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                      {renameError && (
                        <span className="px-1 text-[11px] font-medium text-danger">
                          {renameError}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 px-3 py-2.5">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Folder size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold leading-5 text-foreground">
                          {group.name}
                        </div>
                        <div className="text-[11px] leading-4 tabular-nums text-default-500">
                          {count > 0 ? `${count} 个账号` : '暂无账号'}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-0.5">
                        <Tooltip content="重命名" delay={300} closeDelay={0} disableAnimation>
                          <Button
                            isIconOnly
                            size="sm"
                            radius="md"
                            variant="light"
                            aria-label={`重命名 ${group.name}`}
                            onPress={() => startRename(group)}
                            className="h-7 w-7 min-w-7 text-default-500 data-[hover=true]:bg-primary/10 data-[hover=true]:text-primary"
                          >
                            <Pencil size={13} />
                          </Button>
                        </Tooltip>
                        <Tooltip content="删除分组" delay={300} closeDelay={0} disableAnimation>
                          <Button
                            isIconOnly
                            size="sm"
                            radius="md"
                            variant="light"
                            color="danger"
                            aria-label={`删除 ${group.name}`}
                            onPress={() => setDeleteTarget(group)}
                            className="h-7 w-7 min-w-7 text-default-400 data-[hover=true]:text-danger"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </Tooltip>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ScrollShadow>

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
