import { Section, Table } from "@react-email/components";
import { emailTokens as T } from "../tokens";
import { InfoRow } from "./InfoRow";

export interface SummaryRow {
  label: string;
  value: string;
  valueColor?: string;
}

/** The structured order/ticket summary block — a bordered table of
 *  InfoRows, used on purchase, resale, and refund emails alike. */
export function TicketSummary({ rows }: { rows: SummaryRow[] }) {
  return (
    <Section style={{ margin: "22px 0", background: T.cardBg, border: `1px solid ${T.border}`, padding: "4px 18px" }}>
      <Table style={{ width: "100%" }}>
        <tbody>
          {rows.map((r) => (
            <InfoRow key={r.label} label={r.label} value={r.value} valueColor={r.valueColor} />
          ))}
        </tbody>
      </Table>
    </Section>
  );
}
