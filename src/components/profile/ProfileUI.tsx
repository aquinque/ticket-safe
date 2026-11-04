import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Building blocks of the profile page, in the language of the mobile menu and My Wallet: the site's
 * background, 1px brand-200/25 borders, square corners, small-caps eyebrows in brand-200, quiet
 * rounded chips and arrows in a thin circle. Every target is at least 44px tall.
 */

export const eyebrow = "text-[11px] font-bold uppercase tracking-[0.18em] text-brand-200";

const CHIP_TONE = {
  neutral: "border-border text-muted-foreground",
  accent: "border-brand-200/40 text-brand-200",
  good: "border-success/40 text-success",
} as const;

export const Chip = ({ tone = "neutral", children }: { tone?: keyof typeof CHIP_TONE; children: React.ReactNode }) => (
  <span className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[12px] font-semibold whitespace-nowrap ${CHIP_TONE[tone]}`}>
    {children}
  </span>
);

/**
 * A numbered section: "01" and its title in display type above a card of rows. The card sits one
 * step above the page (card surface at low opacity) so the rows read as one group.
 */
export const Section = ({
  id,
  index,
  title,
  description,
  delay = 0,
  children,
}: {
  id: string;
  index?: string;
  title: string;
  description?: string;
  delay?: number;
  children: React.ReactNode;
}) => (
  <section aria-labelledby={id} className="menu-rise" style={{ animationDelay: `${delay}ms` }}>
    <div className="mb-3 flex items-baseline gap-3">
      {index && (
        <span className="font-display text-[13px] font-bold tabular-nums text-brand-200" aria-hidden="true">
          {index}
        </span>
      )}
      <h2 id={id} className="font-display text-[22px] sm:text-[24px] font-bold tracking-[-0.02em] leading-tight">
        {title}
      </h2>
    </div>
    {description && <p className="-mt-1.5 mb-3 text-[14px] leading-snug text-muted-foreground">{description}</p>}
    <div className="border border-brand-200/20 bg-card/30 px-4 sm:px-5 divide-y divide-border/50">{children}</div>
  </section>
);

/** The thin-circled icon at the start of a row. */
export const RowIcon = ({ icon: Icon, tone = "default" }: { icon: LucideIcon; tone?: "default" | "danger" }) => (
  <span
    className={`w-10 h-10 shrink-0 rounded-full border inline-flex items-center justify-center ${
      tone === "danger" ? "border-destructive/40 text-destructive" : "border-brand-200/25 text-brand-200"
    }`}
    aria-hidden="true"
  >
    <Icon className="w-[18px] h-[18px]" strokeWidth={1.6} />
  </span>
);

/** The quiet text action at the end of a row ("Edit", "Change"). */
export const RowAction = ({
  onClick,
  children,
  label,
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="-mr-2 shrink-0 min-h-[44px] min-w-[44px] px-2 text-[14px] font-semibold text-brand-200 hover:text-foreground transition-colors disabled:opacity-50"
  >
    {children}
  </button>
);

/** One "label / value / action" line. */
export const Row = ({
  label,
  value,
  hint,
  action,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) => (
  <div className="flex items-center gap-3.5 py-3.5 min-h-[72px]">
    {icon && <RowIcon icon={icon} />}
    <div className="min-w-0 flex-1">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold leading-snug break-words">{value}</div>
      {hint && <div className="mt-1 text-[13px] leading-snug text-muted-foreground">{hint}</div>}
    </div>
    {action}
  </div>
);

/** A row that leads somewhere: the whole line is the target, ending in an arrow in a thin circle. */
export const LinkRow = ({
  to,
  onClick,
  label,
  detail,
  busy,
  tone = "default",
  icon,
}: {
  to?: string;
  onClick?: () => void;
  label: string;
  detail?: React.ReactNode;
  busy?: boolean;
  tone?: "default" | "danger";
  icon?: LucideIcon;
}) => {
  const body = (
    <>
      {icon && <RowIcon icon={icon} tone={tone} />}
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold leading-snug ${tone === "danger" ? "text-destructive" : ""}`}>{label}</span>
        {detail && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{detail}</span>}
      </span>
      {tone === "danger" ? null : (
        <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 text-muted-foreground transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-[18px] h-[18px]" strokeWidth={1.5} />}
        </span>
      )}
    </>
  );
  const cls =
    "group w-full flex items-center gap-3.5 py-3.5 min-h-[72px] text-left transition-[opacity,transform] active:scale-[0.99] active:opacity-90 disabled:opacity-60";
  if (to) {
    return (
      <Link to={to} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={busy} className={cls}>
      {body}
    </button>
  );
};

