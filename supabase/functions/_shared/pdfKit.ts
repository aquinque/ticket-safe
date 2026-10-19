/**
 * Page layout toolkit shared by the billing PDFs (pdf-lib, no DOM or canvas, so it
 * runs in Deno).
 *
 * What it takes care of, so the documents can't get it wrong one by one:
 *  - every string goes through pdfSafe(), so a character the font can't draw never
 *    makes the document fail (see _shared/pdfText.ts);
 *  - text is wrapped, never cut short with an ellipsis: a clause that is legally
 *    required has to be printed in full;
 *  - a table or a clause that doesn't fit moves on to a new page, and every page
 *    carries the brand, the document number, TicketSafe's legal identity and
 *    "Page i / n";
 *  - the file is deterministic: dates in the metadata come from the document, not
 *    the clock, so the same document always renders to the same bytes and the hash
 *    stored with it stays true.
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { pdfSafe } from "./pdfText.ts";

export { rgb };

export const A4_W = 595.28;
export const A4_H = 841.89;
export const MM = 2.834645669;
export const MARGIN_X = 14 * MM;
export const CONTENT_W = A4_W - 2 * MARGIN_X;

export type Color = ReturnType<typeof rgb>;
export const BRAND = rgb(0, 0.2, 0.6);
export const INK = rgb(0.06, 0.09, 0.16);
export const MUTED = rgb(0.39, 0.45, 0.55);
export const HAIR = rgb(0.88, 0.91, 0.94);
export const SOFT = rgb(0.97, 0.98, 0.99);

const CONTINUATION_TOP = 26; // mm: where the content restarts on a new page
const CONTENT_BOTTOM = 268; // mm: the footer starts at 278

export interface Fonts {
  reg: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

export interface TextStyle {
  font?: keyof Fonts;
  size?: number;
  color?: Color;
  spacing?: number;
}

export interface Chrome {
  /** Printed top right of the first page, e.g. "FACTURE". Later pages add the number. */
  label: string;
  number: string;
  /** TicketSafe's legal identity, printed at the foot of every page. */
  footer: string;
}

export class Sheet {
  page: PDFPage;
  /** Where the next piece of flowing content goes, in mm from the top of the page. */
  y = CONTINUATION_TOP;

  private constructor(readonly pdf: PDFDocument, readonly fonts: Fonts) {
    this.page = pdf.addPage([A4_W, A4_H]);
  }

  static async create(meta: { title: string; subject: string; createdAt: Date }): Promise<Sheet> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(pdfSafe(meta.title));
    pdf.setSubject(pdfSafe(meta.subject));
    pdf.setAuthor("Ticket Safe");
    pdf.setCreator("Ticket Safe");
    pdf.setProducer("Ticket Safe");
    pdf.setLanguage("fr-FR");
    pdf.setCreationDate(meta.createdAt);
    pdf.setModificationDate(meta.createdAt);
    const fonts: Fonts = {
      reg: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      mono: await pdf.embedFont(StandardFonts.Courier),
    };
    return new Sheet(pdf, fonts);
  }

  /** Distance from the top of the page, in mm, as a PDF coordinate. */
  private top(mm: number) {
    return A4_H - mm * MM;
  }

  private style(s: TextStyle) {
    return { font: this.fonts[s.font ?? "reg"], size: s.size ?? 10, color: s.color ?? INK, spacing: s.spacing };
  }

  /** One line of text. `align: "right"` makes `x` the right edge. */
  text(t: string, x: number, yMm: number, s: TextStyle & { align?: "left" | "right" } = {}) {
    const { font, size, color, spacing } = this.style(s);
    const safe = pdfSafe(t);
    if (!safe) return;
    const w = font.widthOfTextAtSize(safe, size) + (spacing ?? 0) * (safe.length - 1);
    this.page.drawText(safe, {
      x: s.align === "right" ? x - w : x,
      y: this.top(yMm),
      font,
      size,
      color,
      ...(spacing ? { characterSpacing: spacing } : {}),
    });
  }

  /** Small grey capitals that introduce a block. */
  label(t: string, x: number, yMm: number, align: "left" | "right" = "left") {
    this.text(t, x, yMm, { font: "bold", size: 8, color: MUTED, spacing: 1.1, align });
  }

  /** The lines a text takes in a column of this width. */
  wrap(t: string, width: number, s: TextStyle = {}): string[] {
    const { font, size } = this.style(s);
    const lines: string[] = [];
    let line = "";
    for (let word of pdfSafe(t).split(" ")) {
      // A single word wider than the column is cut where it overflows.
      while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > width) cut--;
        if (line) lines.push(line);
        line = "";
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Wrapped text at a fixed position, for columns side by side. Returns the y it ends at (mm). */
  block(t: string, x: number, yMm: number, width: number, s: TextStyle = {}, lineMm = 4.6): number {
    let y = yMm;
    for (const line of this.wrap(t, width, s)) {
      this.text(line, x, y, s);
      y += lineMm;
    }
    return y;
  }

  /** Wrapped text that continues on a new page when the page is full, without splitting a paragraph that fits on one. */
  flow(t: string, s: TextStyle = {}, lineMm = 4.6, x = MARGIN_X, width = CONTENT_W) {
    const lines = this.wrap(t, width, s);
    if (lines.length * lineMm <= CONTENT_BOTTOM - CONTINUATION_TOP) this.ensure(lines.length * lineMm);
    for (const line of lines) {
      this.ensure(lineMm);
      this.text(line, x, this.y, s);
      this.y += lineMm;
    }
  }

  /** Starts a new page when `heightMm` of content wouldn't fit. Returns true when it did. */
  ensure(heightMm: number): boolean {
    if (this.y + heightMm <= CONTENT_BOTTOM) return false;
    this.page = this.pdf.addPage([A4_W, A4_H]);
    this.y = CONTINUATION_TOP;
    return true;
  }

  rule(yMm: number = this.y) {
    this.page.drawRectangle({ x: MARGIN_X, y: this.top(yMm), width: CONTENT_W, height: 0.3, color: HAIR });
  }

  box(x: number, yMm: number, w: number, hMm: number, fill: Color = SOFT, border: Color | null = HAIR) {
    this.page.drawRectangle({
      x,
      y: this.top(yMm + hMm),
      width: w,
      height: hMm * MM,
      color: fill,
      ...(border ? { borderColor: border, borderWidth: 0.4 } : {}),
    });
  }

  /** Adds the header and footer to every page, now that the page count is known, and returns the file. */
  async finish(chrome: Chrome): Promise<Uint8Array> {
    const pages = this.pdf.getPages();
    pages.forEach((page, i) => {
      this.page = page;
      this.text("TICKET SAFE", MARGIN_X, 9, { font: "bold", size: 11, color: BRAND, spacing: 1.4 });
      this.text(i === 0 ? chrome.label : `${chrome.label} ${chrome.number}`, A4_W - MARGIN_X, 9, {
        font: "bold",
        size: 10,
        color: MUTED,
        spacing: 1,
        align: "right",
      });
      page.drawRectangle({ x: MARGIN_X, y: this.top(14), width: CONTENT_W, height: 0.6, color: BRAND });

      this.rule(278);
      this.block(chrome.footer, MARGIN_X, 283, CONTENT_W - 28 * MM, { size: 7, color: MUTED }, 3.4);
      this.text(`Page ${i + 1} / ${pages.length}`, A4_W - MARGIN_X, 283, { size: 8, color: MUTED, align: "right" });
    });
    return await this.pdf.save();
  }
}
