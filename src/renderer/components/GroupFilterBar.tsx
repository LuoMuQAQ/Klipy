import { Button, ScrollShadow } from '@heroui/react';
import type { Account, Group } from '../types';

interface GroupFilterBarProps {
  groups: Group[];
  accounts: Account[];
  value: string;
  onChange: (value: string) => void;
}

/** 账号必须属于分组，因此这里只列真实分组，不再有「未分组 / 全部」。 */
export function GroupFilterBar({ groups, accounts, value, onChange }: GroupFilterBarProps) {
  const counts = new Map<string, number>();
  for (const account of accounts) {
    counts.set(account.groupId, (counts.get(account.groupId) ?? 0) + 1);
  }

  return (
    <ScrollShadow
      orientation="horizontal"
      size={12}
      className="flex flex-shrink-0 gap-2 overflow-x-auto px-3 py-2"
    >
      {groups.map((group) => {
        const active = group.id === value;
        const count = counts.get(group.id) ?? 0;
        return (
          <Button
            key={group.id}
            size="sm"
            radius="full"
            variant={active ? 'solid' : 'flat'}
            color={active ? 'primary' : 'default'}
            aria-pressed={active}
            onPress={() => onChange(group.id)}
            className={`h-7 min-w-0 flex-shrink-0 gap-1 px-3 text-xs ${
              active ? 'font-medium' : 'bg-default-100 text-default-600'
            }`}
          >
            <span className="max-w-[110px] truncate">{group.name}</span>
            <span className={`text-[10px] ${active ? 'opacity-80' : 'opacity-60'}`}>{count}</span>
          </Button>
        );
      })}
    </ScrollShadow>
  );
}
