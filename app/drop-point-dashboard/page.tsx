'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLiff } from '@/lib/liff/liff-provider';
import axios from 'axios';
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Package,
  PackageCheck,
  PieChart,
  RotateCcw,
  Warehouse,
} from 'lucide-react';
import {
  DropPointLoadingScreen,
  DropPointMessageState,
  DropPointStatusBadge,
} from '@/components/drop-point/ui';
import {
  getMockDropPointDashboard,
  isDropPointMockEnabled,
  type MockDropPointDashboard,
  type MockDropPointDashboardCategory,
} from '@/lib/mock-drop-point';

type ContractListItem = {
  statusGroup?: 'WAITING_DRIVER' | 'INCOMING' | 'ARRIVED' | 'UNKNOWN';
  items?: {
    item_type?: string;
    brand?: string;
  };
};

type DropPointContractsResponse = {
  dropPoint?: {
    drop_point_name?: string;
    drop_point_code?: string;
    phone_number?: string;
  };
  contracts?: ContractListItem[];
};

function formatCurrency(amount: number) {
  return `${amount.toLocaleString('th-TH')} บาท`;
}

function formatDecimal(value: number, digits = 1) {
  return value.toLocaleString('th-TH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function buildTypeBreakdownFromContracts(contracts: ContractListItem[], fallback: MockDropPointDashboardCategory[]) {
  const colorMap = new Map(fallback.map((item) => [item.label, item.color]));
  const counts = new Map<string, number>();

  contracts.forEach((contract) => {
    const label = contract.items?.item_type || contract.items?.brand || 'อื่นๆ';
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  if (counts.size === 0) return fallback;

  return Array.from(counts.entries())
    .map(([label, count], index) => ({
      key: `${label}-${index}`,
      label,
      count,
      color: colorMap.get(label) || `var(--register-chart-${Math.min(index + 1, 5)})`,
    }))
    .sort((a, b) => b.count - a.count);
}

function DonutBreakdownChart({
  categories,
  centerValue,
  centerLabel,
}: {
  categories: MockDropPointDashboardCategory[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = categories.reduce((sum, category) => sum + category.count, 0);
  const size = 120;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = circumference * 0.018;
  let cursor = 0;

  const segments = categories.map((category) => {
    const rawLength = total > 0 ? (category.count / total) * circumference : 0;
    const segmentLength = Math.max(rawLength - gap, 0);
    const dashArray = `${segmentLength} ${circumference}`;
    const dashOffset = -cursor;
    cursor += rawLength;

    return {
      ...category,
      dashArray,
      dashOffset,
    };
  });

  return (
    <div className="relative h-[120px] w-[120px] shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--register-ring-track)"
          strokeWidth={strokeWidth}
        />
        {[...segments].reverse().map((category) => (
          <circle
            key={category.key}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={category.color}
            strokeWidth={strokeWidth}
            strokeDasharray={category.dashArray}
            strokeDashoffset={category.dashOffset}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-background-white">
        <span className="register-accent text-xl font-semibold">{centerValue}</span>
        <span className="text-[10px] leading-tight text-foreground-subtle text-center">{centerLabel}</span>
      </div>
    </div>
  );
}

function AnalyticsDonutCard({
  title,
  subtitle,
  categories,
  centerValue,
  centerLabel,
}: {
  title: string;
  subtitle: string;
  categories: MockDropPointDashboardCategory[];
  centerValue: string;
  centerLabel: string;
}) {
  const total = categories.reduce((sum, category) => sum + category.count, 0);

  return (
    <div className="register-surface-strong w-full rounded-3xl p-4 text-center">
      <h2 className="text-lg font-medium text-foreground-muted">{title}</h2>
      <div className="text-xs text-foreground-subtle">{subtitle}</div>

      <div className="mt-4 rounded-2xl bg-background-white p-4 text-left">
        <div className="flex items-center gap-4">
          <DonutBreakdownChart categories={categories} centerValue={centerValue} centerLabel={centerLabel} />
          <div className="min-w-0 flex-1">
            <div className="register-accent-soft text-[11px] uppercase tracking-[0.16em]">Total</div>
            <div className="register-accent mt-1 text-2xl font-medium">{total.toLocaleString('th-TH')}</div>
            <div className="text-xs text-foreground-subtle">แยกตามประเภทสินค้า</div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {categories.map((category) => {
            const percentage = total > 0 ? (category.count / total) * 100 : 0;

            return (
              <div key={category.key} className="register-surface-muted flex items-center justify-between rounded-2xl px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                  <span className="truncate text-sm text-foreground-muted">{category.label}</span>
                </div>
                <div className="text-right">
                  <div className="register-accent text-sm font-medium">{category.count.toLocaleString('th-TH')} ชิ้น</div>
                  <div className="text-[11px] text-foreground-subtle">{percentage.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DropPointDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, isLoading: liffLoading } = useLiff();
  const previewMode = isDropPointMockEnabled(searchParams);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<MockDropPointDashboard | null>(null);

  useEffect(() => {
    const load = async () => {
      const mockDashboard = getMockDropPointDashboard();

      if (previewMode) {
        setDashboard(mockDashboard);
        setLoading(false);
        return;
      }

      if (liffLoading || !profile?.userId) return;

      try {
        setLoading(true);
        setError(null);

        const response = await axios.get<DropPointContractsResponse>(`/api/drop-points/contracts/${profile.userId}`);
        const contracts = response.data.contracts || [];
        const currentInventoryContracts = contracts.filter((contract) => contract.statusGroup === 'ARRIVED');
        const currentInventoryByType = buildTypeBreakdownFromContracts(
          currentInventoryContracts,
          mockDashboard.currentInventoryByType
        );
        const allTimeItemsByType = buildTypeBreakdownFromContracts(
          contracts,
          mockDashboard.allTimeItemsByType
        );

        setDashboard({
          ...mockDashboard,
          dropPoint: {
            ...mockDashboard.dropPoint,
            drop_point_name: response.data.dropPoint?.drop_point_name || mockDashboard.dropPoint.drop_point_name,
            drop_point_code: response.data.dropPoint?.drop_point_code || mockDashboard.dropPoint.drop_point_code,
            phone_number: response.data.dropPoint?.phone_number || mockDashboard.dropPoint.phone_number,
          },
          currentInventoryCount: currentInventoryContracts.length || mockDashboard.currentInventoryCount,
          currentInventoryByType,
          allTimeItemsCount: contracts.length || mockDashboard.allTimeItemsCount,
          allTimeItemsByType,
          operations: {
            ...mockDashboard.operations,
            waitingDriver: contracts.filter((contract) => contract.statusGroup === 'WAITING_DRIVER').length || mockDashboard.operations.waitingDriver,
            incoming: contracts.filter((contract) => contract.statusGroup === 'INCOMING').length || mockDashboard.operations.incoming,
            waitingVerification: currentInventoryContracts.length || mockDashboard.operations.waitingVerification,
            storageBoxesUsed: currentInventoryContracts.length || mockDashboard.operations.storageBoxesUsed,
          },
        });
      } catch (fetchError: any) {
        setDashboard(mockDashboard);
        setError(fetchError.response?.data?.error || null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [previewMode, liffLoading, profile?.userId]);

  const storageUsagePercent = useMemo(() => {
    if (!dashboard) return 0;
    return dashboard.operations.storageBoxesTotal > 0
      ? Math.round((dashboard.operations.storageBoxesUsed / dashboard.operations.storageBoxesTotal) * 100)
      : 0;
  }, [dashboard]);

  if ((liffLoading && !previewMode) || loading) return <DropPointLoadingScreen />;
  if (!dashboard) return <DropPointMessageState title="ไม่พบข้อมูล Dashboard" description={error || 'กรุณาลองใหม่อีกครั้ง'} />;

  return (
    <div className="min-h-screen bg-background-white font-sans p-4 flex flex-col items-center pb-8 text-foreground">
      <div className="register-shell w-full max-w-sm my-3 rounded-[28px]">
        <div className="register-pill mt-4 ml-4 inline-flex rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]">
          {previewMode ? 'Preview Mode' : 'Drop Point Dashboard'}
        </div>
        <div className="register-inner-card mx-4 mt-4 rounded-2xl p-4 text-center">
          <p className="text-2xl font-medium text-foreground">Dashboard</p>
          <p className="mt-1 text-sm font-light text-foreground-muted">{dashboard.dropPoint.drop_point_name}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <DropPointStatusBadge tone="neutral">{dashboard.dropPoint.drop_point_code}</DropPointStatusBadge>
            <DropPointStatusBadge tone="success">ใช้งานกล่อง {storageUsagePercent}%</DropPointStatusBadge>
          </div>
        </div>
        <div className="register-inner-card mx-4 mb-4 mt-3 rounded-2xl p-4 text-center">
          <div className="grid grid-cols-3 gap-2 divide-x divide-s3-border text-center">
            <div className="px-2">
              <div className="mb-1 text-2xl font-bold text-foreground-muted">{dashboard.operations.waitingDriver}</div>
              <div className="text-xs font-medium text-foreground-muted">รอเรียกรถ</div>
            </div>
            <div className="px-2">
              <div className="mb-1 text-2xl font-bold text-foreground-muted">{dashboard.operations.incoming}</div>
              <div className="text-xs font-medium text-foreground-muted">กำลังขนส่ง</div>
            </div>
            <div className="px-2">
              <div className="mb-1 text-2xl font-bold text-foreground-muted">{dashboard.operations.waitingVerification}</div>
              <div className="text-xs font-medium text-foreground-muted">รอตรวจสอบ</div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-3">
        {error ? (
          <div className="register-status-warning rounded-2xl p-3 text-sm">
            แสดงผลด้วยข้อมูลสำรองบางส่วนระหว่างรอเชื่อมต่อ analytics จริง
          </div>
        ) : null}

        <div className="register-surface-strong w-full rounded-3xl p-4 text-center">
          <h2 className="text-lg font-medium text-foreground-muted">ภาพรวมสาขา</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-background-white p-4 text-left">
              <div className="mb-2 flex items-center gap-2">
                <Warehouse className="h-4 w-4 register-accent" />
                <span className="text-sm font-medium text-foreground-muted">สินค้าในร้านปัจจุบัน</span>
              </div>
              <div className="register-accent text-3xl font-medium">{dashboard.currentInventoryCount}</div>
              <div className="text-xs text-foreground-subtle">พร้อมดูแลในสาขาตอนนี้</div>
            </div>

            <div className="rounded-2xl bg-background-white p-4 text-left">
              <div className="mb-2 flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 register-accent" />
                <span className="text-sm font-medium text-foreground-muted">รายได้เดือนนี้</span>
              </div>
              <div className="register-accent text-xl font-medium">{formatCurrency(dashboard.currentMonth.revenue)}</div>
              <div className="text-xs text-foreground-subtle">คาดการณ์จากค่าบริการและค่าฝาก</div>
            </div>
          </div>
        </div>

        <AnalyticsDonutCard
          title="สินค้าในร้านปัจจุบัน"
          subtitle="ภาพรวมสินค้าที่อยู่ใน Drop Point ขณะนี้"
          categories={dashboard.currentInventoryByType}
          centerValue={dashboard.currentInventoryCount.toLocaleString('th-TH')}
          centerLabel="Current items"
        />

        <div className="register-surface-strong w-full rounded-3xl p-3 text-center">
          <h2 className="text-lg font-medium text-foreground-muted">ข้อมูลสะสม</h2>
          <div className="mt-4 rounded-2xl bg-background-white p-4">
            <div className="mb-3 flex items-center justify-center gap-2">
              <PieChart className="h-4 w-4 register-accent" />
              <span className="text-sm font-medium text-foreground-muted">ภาพรวมสะสมตั้งแต่เปิดใช้งาน</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">ระยะเวลาเฉลี่ย</div>
              <div className="register-accent mt-1 text-2xl font-semibold">{formatDecimal(dashboard.cumulative.avgHoldingDays)} วัน</div>
              </div>
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">สินค้าส่งคืน</div>
              <div className="register-accent mt-1 text-2xl font-semibold">{dashboard.cumulative.returnedItems.toLocaleString('th-TH')} ชิ้น</div>
              </div>
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">ตรวจรับแล้วทั้งหมด</div>
              <div className="register-accent mt-1 text-2xl font-semibold">{dashboard.cumulative.verifiedItems.toLocaleString('th-TH')} ชิ้น</div>
              </div>
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">รายได้สะสม</div>
              <div className="register-accent mt-1 text-2xl font-semibold">{formatCurrency(dashboard.cumulative.totalRevenue)}</div>
              </div>
            </div>
          </div>
        </div>

        <AnalyticsDonutCard
          title="สินค้าทั้งหมด"
          subtitle="สัดส่วนประเภทสินค้าสะสมที่ Drop Point เคยรับเข้า"
          categories={dashboard.allTimeItemsByType}
          centerValue={dashboard.allTimeItemsCount.toLocaleString('th-TH')}
          centerLabel="All items"
        />

        <div className="register-surface-strong w-full rounded-3xl p-3 text-center">
          <h2 className="text-lg font-medium text-foreground-muted">ข้อมูลเดือนปัจจุบัน</h2>
          <div className="mt-4 rounded-2xl bg-background-white p-4">
            <div className="mb-3 flex items-center justify-center gap-2">
              <CalendarClock className="h-4 w-4 register-accent" />
              <span className="text-sm font-medium text-foreground-muted">ตัวเลขสำคัญของเดือนนี้</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">รายได้</div>
              <div className="register-accent mt-1 text-2xl font-semibold">{formatCurrency(dashboard.currentMonth.revenue)}</div>
              </div>
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">สินค้ารอขาย</div>
              <div className="register-accent mt-1 text-2xl font-semibold">{dashboard.currentMonth.pendingSaleItems.toLocaleString('th-TH')} ชิ้น</div>
              </div>
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">รับเข้าเดือนนี้</div>
              <div className="register-accent mt-1 text-2xl font-semibold">{dashboard.currentMonth.receivedItems.toLocaleString('th-TH')} ชิ้น</div>
              </div>
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">เฉลี่ยตรวจรับ</div>
              <div className="register-accent mt-1 text-2xl font-semibold">{formatDecimal(dashboard.currentMonth.avgVerificationDays)} วัน</div>
              </div>
            </div>
          </div>
        </div>

        <div className="register-surface-strong w-full rounded-3xl p-3 text-center">
          <h2 className="text-lg font-medium text-foreground-muted">สถานะปฏิบัติการ</h2>
          <div className="mt-4 rounded-2xl bg-background-white p-4">
            <div className="mb-3 flex items-center justify-center gap-2">
              <PackageCheck className="h-4 w-4 register-accent" />
              <span className="text-sm font-medium text-foreground-muted">รายการที่ต้องติดตาม</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">รอเรียกรถ</div>
              <div className="register-accent mt-1 text-2xl font-semibold">{dashboard.operations.waitingDriver.toLocaleString('th-TH')} รายการ</div>
              </div>
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">กำลังขนส่ง</div>
              <div className="register-accent mt-1 text-2xl font-semibold">{dashboard.operations.incoming.toLocaleString('th-TH')} รายการ</div>
              </div>
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">รอตรวจสอบ</div>
              <div className="register-accent mt-1 text-2xl font-semibold">{dashboard.operations.waitingVerification.toLocaleString('th-TH')} ชิ้น</div>
              </div>
              <div className="register-surface-muted rounded-2xl px-4 py-4 text-left">
              <div className="text-xs text-foreground-subtle">การใช้งานกล่อง</div>
              <div className="register-accent mt-1 text-2xl font-semibold">
                {dashboard.operations.storageBoxesUsed}/{dashboard.operations.storageBoxesTotal}
              </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-4">
          <div className="register-surface-strong w-full rounded-3xl p-3">
            <div className="mb-3 flex items-center gap-2">
              <Package className="h-4 w-4 register-accent" />
              <span className="register-heading text-sm font-semibold">ทางลัดการทำงาน</span>
            </div>
            <div className="space-y-2">
            <button
              onClick={() => router.push(previewMode ? '/drop-point?mock=1' : '/drop-point')}
              className="register-outline-btn flex w-full items-center justify-between rounded-full px-4 py-3 text-sm font-medium"
            >
              <span>กลับหน้ารายการรับฝาก</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => router.push(previewMode ? '/drop-point-history?mock=1' : '/drop-point-history')}
              className="register-secondary-btn flex w-full items-center justify-between rounded-full px-4 py-3 text-sm font-medium"
            >
              <span>ดูประวัติ</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => router.push(previewMode ? '/drop-point-returns?mock=1' : '/drop-point-returns')}
              className="register-primary-btn flex w-full items-center justify-between rounded-full px-4 py-3 text-sm font-medium"
            >
              <span>ดูรายการส่งคืน</span>
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DropPointDashboardPage() {
  return (
    <Suspense fallback={<DropPointLoadingScreen />}>
      <DropPointDashboardContent />
    </Suspense>
  );
}
