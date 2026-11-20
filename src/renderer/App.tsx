import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Button,
  Spinner,
  Avatar,
  ScrollShadow,
  Card,
  CardBody,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  useDisclosure,
  addToast,
} from '@heroui/react';
import { Reorder, useReducedMotion, type Transition } from 'framer-motion';
import {
  Plus,
  KeyRound,
  Pencil,
  Share,
  Trash2,
  FolderPlus,
} from 'lucide-react';
import { Account, AddAccountParams, Group } from './types';
import { TitleBar, type AppView } from './components/TitleBar';
import { TotpProgress } from './components/TotpProgress';
import { GroupFilterBar } from './components/GroupFilterBar';
import { AccountCard } from './components/AccountCard';
import { AddAccountModal } from './components/AddAccountModal';
import { EditAccountModal } from './components/EditAccountModal';
import { ExportAccountModal } from './components/ExportAccountModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { GroupManagementPage } from './components/GroupManagementPage';

const REORDER_TRANSITION = {
  type: 'tween',
  duration: 0.21,
  ease: [0.22, 1, 0.36, 1],
} satisfies Transition;
const INSTANT_REORDER_TRANSITION = { ...REORDER_TRANSITION, duration: 0 };
// Critically damp the release so it reaches its slot without bounce or a visible final snap.
const DROP_TRANSITION = {
  bounceStiffness: 1600,
  bounceDamping: 80,
  restDelta: 0.1,
  restSpeed: 3,
};

