'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

type ActionTab = 'redeem' | 'interest-payment' | 'principal-reduction' | 'principal-increase';

interface ContractActionTabsProps {
  contractId: string;
  activeTab: ActionTab;
}

const tabs: Array<{ key: ActionTab; label: string; path: string }> = [
  { key: 'redeem', label: 'ไถ่ถอน', path: 'redeem' },
  { key: 'interest-payment', label: 'ต่อดอกเบี้ย', path: 'interest-payment' },
  { key: 'principal-reduction', label: 'ลดเงินต้น', path: 'principal-reduction' },
  { key: 'principal-increase', label: 'เพิ่มเงินต้น', path: 'principal-increase' },
];

export default function ContractActionTabs({ contractId, activeTab }: ContractActionTabsProps) {
  const router = useRouter();

  return (
    <div className="bg-background-white px-4 py-2 shadow-soft">
      <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-2">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => router.push(`/contracts/${contractId}/${tab.path}`)}
              className={`rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-white'
                  : 'bg-background text-foreground-subtle hover:bg-primary-soft'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
