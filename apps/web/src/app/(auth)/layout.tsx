export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #163134 0%, #0d2427 60%, #122a2d 100%)",
      }}
    >
      {/* subtle decorative ring */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 80%, rgba(6,203,63,0.06) 0%, transparent 50%), " +
            "radial-gradient(circle at 80% 20%, rgba(6,203,63,0.04) 0%, transparent 50%)",
        }}
      />
      <div className="relative z-10 w-full flex justify-center">
        {children}
      </div>
    </div>
  );
}
