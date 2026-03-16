export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Orbital dot */}
      <div className="relative flex items-center justify-center w-7 h-7">
        <div className="absolute inset-0 rounded-full bg-accent-blue/10 animate-orbital" />
        <div className="w-2.5 h-2.5 rounded-full bg-accent-blue shadow-glow-sm" />
      </div>
      {/* Wordmark */}
      <div className="flex items-baseline gap-1">
        <span className="font-display text-base font-bold tracking-tight bg-gradient-to-r from-accent-blue to-accent-violet bg-clip-text text-transparent">
          aiox
        </span>
        <span className="font-display text-base font-light tracking-tight text-text-secondary">
          monitor
        </span>
      </div>
    </div>
  );
}
