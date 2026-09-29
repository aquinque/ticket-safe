---
name: de-ai-ify
description: Use when the user says the site/page/copy "feels like AI" or "fait trop IA/générique" and wants it to look more human, custom, or premium — a repeatable audit + targeted-fix pass over Ticket Safe's design (Tailwind/shadcn) and copy, grounded in this repo's actual tokens and past reverts. Trigger phrases include "moins IA", "moins générique", "ça fait template", "human it up", "less AI-generated", "de-genericize the design".
---

# De-AI-ify Ticket Safe

Goal: make a page, component, or piece of copy read as deliberately designed by this team,
not generated. This is a **targeted audit-and-fix pass**, not a redesign. Ticket Safe has
already tried sweeping visual rewrites twice (`Aesthetic batch 2`, a Fraunces/Inter font
swap) and both were reverted — see `git log --oneline -- src/index.css tailwind.config.ts`.
Read that history before touching global tokens. Small, scoped diffs that survive review
beat a big pass that gets rolled back.

## Ground rules (from prior reverts / redesigns — do not relitigate these)

- **Check `git log --oneline -20 -- src/index.css tailwind.config.ts src/pages/Home.tsx`
  before touching global tokens or the homepage.** This design has been reworked multiple
  times, most recently by a full flat-aesthetic pass (PR #18, "Redesign UI with flat
  aesthetic, warm colors, and serif typography") that landed 2026-09-29 — squared-off
  `--radius: 2px`, every `boxShadow` token forced to `none`, body font `IBM Plex Sans`
  (`font-sans`), headings `Source Serif 4` (`font-serif`, applied via `@apply font-serif`
  on `body` in `src/index.css` — confirm this is still current before assuming it). Don't
  reintroduce large radii, drop shadows back in, or swap fonts back to a prior pair without
  the user asking — read current `src/index.css` / `tailwind.config.ts` fresh each time,
  don't rely on this file's numbers, they will drift.
- **Keep the ESCP blue identity** (`--primary`, currently `222 55% 24%`). The exact palette
  values move between passes but the deep-blue brand color itself has survived every
  revert/redesign cycle. Don't propose replacing it wholesale.
- **Never touch `/organizers` (Studio) palette** (`--studio-*` tokens, violet/magenta/coral
  gradients, `studio-blob`/`studio-float`/`studio-cta-pan` animations) unless the user
  names it specifically — that surface is intentionally bold/immersive by design, it's a
  different product area, not a mistake to fix.
- **Before pushing, check you're not behind `origin/main`.** `git fetch && git log
  --oneline main..origin/main`. This repo gets edited from multiple sessions/tools in
  parallel (Claude Code here, and separate sessions via claude.ai/code) — more than once a
  design pass here has collided with an equivalent pass already pushed upstream, touching
  the same files. If origin is ahead, stop and reconcile (pull/rebase, or ask the user which
  version wins) before committing — don't force-push over it.
- Work file-by-file or component-by-component. Show a before/after, don't bulk-edit the
  whole `src/pages` tree in one shot unless the user has explicitly asked for a full pass.

## What actually reads as "AI-generated" here (checklist)

The exact Tailwind classes below are **illustrative of patterns, not current truth** — the
token values they reference (`--radius`, `boxShadow`, `--gradient-hero`) have already
changed at least twice and will change again. Check the live file before matching against
these literally; look for the *pattern*, not the specific class name.

**Visual**
- Gradient text/fills used once with real intent is fine; the tell is reusing the same
  gradient span on every H1/CTA/badge across pages regardless of context.
- Large radial-gradient "glow blobs" behind hero sections (`blur-3xl` + `rounded-full` +
  `radial-gradient(...)`, floating in the background) — a near-universal "AI SaaS landing
  page" signature. Real content backgrounds (a photo, a flat wash, nothing) read better.
- The 3-icon "trust grid" pattern: tinted rounded square + bold icon + bold title + muted
  paragraph, repeated identically for every feature list. Vary the layout/rhythm instead of
  copy-pasting the same card shape.
- Multiple hover effects stacked on one element (scale + shadow + translate + color + border,
  all at once) — the generic "everything animates on hover" tell. One clean hover cue reads
  more deliberate than four stacked ones.
- Sparkles/Zap/Rocket icons used as decorative flourishes rather than meaning something
  (e.g. `Sparkles` on a "everything in one place" trust point — no relation to the claim).
- Badges/pills used purely as decoration ("Beta", "New") rather than real status — the repo
  has already removed several of these across passes (check `git log --grep=badge -i`).
- Perfectly centered, single-viewport hero (`flex items-center justify-center` filling the
  screen) — reads as a template landing slide. A page that's allowed to just start at the
  top and have a natural page rhythm reads more like a real product.

**Copy**
- Marketing-fluff openers translated too literally ("Everything in one place", "Your money
  stays locked in escrow") — fine as claims, but check they're specific and verifiable
  (they mostly are here: Stripe, university email, QR) rather than vague superlatives.
- Three parallel bolded trust points with matching sentence rhythm — reads templated when
  all three have identical structure (bold claim + one justifying sentence). Break the
  pattern on at least one.
- Overuse of em dashes and "No more X, no Y, just Z" list constructions.
- CTA button pairs that are just a verb + noun with matching icon-arrow suffix on both
  buttons ("Find a Ticket →" / "Sell a Ticket →") — fine once, a tell when every CTA pair in
  the app follows the identical icon-label-arrow template.

**Structure**
- Every section following the same rhythm: gradient-overlay wrapper → centered `max-w-5xl`
  → bold H1 with gradient span → subtitle → CTA row → 3-col feature grid. If every page does
  this, vary at least the rhythm (asymmetric layout, different grid count, a callout instead
  of a grid) on one or two flagship pages rather than the whole site.

## Workflow

1. Ask (if not already scoped) which page/component/copy the user means — don't audit the
   whole site unprompted.
2. Read the actual file(s), not assumptions — this checklist is a starting point, the real
   tells are whatever's actually repeated in that file.
3. Propose specific, small diffs per tell found (not a full rewrite). Explain *why* each one
   reads as generic, referencing the checklist item.
4. Apply only what the user confirms, or obviously-safe copy tweaks if they asked for a
   direct pass (see the clarifying-question pattern already used for this: offer "skill for
   later" vs "fix it now" vs "point to something specific").
5. After any visible change, use the `run` skill to launch the app and take a look before
   calling it done — this project has a track record of visual changes getting reverted
   after the fact, so a quick real screenshot check is cheap insurance.
