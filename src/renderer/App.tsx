import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Alert,
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
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Account, AddAccountParams, Group } from './types';
import { t } from './i18n';
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

  const [loading, setLoading] = useState(true);
  const [accountsError, setAccountsError] = useState(false);
  const [groupsError, setGroupsError] = useState(false);
  const periodicRefresh = useRef(false);
  const copyResetTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(copyResetTimer.current), []);
  const [view, setView] = useState<AppView>('accounts');
  const [filter, setFilter] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const hasGroups = groups.length > 0;

  const isDraggingRef = useRef(false);
  const pendingOrderRef = useRef<string[] | null>(null);
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
      const list = await window.authenticatorAPI.listAccounts();
      // Keep an in-progress drag's order, but refresh the underlying account data.
      const order = pendingOrderRef.current;
      if (order) {
        const byId = new Map(list.map((account) => [account.id, account]));
        const ordered = order.flatMap((id) => {
          const account = byId.get(id);
          byId.delete(id);
          return account ? [account] : [];
        });
        setAccounts([...ordered, ...byId.values()]);
      } else {
        setAccounts(list);
      }
      setAccountsError(false);
    } catch {
      setAccountsError(true);
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      setGroups(await window.authenticatorAPI.listGroups());
      setGroupsError(false);
    } catch {
      setGroupsError(true);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchAccounts(), fetchGroups()]);
    setLoading(false);
  }, [fetchAccounts, fetchGroups]);

  const refreshExpiredCodes = useCallback((now: number) => {
    if (periodicRefresh.current || !accountsRef.current.some((account) =>
      now >= account.validUntil || now < account.validUntil - account.period)) return;
    periodicRefresh.current = true;
    void fetchAccounts().finally(() => { periodicRefresh.current = false; });
  }, [fetchAccounts]);

  // 回到账号列表时重新拉取，避免离开期间的验证码与倒计时过期。
  useEffect(() => {
    if (view === 'accounts') void refreshAll();
  }, [view, refreshAll]);

  // 账号只按分组展示：没有分组时列表为空（引导先建分组），
  // 有分组时始终落在某个有效分组上，默认优先第一个有账号的分组。
  const selectedGroupId = useMemo(() => {
    if (groups.length === 0) return '';
    if (filter && groups.some((group) => group.id === filter)) return filter;
    const occupied = new Set(accounts.map((account) => account.groupId));
    return groups.find((group) => occupied.has(group.id))?.id ?? groups[0].id;
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

  const visibleIds = useMemo(() => visibleAccounts.map((account) => account.id), [visibleAccounts]);
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
    await window.authenticatorAPI.addAccount(params);
  };

  const handleDeleteConfirm = async () => {
    if (!accountToDelete) return;
    try {
      await window.authenticatorAPI.deleteAccount(accountToDelete.id);
      setAccountToDelete(null);
      await fetchAccounts();
    } catch {
      addToast({ title: t('deleteAccountFailed'), color: 'danger', timeout: 1_600 });
    }
  };

  const handleEditAccount = async (params: {
    issuer: string;
    account: string;
    groupId: string;
    icon: string;
  }) => {
    if (!editingAccount) return;
    try {
      await window.authenticatorAPI.updateAccount({ id: editingAccount.id, ...params });
      setEditingAccount(null);
      await fetchAccounts();
      addToast({ title: t('accountUpdated'), color: 'success', timeout: 1_400 });
    } catch {
      addToast({ title: t('saveFailed'), color: 'danger', timeout: 1_600 });
    }
  };

  const handleCopyAccount = async (account: Account) => {
    if (isDraggingRef.current) return;

    try {
      if (!await window.authenticatorAPI.copyAccountCode(account.id)) throw new Error();
    } catch {
      addToast({ title: t('copyCodeFailed'), color: 'danger', timeout: 1500 });
      return;
    }

    setCopiedId(account.id);
    window.clearTimeout(copyResetTimer.current);
    copyResetTimer.current = window.setTimeout(() => {
      setCopiedId((prev) => (prev === account.id ? null : prev));
    }, 1200);

    addToast({
      title: t('copiedCode', { issuer: account.issuer }),
      color: 'success',
      timeout: 1500,
    });
  };

  /**
   * 分组筛选下拖拽时，只重排可见账号：其余账号保持全局位置不变，
   * 再按合并后的全局顺序持久化。
   */
  const handleReorder = (newOrder: string[]) => {
    const reorderedIds = new Set(newOrder);
    let index = 0;
    const all = accountsRef.current;
    const byId = new Map(all.map((account) => [account.id, account]));
    const merged = all.map((account) =>
      reorderedIds.has(account.id) ? byId.get(newOrder[index++]) ?? account : account,
    );
    pendingOrderRef.current = merged.map((account) => account.id);
    setAccounts(merged);
  };

  const handleDragEnd = async () => {
    setTimeout(() => { isDraggingRef.current = false; }, 80);
    const ids = pendingOrderRef.current;
    pendingOrderRef.current = null;
    if (!ids) return;
    try {
      await window.authenticatorAPI.reorderAccounts(ids);
    } catch {
      addToast({ title: t('saveAccountOrderFailed'), color: 'danger', timeout: 1_600 });
      await fetchAccounts();
    }
  };

  const handleReorderGroups = (newOrder: Group[]) => {
    pendingGroupOrderRef.current = newOrder;
    setGroups(newOrder);
  };

  const handleGroupDragEnd = async () => {
    const order = pendingGroupOrderRef.current;
    pendingGroupOrderRef.current = null;
    if (!order) return;
    try {
      await window.authenticatorAPI.reorderGroups(order.map((group) => group.id));
    } catch {
      addToast({ title: t('saveGroupOrderFailed'), color: 'danger', timeout: 1_600 });
      await fetchGroups();
    }
  };

  const handleMoveAccount = async (account: Account, delta: -1 | 1) => {
    const index = visibleIds.indexOf(account.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= visibleIds.length) return;

    const nextVisible = [...visibleIds];
    [nextVisible[index], nextVisible[target]] = [nextVisible[target], nextVisible[index]];
    handleReorder(nextVisible);
    const ids = pendingOrderRef.current;
    pendingOrderRef.current = null;
    if (!ids) return;
    try {
      await window.authenticatorAPI.reorderAccounts(ids);
    } catch {
      addToast({ title: t('saveAccountOrderFailed'), color: 'danger', timeout: 1_600 });
      await fetchAccounts();
    }
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

  const handleKeyboardContextMenu = (rect: DOMRect, account: Account) => {
    setContextMenu({
      account,
      x: Math.round(Math.min(rect.right - 24, window.innerWidth - 140)),
      y: Math.round(rect.top + rect.height / 2),
    });
  };

  const contextAccountIndex = contextMenu ? visibleIds.indexOf(contextMenu.account.id) : -1;
  const accountMenuDisabledKeys = useMemo(() => {
    const keys: string[] = [];
    if (contextAccountIndex <= 0) keys.push('moveUp');
    if (contextAccountIndex < 0 || contextAccountIndex >= visibleIds.length - 1) keys.push('moveDown');
    return keys;
  }, [contextAccountIndex, visibleIds.length]);

  const accountMenuItems = useMemo(() => {
    const items: Array<{ key: string; label: string; icon: React.ReactNode; isDanger?: boolean }> = [
      { key: 'export', label: t('exportAction'), icon: <Share size={14} /> },
      { key: 'edit', label: t('editAction'), icon: <Pencil size={14} /> },
    ];
    if (visibleIds.length > 1) {
      items.push(
        { key: 'moveUp', label: t('moveUp'), icon: <ArrowUp size={14} /> },
        { key: 'moveDown', label: t('moveDown'), icon: <ArrowDown size={14} /> },
      );
    }
    items.push({ key: 'delete', label: t('deleteAction'), icon: <Trash2 size={14} />, isDanger: true });
    return items;
  }, [visibleIds.length]);

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

      {(accountsError || groupsError) && (
        <Alert className="mx-3 mt-2 w-auto shrink-0" color="danger" variant="flat"
          title={accountsError && groupsError ? t('loadAllFailed') : accountsError ? t('loadAccountsFailed') : t('loadGroupsFailed')}
          endContent={<Button size="sm" variant="flat" onPress={refreshAll}>{t('retry')}</Button>}
        />
      )}

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
          <TotpProgress onTick={refreshExpiredCodes} />

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
                values={visibleIds}
                onReorder={handleReorder}
                className="flex flex-col gap-2.5 list-none m-0 p-0"
              >
                {visibleAccounts.map((account) => (
                  <Reorder.Item
                    key={account.id}
                    value={account.id}
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
                      onKeyboardContextMenu={handleKeyboardContextMenu}
                      onMove={(item, delta) => void handleMoveAccount(item, delta)}
                    />
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            ) : accountsError || groupsError ? null : !hasGroups ? (
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
                  <span className="text-sm font-medium text-default-600">{t('noGroups')}</span>
                  <span className="text-[11px] leading-4 text-default-400">
                    {t('noGroupsHint')}
                  </span>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    startContent={<FolderPlus size={14} />}
                    onPress={() => setView('groups')}
                  >
                    {t('newGroup')}
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
                    {accounts.length === 0 ? t('noAccounts') : t('noAccountsInGroup')}
                  </span>
                  {accounts.length > 0 && currentGroupName && (
                    <span className="text-[11px] leading-4 text-default-400">
                      {t('groupEmptyHint', { group: currentGroupName })}
                    </span>
                  )}
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    startContent={<Plus size={14} />}
                    onPress={openAddModal}
                  >
                    {t('addAccount')}
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
              aria-label={t('accountActions')}
              items={accountMenuItems}
              disabledKeys={accountMenuDisabledKeys}
              onAction={(key) => {
                const target = contextMenu?.account;
                setContextMenu(null);
                if (!target) return;
                if (key === 'export') {
                  setExportingAccountId(target.id);
                } else if (key === 'edit') {
                  setEditingAccount(target);
                } else if (key === 'moveUp') {
                  void handleMoveAccount(target, -1);
                } else if (key === 'moveDown') {
                  void handleMoveAccount(target, 1);
                } else if (key === 'delete') {
                  setAccountToDelete(target);
                }
              }}
            >
              {(item) => (
                <DropdownItem
                  key={item.key}
                  color={item.isDanger ? 'danger' : 'default'}
                  className={item.isDanger ? 'text-danger' : undefined}
                  startContent={item.icon}
                >
                  {item.label}
                </DropdownItem>
              )}
            </DropdownMenu>
          </Dropdown>

          {/* Modals */}
          <AddAccountModal
            isOpen={isAddOpen}
            groups={groups}
            defaultGroupId={addingIntoGroup}
            onClose={onAddClose}
            onAdd={handleAddAccount}
            onAdded={fetchAccounts}
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
