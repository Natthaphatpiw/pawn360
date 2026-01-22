export const metadata = {
  title: 'ลดเงินต้น',
  description: 'ดำเนินการลดเงินต้นสัญญาจำนำ',
};

export default function PrincipalReductionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F2F2F2]">
      {children}
    </div>
  );
}
