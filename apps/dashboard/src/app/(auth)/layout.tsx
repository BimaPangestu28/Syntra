export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 bg-grid opacity-30" />
      <div className="fixed top-1/4 left-1/4 w-[400px] h-[400px] bg-white/10 rounded-full blur-[100px]" />
      <div className="fixed bottom-1/4 right-1/4 w-[300px] h-[300px] bg-white/10 rounded-full blur-[100px]" />

      <div className="relative w-full max-w-md p-8">
        {children}
      </div>
    </div>
  );
}
