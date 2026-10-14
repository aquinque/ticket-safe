/** Segmented filter with counts, used wherever a list can be narrowed. */
export function FilterChips<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={label}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.key)}
            className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 text-xs font-bold rounded-full border transition-colors ${
              on ? "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            {it.label}
            {it.count != null && <span className={`tabular-nums ${on ? "opacity-70" : "opacity-60"}`}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
