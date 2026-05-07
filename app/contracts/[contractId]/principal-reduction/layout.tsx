export const metadata = {
  title: 'ลดเงินต้น',
  description: 'ดำเนินการลดเงินต้นสัญญาสินเชื่อ',
};

export default function PrincipalReductionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background-white">
      {children}
    </div>
  );
}
