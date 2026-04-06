export function RangeField({ label, hint, value, min, max, step, display, onChange }: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-text-muted mb-1">
        <span title={hint}>{label}</span>
        <span className="tabular-nums">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent-orange h-1"
      />
    </div>
  );
}
