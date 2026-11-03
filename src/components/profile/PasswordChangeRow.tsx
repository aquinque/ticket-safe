import { useEffect, useId, useRef, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { PASSWORD_MAX_LENGTH, authErrorMessage, isResendTooSoon } from "@/lib/authRules";
import { authRedirect } from "@/lib/siteUrl";
import { rememberResetReturn } from "@/lib/resetReturn";
import { FieldError, FormActions, Row, RowAction } from "@/components/profile/ProfileUI";
import { passwordChangeError, passwordRules, type PasswordChange, type PasswordField } from "@/components/profile/profileModel";

/**
 * "Password" row of Sign-in & security. Change asks for the current password (checked by signing in
 * with it, which keeps the person signed in), then the new one twice. Without the current password,
 * a reset link is emailed and brings the person back here.
 */
export const PasswordChangeRow = ({
  email,
  editing,
  onEdit,
  onClose,
}: {
  email: string;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) => {
  const { t } = useI18n();
  const [form, setForm] = useState<PasswordChange>({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<{ field: PasswordField; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [show, setShow] = useState(false);
  const base = useId();
  const ids = { current: `${base}-current`, next: `${base}-next`, confirm: `${base}-confirm` };
  const refs = { current: useRef<HTMLInputElement | null>(null), next: useRef<HTMLInputElement | null>(null), confirm: useRef<HTMLInputElement | null>(null) };

  useEffect(() => {
    if (editing) {
      setForm({ current: "", next: "", confirm: "" });
      setError(null);
      setShow(false);
      requestAnimationFrame(() => refs.current.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (!editing) {
    return (
      <Row
        icon={KeyRound}
        label={t("account.security.password")}
        value={<span aria-label={t("account.security.passwordHidden")}>••••••••••</span>}
        action={<RowAction onClick={onEdit}>{t("account.security.changePassword")}</RowAction>}
      />
    );
  }

  const fail = (field: PasswordField, message: string) => {
    setError({ field, message });
    refs[field].current?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const problem = passwordChangeError(form);
    if (problem) return fail(problem.field, t(problem.message.key, problem.message.params));
    setSaving(true);
    try {
      const { error: wrong } = await supabase.auth.signInWithPassword({ email, password: form.current });
      if (wrong) {
        const code = (wrong as { code?: string }).code;
        const invalid = code === "invalid_credentials" || /invalid login credentials/i.test(wrong.message);
        return fail("current", invalid ? t("account.errors.currentWrong") : authErrorMessage(wrong));
      }
      const { error: refused } = await supabase.auth.updateUser({ password: form.next });
      if (refused) return fail("next", authErrorMessage(refused));
      toast.success(t("account.toast.passwordUpdated"), { description: t("account.toast.passwordUpdatedHint") });
      onClose();
    } catch (err) {
      fail("current", authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const sendResetLink = async () => {
    if (sendingLink) return;
    setSendingLink(true);
    rememberResetReturn("/profile");
    const { error: failed } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirect("/reset-password") });
    setSendingLink(false);
    if (failed && !isResendTooSoon(failed)) {
      toast.error(authErrorMessage(failed));
      return;
    }
    toast.success(t("account.toast.resetSent"), { description: t("account.toast.resetSentHint", { email }) });
  };

  const field = (name: PasswordField, label: string, autoComplete: string) => (
    <div>
      <label htmlFor={ids[name]} className="text-[13px] text-muted-foreground">
        {label}
      </label>
      <Input
        ref={refs[name]}
        id={ids[name]}
        type={show ? "text" : "password"}
        value={form[name]}
        onChange={(e) => {
          setForm((f) => ({ ...f, [name]: e.target.value }));
          if (error) setError(null);
        }}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        autoComplete={autoComplete}
        maxLength={PASSWORD_MAX_LENGTH}
        aria-invalid={error?.field === name}
        aria-describedby={error?.field === name ? `${ids[name]}-error` : undefined}
        className="mt-1.5 h-12 text-base"
      />
      {error?.field === name && <FieldError id={`${ids[name]}-error`}>{error.message}</FieldError>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="py-5 space-y-4">
      {/* Lets password managers attach the new password to the right account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{t("account.security.changePassword")}</span>
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-pressed={show}
          className="-mr-2 inline-flex items-center gap-1.5 min-h-[44px] px-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {show ? t("account.password.hide") : t("account.password.show")}
        </button>
      </div>
      {field("current", t("account.password.current"), "current-password")}
      {field("next", t("account.password.new"), "new-password")}
      {field("confirm", t("account.password.confirm"), "new-password")}
      <ul className="space-y-1" aria-label={t("account.password.rules")}>
        {passwordRules(form.next, form.current, form.confirm).map((r) => (
          <li key={r.label.key} className={`flex items-center gap-2 text-[13px] ${r.ok ? "text-success" : "text-muted-foreground"}`}>
            <span className={`w-4 h-4 rounded-full border inline-flex items-center justify-center ${r.ok ? "border-success" : "border-border"}`} aria-hidden="true">
              {r.ok && <Check className="w-3 h-3" />}
            </span>
            {t(r.label.key, r.label.params)}
            <span className="sr-only">{r.ok ? ` (${t("account.password.ruleMet")})` : ""}</span>
          </li>
        ))}
      </ul>
      <FormActions saving={saving} onCancel={onClose} saveLabel={t("account.password.save")} savingLabel={t("account.common.saving")} cancelLabel={t("account.common.cancel")} />
      <button
        type="button"
        onClick={sendResetLink}
        disabled={sendingLink}
        className="inline-flex items-center gap-2 min-h-[44px] text-[13px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        {sendingLink && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {t("account.password.forgot")}
      </button>
    </form>
  );
};
