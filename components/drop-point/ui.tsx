'use client';

import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

export function DropPointPageShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`min-h-screen bg-background-white font-sans text-foreground px-4 py-6 ${className}`}>{children}</div>;
}

export function DropPointLoadingScreen() {
  return (
    <div className="min-h-screen bg-background-white flex items-center justify-center page-droppoint">
      <div className="text-center">
        <div className="dot-bricks" />
      </div>
    </div>
  );
}

export function DropPointMessageState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <DropPointPageShell className="flex items-center justify-center p-6">
      <div className="register-shell-strong w-full max-w-md rounded-[30px] p-4">
        <div className="register-inner-card rounded-lg px-5 py-6 text-center">
          <h2 className="register-heading text-xl font-semibold">{title}</h2>
          {description ? <p className="register-subtle mt-2 text-sm">{description}</p> : null}
          {action ? <div className="mt-5">{action}</div> : null}
        </div>
      </div>
    </DropPointPageShell>
  );
}

export function DropPointBackButton({
  onClick,
  label = 'กลับ',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button onClick={onClick} className="register-accent mb-4 inline-flex items-center gap-1 text-sm font-medium">
      <ChevronLeft className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}

export function DropPointCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`bg-s3-soft/45 rounded-xl p-4 border border-s3-border/50 ${className}`}>{children}</div>;
}

export function DropPointHeroCard({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="register-shell rounded-xl p-4">
      <div className="register-inner-card rounded-lg px-4 py-4 shadow-soft">
        {eyebrow ? (
          <div className="register-pill inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="register-heading mt-3 text-2xl font-semibold">{title}</h1>
        {subtitle ? <p className="register-subtle mt-1 text-sm">{subtitle}</p> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>
  );
}

export function DropPointStatusBadge({
  children,
  tone,
  className = '',
}: {
  children: ReactNode;
  tone: Tone;
  className?: string;
}) {
  const toneClassName = tone === 'success'
    ? 'register-status-success'
    : tone === 'warning'
    ? 'register-status-warning'
    : tone === 'danger'
    ? 'register-status-error'
    : 'register-chip-soft';

  return (
    <span className={`${toneClassName} inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}
