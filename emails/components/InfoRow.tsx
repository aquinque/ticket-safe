import { Row, Column, Text } from "@react-email/components";
import { emailTokens as T } from "../tokens";

/** One label/value row — small-caps label + bold value, the pattern used
 *  for every ticket/order detail. Matched exactly in the PDF's info grid. */
export function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <Row style={{ borderTop: `1px solid ${T.border}` }}>
      <Column style={{ padding: "9px 0", width: "42%", verticalAlign: "top" }}>
        <Text style={{ margin: 0, fontFamily: T.fontBody, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.textMuted }}>
          {label}
        </Text>
      </Column>
      <Column style={{ padding: "9px 0", textAlign: "right", verticalAlign: "top" }}>
        <Text style={{ margin: 0, fontFamily: T.fontBody, fontSize: 14, fontWeight: 600, color: valueColor ?? T.textPrimary }}>
          {value}
        </Text>
      </Column>
    </Row>
  );
}
