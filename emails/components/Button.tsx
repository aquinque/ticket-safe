import { Button as EmailButton } from "@react-email/components";
import { emailTokens as T } from "../tokens";

/** Primary CTA — solid accent fill, zero radius, one per email. */
export function Button({ href, children }: { href: string; children: string }) {
  return (
    <EmailButton
      href={href}
      style={{
        display: "inline-block",
        marginTop: 28,
        marginBottom: 4,
        padding: "14px 30px",
        background: T.accent,
        color: "#ffffff",
        fontFamily: T.fontBody,
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: "0.01em",
        textDecoration: "none",
      }}
    >
      {children}
    </EmailButton>
  );
}
