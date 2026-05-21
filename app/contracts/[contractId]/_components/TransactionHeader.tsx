'use client';

import React from 'react';

interface TransactionHeaderProps {
  title: string;
  subtitle: string;
  badge?: string;
  rightSlot?: React.ReactNode;
  wrapperClassName?: string;
}

export default function TransactionHeader({
  title,
  subtitle,
  badge = 'Contract Transaction',
  rightSlot,
  wrapperClassName,
}: TransactionHeaderProps) {
  return (
    <div className={`sticky top-0 z-10 border-b border-background-white/50 px-4 py-3 ${wrapperClassName || 'bg-background-white/10 backdrop-blur-md'}`}>
      <div className="rounded-xl border border-primary-border bg-primary-soft/50 p-4 shadow-[0_14px_30px_rgba(11,59,130,0.08)]">
        <div className="rounded-lg border border-background-white/80 bg-background-white/90 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex rounded-full border border-primary-border bg-background-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary/40">
                {badge}
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-[0.08em] text-primary">{title}</div>
              <p className="mt-1 text-xs text-foreground-subtle">{subtitle}</p>
            </div>
            {rightSlot ? <div>{rightSlot}</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
