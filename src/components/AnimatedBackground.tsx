export default function AnimatedBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div className="absolute inset-0 bg-grid animate-drift-grid opacity-50" />

      <div className="absolute -top-32 -left-24 h-[38rem] w-[38rem] rounded-full bg-accent/20 blur-[130px] animate-float-a" />
      <div className="absolute top-1/3 -right-32 h-[32rem] w-[32rem] rounded-full bg-accent-2/15 blur-[130px] animate-float-b" />
      <div className="absolute -bottom-40 left-1/4 h-[36rem] w-[36rem] rounded-full bg-accent/10 blur-[140px] animate-float-c" />
      <div className="absolute top-1/2 left-1/2 h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-2/10 blur-[150px] animate-float-b" />

      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--background)_85%)]" />
    </div>
  );
}
