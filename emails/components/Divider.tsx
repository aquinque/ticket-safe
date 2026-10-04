import { Hr } from "@react-email/components";
import { emailTokens as T } from "../tokens";

/** Thin horizontal rule — the only separator used anywhere. */
export function Divider() {
  return <Hr style={{ border: "none", borderTop: `1px solid ${T.border}`, margin: "16px 0" }} />;
}
