export function SettingBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-text-muted mb-2">{label}</label>
      {children}
    </div>
  );
}
