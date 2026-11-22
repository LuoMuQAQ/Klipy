import React, { useEffect, useState } from 'react';
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
  onKeyboardContextMenu?: (rect: DOMRect, account: Account) => void;
  onMove?: (account: Account, delta: -1 | 1) => void;
}

const CustomPeriodCountdown: React.FC<{ period: number }> = ({ period }) => {
  const computeRemaining = () => period - (Math.floor(Date.now() / 1000) % period);
  const [remaining, setRemaining] = useState(computeRemaining);

  useEffect(() => {
    let timer: number;
    const schedule = () => {
      setRemaining(computeRemaining());
      const now = Date.now();
      timer = window.setTimeout(schedule, 1000 - (now % 1000));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [period]);

  const dangerThreshold = Math.min(5, Math.max(1, Math.floor(period / 4)));
  const warnThreshold = Math.min(10, Math.max(2, Math.floor(period / 3)));
  const colorClass =
    remaining <= dangerThreshold
      ? 'text-danger'
      : remaining <= warnThreshold
      ? 'text-warning'
      : 'text-default-400';

  return (
    <span
      data-slot="custom-period"
      aria-label={`周期 ${period} 秒，剩余 ${remaining} 秒`}
      className={`text-[10px] leading-none font-medium tabular-nums ${colorClass}`}
    >
      {remaining}s / {period}s
    </span>
  );
};

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  isCopied = false,
  onCopy,
  onContextMenu,
  onKeyboardContextMenu,
  onMove,
}) => {
  const formattedCode =
    account.code.length === 6
      ? `${account.code.slice(0, 3)} ${account.code.slice(3)}`
      : account.code.length === 8
      ? `${account.code.slice(0, 4)} ${account.code.slice(4)}`
      : account.code;

  const brand = resolveBrand(account.issuer, account.account);
  const initials = account.issuer.trim().slice(0, 2).toUpperCase() || '2F';
  const hasCustomPeriod = account.period !== 30;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      onKeyboardContextMenu?.(e.currentTarget.getBoundingClientRect(), account);
    } else if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      onMove?.(account, -1);
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      onMove?.(account, 1);
    }
  };

  return (
    <Card
      isPressable
      disableRipple
      radius="lg"
      shadow="none"
      onPress={() => onCopy(account)}
      onContextMenu={(e) => onContextMenu(e, account)}
      onKeyDown={handleKeyDown}
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

        {hasCustomPeriod ? (
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span
              className={`otp-code transition-colors ${
                isCopied ? 'text-success' : 'text-primary'
              }`}
            >
              {formattedCode}
            </span>
            <CustomPeriodCountdown period={account.period} />
          </div>
        ) : (
          <span
            className={`otp-code flex-shrink-0 transition-colors ${
              isCopied ? 'text-success' : 'text-primary'
            }`}
          >
            {formattedCode}
          </span>
        )}
      </CardBody>
    </Card>
  );
};
