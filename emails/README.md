# Ticket Safe — email templates

React Email source for every transactional email, used as the design/preview
tool. **Production emails are not sent from this package** — they're sent
from `supabase/functions/_shared/emailComponents.ts`, a hand-ported Deno
renderer that mirrors these components' output exactly. Deno edge functions
can't run the Node React Email toolchain at request time, so the two are
kept in sync by hand rather than sharing code directly. If you change a
color or spacing value here, mirror it in `emailComponents.ts` (and in
`supabase/functions/_shared/emailTokens.ts` / `emails/tokens.ts`, the token
pair both renderers read from).

## Preview locally

```bash
cd emails
npm install
npm run dev
```

Opens the React Email dev server (usually http://localhost:3000) with a live
preview of every template in `templates/`, hot-reloading on save.

## Structure

- `tokens.ts` — design tokens (colors, fonts, URLs). Byte-identical copy of
  `supabase/functions/_shared/emailTokens.ts`.
- `components/` — shared building blocks: `Layout` (header/body/footer
  shell), `Button`, `Divider`, `InfoRow`, `TicketSummary`, `CodeBlock`.
- `templates/` — one file per email, each a default-exported component with
  sample `PreviewProps` so the dev server renders something realistic
  without live data.

## Templates vs. what's actually wired up

Every template here has a matching, fully-implemented sender in
`supabase/functions/`, **except** `EventReminder.tsx` — there is no
scheduled job sending it yet (see the file's own comment and the final
summary for what's needed to wire it up).
