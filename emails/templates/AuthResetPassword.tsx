import { Text, Link } from "@react-email/components";
import { Layout } from "../components/Layout";
import { Button } from "../components/Button";
import { CodeBlock } from "../components/CodeBlock";
import { emailTokens as T } from "../tokens";

interface Props {
  name: string;
  link: string;
  otp: string;
}

export default function AuthResetPassword({
  name = "Alex",
  link = "https://ticket-safe.eu/auth/confirm?token_hash=abc123&type=recovery",
  otp = "739104",
}: Props) {
  return (
    <Layout eyebrow="Account · Password reset" title="Reset your password" preheader="Use the secure link to choose a new password.">
      <Text style={{ margin: "0 0 16px" }}>Hi {name},</Text>
      <Text style={{ margin: "0 0 16px" }}>We received a request to reset your Ticket Safe password. Click below to choose a new one.</Text>
      <Button href={link}>Reset my password</Button>
      <Text style={{ margin: "18px 0 0", fontSize: 13, color: T.textMuted }}>
        This link is valid for 1 hour. If you did not request this, ignore this email — your password stays the same.
      </Text>
      <CodeBlock label="6-digit code (alternative)" code={otp} />
      <Text style={{ margin: "18px 0 0", fontSize: 12, color: T.textMuted }}>
        If the button does not work, copy this link into your browser:
        <br />
        <Link href={link} style={{ color: T.textPrimary, wordBreak: "break-all" }}>
          {link}
        </Link>
      </Text>
    </Layout>
  );
}
