import { Section, Text } from "@react-email/components";
import { emailTokens as T } from "../tokens";

/** Monospace code display — the OTP alternative under every auth link. */
export function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <Section style={{ margin: "18px 0", background: T.bodyBg, border: `1px solid ${T.border}`, padding: "14px 18px" }}>
      <Text style={{ margin: "0 0 4px", fontFamily: T.fontBody, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textMuted }}>
        {label}
      </Text>
      <Text style={{ margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 20, fontWeight: 700, letterSpacing: "0.08em", color: T.textPrimary }}>
        {code}
      </Text>
    </Section>
  );
}
