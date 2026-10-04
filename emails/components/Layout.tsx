import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Font,
} from "@react-email/components";
import type { ReactNode } from "react";
import { emailTokens as T, legalFooter } from "../tokens";

/**
 * The one shell every Ticket Safe email goes through. Mirrors
 * supabase/functions/_shared/emailComponents.ts's renderEmail() exactly —
 * that file is the hand-ported Deno production renderer; this component
 * is the authoring/preview source of truth for the same design.
 */
export function Layout({
  eyebrow,
  title,
  preheader,
  children,
}: {
  eyebrow: string;
  title: string;
  preheader: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Instrument Sans"
          fallbackFontFamily="Helvetica"
          webFont={{ url: T.googleFontsHref, format: "woff2" }}
          fontWeight={700}
          fontStyle="normal"
        />
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preheader}</Preview>
      <Body style={{ margin: 0, padding: 0, background: T.bodyBg, fontFamily: T.fontBody, color: T.textPrimary }}>
        <Container style={{ maxWidth: T.maxWidth, background: T.cardBg, margin: "32px auto" }}>
          {/* Header — navy band, logo only */}
          <Section style={{ background: T.brandNavy, padding: "22px 32px" }}>
            <Img src={T.logoHeaderUrl} width="150" height="40" alt="Ticket Safe" style={{ display: "block", height: 40, width: "auto" }} />
          </Section>

          {/* Eyebrow + title */}
          <Section style={{ padding: "34px 32px 0" }}>
            <Text style={{ margin: "0 0 10px", fontFamily: T.fontBody, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textMuted }}>
              {eyebrow}
            </Text>
            <Text style={{ margin: "0 0 18px", fontFamily: T.fontHeading, fontSize: 24, lineHeight: "1.25", fontWeight: 700, color: T.textPrimary }}>
              {title}
            </Text>
          </Section>

          {/* Body */}
          <Section style={{ padding: "0 32px 36px", fontFamily: T.fontBody, fontSize: 15, lineHeight: "1.65", color: T.textPrimary }}>
            {children}
          </Section>

          {/* Footer — navy band, legal + support */}
          <Section style={{ background: T.brandNavy, padding: "24px 32px" }}>
            <Text style={{ margin: "0 0 10px", fontFamily: T.fontBody, fontSize: 12, lineHeight: "1.6", color: T.accentLight }}>
              {legalFooter.taglineFr}
            </Text>
            <Text style={{ margin: "0 0 6px", fontFamily: T.fontBody, fontSize: 12, lineHeight: "1.6", color: "#b9c3dc" }}>
              {legalFooter.companyLine}
            </Text>
            <Link href={`mailto:${legalFooter.supportEmail}`} style={{ fontFamily: T.fontBody, fontSize: 12, color: T.accentLight, textDecoration: "underline" }}>
              {legalFooter.supportEmail}
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