/** Save + Cancel under an inline form. Save is the screen's one solid blue button while a form is open. */
export const FormActions = ({ saving, onCancel, saveLabel, savingLabel, cancelLabel }: { saving: boolean; onCancel: () => void; saveLabel: string; savingLabel: string; cancelLabel: string }) => (
  <div className="mt-4 flex items-center gap-2">
    <Button type="submit" variant="primary" disabled={saving} className="min-h-[44px] px-5 gap-2">
      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
      {saving ? savingLabel : saveLabel}
    </Button>
    <Button type="button" variant="ghost" onClick={onCancel} disabled={saving} className="min-h-[44px] px-4">
      {cancelLabel}
    </Button>
  </div>
);

export const FieldError = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <p id={id} role="alert" className="mt-2 text-[13px] leading-snug text-destructive">
    {children}
  </p>
);

/**
 * A row whose value is edited in place: the row turns into a small form (input, inline error,
 * Save / Cancel). `onSave` returns an error message to show, or null once saved.
 */
export const TextEditRow = ({
  label,
  value,
  display,
  hint,
  editing,
  onEdit,
  onCancel,
  onSave,
  inputType = "text",
  autoComplete,
  maxLength,
  placeholder,
  formHint,
  labels,
  icon,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  display?: React.ReactNode;
  hint?: React.ReactNode;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (draft: string) => Promise<string | null>;
  inputType?: "text" | "email";
  autoComplete?: string;
  maxLength?: number;
  placeholder?: string;
  formHint?: React.ReactNode;
  labels: { edit: string; save: string; saving: string; cancel: string; editLabel: string };
}) => {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      setError(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) {
    return <Row icon={icon} label={label} value={display ?? (value || "—")} hint={hint} action={<RowAction onClick={onEdit} label={labels.editLabel}>{labels.edit}</RowAction>} />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const problem = await onSave(draft);
    setSaving(false);
    if (problem) {
      setError(problem);
      inputRef.current?.focus();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="py-5">
      <label htmlFor={inputId} className="text-[13px] text-muted-foreground">
        {label}
      </label>
      <Input
        ref={inputRef}
        id={inputId}
        type={inputType}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className="mt-1.5 h-12 text-base"
      />
      {error && <FieldError id={errorId}>{error}</FieldError>}
      {formHint && !error && <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{formHint}</p>}
      <FormActions saving={saving} onCancel={onCancel} saveLabel={labels.save} savingLabel={labels.saving} cancelLabel={labels.cancel} />
    </form>
  );
};

/** A row edited by picking one option (gender, campus). Picking saves at once. */
export const ChoiceEditRow = ({
  label,
  value,
  options,
  editing,
  onEdit,
  onCancel,
  onSave,
  labels,
  icon,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (choice: string) => Promise<string | null>;
  labels: { edit: string; cancel: string; editLabel: string; none: string };
}) => {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  const current = options.find((o) => o.value === value)?.label ?? labels.none;

  useEffect(() => {
    if (editing) setError(null);
  }, [editing]);

  if (!editing) {
    return <Row icon={icon} label={label} value={current} action={<RowAction onClick={onEdit} label={labels.editLabel}>{labels.edit}</RowAction>} />;
  }

  const pick = async (choice: string) => {
    if (saving) return;
    setSaving(choice);
    const problem = await onSave(choice);
    setSaving(null);
    if (problem) setError(problem);
  };

  return (
    <div className="py-5" role="group" aria-label={label} aria-describedby={error ? errorId : undefined}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">{label}</span>
        <RowAction onClick={onCancel}>{labels.cancel}</RowAction>
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value || "none"}
              type="button"
              onClick={() => pick(o.value)}
              aria-pressed={active}
              disabled={!!saving}
              className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border text-[14px] font-semibold transition-colors disabled:opacity-60 ${
                active ? "border-brand-200 text-brand-200" : "border-border text-foreground hover:border-brand-200/60"
              }`}
            >
              {saving === o.value && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {o.label}
            </button>
          );
        })}
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
};
