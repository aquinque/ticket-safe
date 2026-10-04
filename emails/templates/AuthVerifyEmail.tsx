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

export default function AuthVerifyEmail({
  name = "Alex",
  link = "https://ticket-safe.eu/auth/confirm?token_hash=abc123&type=signup",
  otp = "482913",
}: Props) {
  return (
    <Layout eyebrow="Account · Confirm your email" title="Welcome to Ticket Safe" preheader="Confirm your email to start using Ticket Safe.">
      <Text style={{ margin: "0 0 16px" }}>Hi {name},</Text>
      <Text style={{ margin: "0 0 16px" }}>
        You're one step away from joining the ticket platform built for ESCP students. Confirm your email to activate your account.
      </Text>
      <Button href={link}>Confirm my email</Button>
      <Text style={{ margin: "18px 0 0", fontSize: 13, color: T.textMuted }}>
        This link expires in 24 hours. If you did not sign up, you can safely ignore this email.
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