export const App: React.FC = () => {
  const reorderTransition = useReducedMotion() ? INSTANT_REORDER_TRANSITION : REORDER_TRANSITION;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const accountsRef = useRef<Account[]>([]);
  accountsRef.current = accounts;
  const groupsRef = useRef<Group[]>([]);
  groupsRef.current = groups;

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AppView>('accounts');
  const [filter, setFilter] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const hasGroups = groups.length > 0;

  const isDraggingRef = useRef(false);
  const pendingOrderRef = useRef<Account[] | null>(null);
  const pendingGroupOrderRef = useRef<Group[] | null>(null);

  const {
    isOpen: isAddOpen,
    onOpen: onAddOpen,
    onClose: onAddClose,
  } = useDisclosure();

  const {
    isOpen: isAddGroupOpen,
    onOpen: onAddGroupOpen,
    onClose: onAddGroupClose,
  } = useDisclosure();

  const [contextMenu, setContextMenu] = useState<{
    account: Account;
    x: number;
    y: number;
  } | null>(null);

  const [exportingAccountId, setExportingAccountId] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      if (window.authenticatorAPI) {
        const list = await window.authenticatorAPI.listAccounts();
        setAccounts(list);
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      if (window.authenticatorAPI) {
        const list = await window.authenticatorAPI.listGroups();
        setGroups(list);
      }
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchAccounts(), fetchGroups()]);
  }, [fetchAccounts, fetchGroups]);

  // 回到账号列表时重新拉取，避免离开期间的验证码与倒计时过期。
  useEffect(() => {
    if (view === 'accounts') void refreshAll();
  }, [view, refreshAll]);

  // 账号只按分组展示：没有分组时列表为空（引导先建分组），
  // 有分组时始终落在某个有效分组上，默认优先第一个有账号的分组。
  const selectedGroupId = useMemo(() => {
    if (groups.length === 0) return '';
    if (filter && groups.some((group) => group.id === filter)) return filter;
    return (
      groups.find((group) => accounts.some((account) => account.groupId === group.id))?.id ??
      groups[0].id
    );
  }, [groups, accounts, filter]);

  const groupNameById = useMemo(
    () => new Map(groups.map((group) => [group.id, group.name])),
    [groups],
  );

  const visibleAccounts = useMemo(
    () =>
      selectedGroupId
        ? accounts.filter((account) => account.groupId === selectedGroupId)
        : [],
    [accounts, selectedGroupId],
  );

  const addingIntoGroup = selectedGroupId;

  // 没有分组时不打开添加弹窗，直接引导去创建分组。
  const openAddModal = useCallback(() => {
    if (groups.length === 0) {
      setView('groups');
      return;
    }
    onAddOpen();
  }, [groups.length, onAddOpen]);

  const handleAddAccount = async (params: AddAccountParams) => {
    if (window.authenticatorAPI) {
      await window.authenticatorAPI.addAccount(params);
      await fetchAccounts();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!accountToDelete) return;
    if (window.authenticatorAPI) {
      await window.authenticatorAPI.deleteAccount(accountToDelete.id);
      await fetchAccounts();
    }
    setAccountToDelete(null);
  };

  const handleEditAccount = async (params: {
    issuer: string;
    account: string;
    groupId: string;
  }) => {
    if (!editingAccount) return;
    try {
      await window.authenticatorAPI.updateAccount({ id: editingAccount.id, ...params });
      setEditingAccount(null);
      await fetchAccounts();
      addToast({ title: '账号信息已更新', color: 'success', timeout: 1_400 });
    } catch {
      addToast({ title: '保存失败，请重试', color: 'danger', timeout: 1_600 });
    }
  };

  const handleCopyAccount = (account: Account) => {
    if (isDraggingRef.current) return;

    if (window.authenticatorAPI?.copyToClipboard) {
      window.authenticatorAPI.copyToClipboard(account.code);
    } else {
      navigator.clipboard.writeText(account.code);
    }

    setCopiedId(account.id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === account.id ? null : prev));
    }, 1200);

    addToast({
      title: `已复制 ${account.issuer} 验证码`,
      color: 'success',
      timeout: 1500,
    });
  };

  /**
   * 分组筛选下拖拽时，只重排可见账号：其余账号保持全局位置不变，
   * 再按合并后的全局顺序持久化。
   */
  const handleReorder = (newOrder: Account[]) => {
    let merged: Account[];
    if (!hasGroups) {
      merged = newOrder;
    } else {
      const visibleIds = new Set(newOrder.map((account) => account.id));
      const queue = [...newOrder];
      merged = accountsRef.current.map((account) =>
        visibleIds.has(account.id) ? queue.shift() ?? account : account,
      );
    }

    pendingOrderRef.current = merged;
    setAccounts(merged);
  };

  const handleDragEnd = () => {
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 80);
    const ids = (pendingOrderRef.current ?? accountsRef.current).map((account) => account.id);
    pendingOrderRef.current = null;
    window.authenticatorAPI?.reorderAccounts?.(ids);
  };

  const handleReorderGroups = (newOrder: Group[]) => {
    pendingGroupOrderRef.current = newOrder;
    setGroups(newOrder);
  };

  const handleGroupDragEnd = () => {
    const ids = (pendingGroupOrderRef.current ?? groupsRef.current).map((group) => group.id);
    pendingGroupOrderRef.current = null;
    window.authenticatorAPI?.reorderGroups?.(ids);
  };

  const handleContextMenu = (e: React.MouseEvent, account: Account) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      account,
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
    });
  };

  const currentGroupName = groupNameById.get(selectedGroupId) ?? '';

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Native-Style TitleBar：账号列表页显示添加/分组管理，分组页显示返回 */}
      <TitleBar
        view={view}
        canAdd={hasGroups}
        onAddOpen={openAddModal}
        onAddGroupOpen={onAddGroupOpen}
        onGroupsOpen={() => setView('groups')}
        onBack={() => setView('accounts')}
      />

      {view === 'groups' ? (
        <GroupManagementPage
          groups={groups}
          accounts={accounts}
          isCreateOpen={isAddGroupOpen}
          onCreateOpen={onAddGroupOpen}
          onCreateClose={onAddGroupClose}
          onReorder={handleReorderGroups}
          onReorderEnd={handleGroupDragEnd}
          onChanged={refreshAll}
        />
      ) : (
        <>
          <TotpProgress onPeriodChange={fetchAccounts} />

          {hasGroups && (
            <GroupFilterBar
              groups={groups}
              accounts={accounts}
              value={selectedGroupId}
              onChange={setFilter}
            />
          )}

          {/* Draggable Accounts List */}
          <ScrollShadow className="flex-1 px-3 py-3 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Spinner size="md" color="primary" />
              </div>
            ) : visibleAccounts.length > 0 ? (
              <Reorder.Group
                axis="y"
                values={visibleAccounts}
                onReorder={handleReorder}
                className="flex flex-col gap-2.5 list-none m-0 p-0"
              >
                {visibleAccounts.map((account) => (
                  <Reorder.Item
                    key={account.id}
                    value={account}
                    layout="position"
                    dragMomentum={false}
                    dragTransition={DROP_TRANSITION}
                    transition={{ layout: reorderTransition }}
                    onDragStart={() => {
                      isDraggingRef.current = true;
                    }}
                    onDragEnd={handleDragEnd}
                    whileDrag={{
                      zIndex: 30,
                      boxShadow: '0 10px 24px rgba(17, 24, 28, 0.14)',
                    }}
                    className="list-none rounded-large"
                  >
                    <AccountCard
                      account={account}
                      isCopied={copiedId === account.id}
                      onCopy={handleCopyAccount}
                      onContextMenu={handleContextMenu}
                    />
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            ) : !hasGroups ? (
              <Card
                shadow="sm"
                className="my-16 mx-auto max-w-[230px] text-center border border-default-200 bg-content1"
              >
                <CardBody className="flex flex-col items-center gap-3 p-5">
                  <Avatar
                    icon={<FolderPlus size={22} />}
                    size="md"
                    color="default"
                    className="bg-default-100 text-default-600"
                  />
                  <span className="text-sm font-medium text-default-600">还没有分组</span>
                  <span className="text-[11px] leading-4 text-default-400">
                    账号需要保存在分组中，先创建一个分组再添加账号。
                  </span>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    startContent={<FolderPlus size={14} />}
                    onPress={() => setView('groups')}
                  >
                    新建分组
                  </Button>
                </CardBody>
              </Card>
            ) : (
              <Card
                shadow="sm"
                className="my-16 mx-auto max-w-[230px] text-center border border-default-200 bg-content1"
              >
                <CardBody className="flex flex-col items-center gap-3 p-5">
                  <Avatar
                    icon={<KeyRound size={22} />}
                    size="md"
                    color="default"
                    className="bg-default-100 text-default-600"
                  />
                  <span className="text-sm text-default-600">
                    {accounts.length === 0 ? '还没有账号' : '该分组暂无账号'}
                  </span>
                  {accounts.length > 0 && currentGroupName && (
                    <span className="text-[11px] leading-4 text-default-400">
                      「{currentGroupName}」下还没有账号
                    </span>
                  )}
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    startContent={<Plus size={14} />}
                    onPress={openAddModal}
                  >
                    添加账号
                  </Button>
                </CardBody>
              </Card>
            )}
          </ScrollShadow>

          {/* Right-Click Context Menu using HeroUI Dropdown */}
          <Dropdown
            key={contextMenu ? `${contextMenu.account.id}-${contextMenu.x}-${contextMenu.y}` : 'closed'}
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
              aria-label="账号操作"
              onAction={(key) => {
                const target = contextMenu?.account;
                setContextMenu(null);
                if (!target) return;
                if (key === 'export') {
                  setExportingAccountId(target.id);
                } else if (key === 'edit') {
                  setEditingAccount(target);
                } else if (key === 'delete') {
                  setAccountToDelete(target);
                }
              }}
            >
              <DropdownItem key="export" startContent={<Share size={14} />}>
                导出
              </DropdownItem>
              <DropdownItem key="edit" startContent={<Pencil size={14} />}>
                编辑
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

          {/* Modals */}
          <AddAccountModal
            isOpen={isAddOpen}
            groups={groups}
            defaultGroupId={addingIntoGroup}
            onClose={onAddClose}
            onAdd={handleAddAccount}
          />

          <ExportAccountModal
            accountId={exportingAccountId}
            isOpen={Boolean(exportingAccountId)}
            onClose={() => setExportingAccountId(null)}
          />

          <DeleteConfirmModal
            account={accountToDelete}
            isOpen={Boolean(accountToDelete)}
            onClose={() => setAccountToDelete(null)}
            onConfirm={handleDeleteConfirm}
          />

          <EditAccountModal
            account={editingAccount}
            groups={groups}
            isOpen={Boolean(editingAccount)}
            onClose={() => setEditingAccount(null)}
            onSave={handleEditAccount}
          />
        </>
      )}
    </div>
  );
};

export default App;
