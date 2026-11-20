import React from 'react';
import {
  Card,
  CardBody,
  User,
} from '@heroui/react';
import { Account } from '../types';
import { brandIconUrl, resolveBrand } from '../brandIcons';

interface AccountCardProps {
  account: Account;
  isCopied?: boolean;
  onCopy: (account: Account) => void;
  onContextMenu: (e: React.MouseEvent, account: Account) => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  isCopied = false,
  onCopy,
  onContextMenu,
}) => {
  const formattedCode =
    account.code.length === 6
      ? `${account.code.slice(0, 3)} ${account.code.slice(3)}`
      : account.code.length === 8
      ? `${account.code.slice(0, 4)} ${account.code.slice(4)}`
      : account.code;

  const brand = resolveBrand(account.issuer, account.account);
  const initials = account.issuer.trim().slice(0, 2).toUpperCase() || '2F';

  return (
    <Card
      isPressable
      disableRipple
      radius="lg"
      shadow="none"
      onPress={() => onCopy(account)}
      onContextMenu={(e) => onContextMenu(e, account)}
      className="w-full border border-default-200 bg-content1 shadow-[0_1px_2px_rgba(17,24,28,0.05)] hover:border-primary hover:shadow-[0_6px_16px_rgba(79,70,229,0.10)] data-[pressed=true]:scale-100 data-[pressed=true]:bg-default-50 transition-[border-color,box-shadow,background-color] duration-150 cursor-grab active:cursor-grabbing"
    >
      <CardBody className="px-3.5 py-3 flex flex-row items-center justify-between gap-3">
        <User
          name={account.issuer}
          description={account.account}
          avatarProps={{
            name: initials,
            getInitials: () => initials,
            src: brand ? brandIconUrl(brand.slug) : undefined,
            size: 'sm',
            showFallback: true,
            disableAnimation: true,
            'aria-hidden': true,
            imgProps: { draggable: false },
            className: `w-9 h-9 text-[11px] font-semibold flex-shrink-0${
              brand ? ' border border-default-200 bg-white' : ''
            }`,
            classNames: { img: 'object-contain p-1.5 pointer-events-none' },
          }}
          classNames={{
            base: 'min-w-0 flex-1 justify-start',
            wrapper: 'min-w-0',
            name: 'font-semibold text-sm text-foreground leading-5 truncate block',
            description: 'text-xs text-default-600 leading-4 truncate block',
          }}
        />

        <span
          className={`otp-code flex-shrink-0 transition-colors ${
            isCopied ? 'text-success' : 'text-primary'
          }`}
        >
          {formattedCode}
        </span>
      </CardBody>
    </Card>
  );
};
