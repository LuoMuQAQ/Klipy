import React from 'react';
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  Button,
  Image,
  Tooltip,
  Divider,
} from '@heroui/react';
import { ChevronLeft, FolderCog, Minus, Plus, X } from 'lucide-react';
import { t } from '../i18n';

export type AppView = 'accounts' | 'groups';

interface TitleBarProps {
  view: AppView;
  /** 只有存在分组时才允许添加账号（账号必须归属分组）。 */
  canAdd: boolean;
  onAddOpen: () => void;
  onAddGroupOpen: () => void;
  onGroupsOpen: () => void;
  onBack: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  view,
  canAdd,
  onAddOpen,
  onAddGroupOpen,
  onGroupsOpen,
  onBack,
}) => {
  const handleMinimize = () => {
    window.authenticatorAPI?.minimize?.();
  };

  const handleClose = () => {
    window.authenticatorAPI?.close?.();
  };

  const isGroupsView = view === 'groups';

  return (
    <Navbar
      isBordered
      isBlurred={false}
      maxWidth="full"
      position="static"
      height="2.75rem"
      className="app-drag bg-content1 select-none flex-shrink-0"
      classNames={{
        base: 'bg-content1 border-default-200',
        wrapper: 'px-0 pl-3 gap-2 bg-content1',
      }}
    >
      <NavbarBrand className="gap-2 min-w-0">
        {isGroupsView ? (
          <>
            <Button
              id="groups-back-btn"
              isIconOnly
              size="sm"
              variant="light"
              aria-label={t('backToAccounts')}
              onPress={onBack}
              className="app-nodrag w-7 h-7 min-w-7 text-default-600"
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm font-semibold text-foreground tracking-normal truncate">
              {t('groupManagement')}
            </span>
          </>
        ) : (
          <>
            <Image
              src="./logo.svg"
              alt="Klipy Logo"
              width={20}
              height={20}
              radius="none"
              disableSkeleton
              className="pointer-events-none"
            />
            <span className="text-[15px] font-semibold text-foreground tracking-tight">
              Klipy
            </span>
          </>
        )}
      </NavbarBrand>

      <NavbarContent justify="end" className="app-nodrag gap-0 h-full">
        {isGroupsView ? (
          <NavbarItem className="flex items-center mr-1">
            <Tooltip content={t('newGroup')} delay={300} closeDelay={0} disableAnimation>
              <Button
                id="add-group-btn"
                isIconOnly
                size="sm"
                color="primary"
                variant="flat"
                aria-label={t('newGroup')}
                onPress={onAddGroupOpen}
                className="w-7 h-7 min-w-7"
              >
                <Plus size={15} strokeWidth={2.2} />
              </Button>
            </Tooltip>
          </NavbarItem>
        ) : (
          <>
            {canAdd && (
              <NavbarItem className="flex items-center mr-1">
                <Tooltip content={t('addAccount')} delay={300} closeDelay={0} disableAnimation>
                  <Button
                    id="add-account-btn"
                    isIconOnly
                    size="sm"
                    color="primary"
                    variant="flat"
                    aria-label={t('addAccount')}
                    onPress={onAddOpen}
                    className="w-7 h-7 min-w-7"
                  >
                    <Plus size={15} strokeWidth={2.2} />
                  </Button>
                </Tooltip>
              </NavbarItem>
            )}

            <NavbarItem className="flex items-center mr-1">
              <Tooltip content={t('groupManagement')} delay={300} closeDelay={0} disableAnimation>
                <Button
                  id="groups-btn"
                  isIconOnly
                  size="sm"
                  variant="light"
                  aria-label={t('groupManagement')}
                  onPress={onGroupsOpen}
                  className="w-7 h-7 min-w-7 text-default-600"
                >
                  <FolderCog size={15} />
                </Button>
              </Tooltip>
            </NavbarItem>
          </>
        )}

        <Divider orientation="vertical" className="h-4 mx-1" />

        <NavbarItem className="h-full">
          <Button
            isIconOnly
            size="sm"
            radius="none"
            variant="light"
            aria-label={t('minimize')}
            onPress={handleMinimize}
            className="w-11 h-full min-w-11 text-default-600 data-[hover=true]:bg-default-200/70"
          >
            <Minus size={13} strokeWidth={1.75} />
          </Button>
        </NavbarItem>

        <NavbarItem className="h-full">
          <Button
            isIconOnly
            size="sm"
            radius="none"
            variant="light"
            aria-label={t('close')}
            onPress={handleClose}
            className="w-11 h-full min-w-11 text-default-600 data-[hover=true]:bg-danger data-[hover=true]:text-white"
          >
            <X size={14} strokeWidth={1.75} />
          </Button>
        </NavbarItem>
      </NavbarContent>
    </Navbar>
  );
};
