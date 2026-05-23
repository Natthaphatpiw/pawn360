'use client';

import { useState } from 'react';
import PinModal from '@/components/PinModal';
import type { PinRole } from '@/lib/security/pin';

type PreviewMode = 'verify' | 'setup' | 'reset';

const GROUPS: Array<{
  role: PinRole;
  label: string;
  wrapperClassName: string;
  subtitle: string;
}> = [
  {
    role: 'PAWNER',
    label: 'Pawner',
    wrapperClassName: 'theme-web page-pawner',
    subtitle: 'Default primary / orange theme',
  },
  {
    role: 'INVESTOR',
    label: 'Investor',
    wrapperClassName: 'theme-liff theme-investor page-investor',
    subtitle: 'S2 / blue theme',
  },
  {
    role: 'DROP_POINT',
    label: 'Drop Point',
    wrapperClassName: 'theme-liff theme-droppoint page-droppoint',
    subtitle: 'S3 / green theme',
  },
];

function PinModalPreviewCard({
  role,
  label,
  subtitle,
  wrapperClassName,
}: {
  role: PinRole;
  label: string;
  subtitle: string;
  wrapperClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PreviewMode>('verify');

  const openPreview = (nextMode: PreviewMode) => {
    setMode(nextMode);
    setOpen(true);
  };

  return (
    <div className={wrapperClassName}>
      <div className="register-shell w-full rounded-[28px] p-4">
        <div className="register-inner-card rounded-2xl p-4">
          <div className="register-pill inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]">
            {label}
          </div>
          <h2 className="register-heading mt-3 text-xl font-semibold">PIN Modal Preview</h2>
          <p className="register-subtle mt-1 text-sm">{subtitle}</p>

          <div className="mt-4 grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => openPreview('verify')}
              className="register-primary-btn w-full rounded-full py-3 text-sm font-medium"
            >
              Preview Verify
            </button>
            <button
              type="button"
              onClick={() => openPreview('setup')}
              className="register-secondary-btn w-full rounded-full py-3 text-sm font-medium"
            >
              Preview Setup
            </button>
            <button
              type="button"
              onClick={() => openPreview('reset')}
              className="register-outline-btn w-full rounded-full py-3 text-sm font-medium"
            >
              Preview Reset
            </button>
          </div>
        </div>
      </div>

      <PinModal
        open={open}
        role={role}
        lineId={`preview-${role.toLowerCase()}`}
        onClose={() => setOpen(false)}
        onVerified={() => setOpen(false)}
        initialMode={mode}
        previewMode
      />
    </div>
  );
}

export default function PinModalPreviewPage() {
  return (
    <div className="min-h-screen bg-background-white px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-[28px] border border-line-soft bg-background-white p-5 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-foreground-subtle">Component Preview</div>
          <h1 className="mt-3 text-3xl font-semibold text-foreground">PIN Modal by User Group</h1>
          <p className="mt-2 text-sm text-foreground-subtle">
            ใช้หน้านี้สำหรับดู PIN modal UI เดียวกันภายใต้สีของแต่ละกลุ่มผู้ใช้งาน
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {GROUPS.map((group) => (
            <PinModalPreviewCard
              key={group.role}
              role={group.role}
              label={group.label}
              subtitle={group.subtitle}
              wrapperClassName={group.wrapperClassName}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
