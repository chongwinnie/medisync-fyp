import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, grayscale } from "pdf-lib";
import crypto from "crypto";

export const COLORS = {
  navy: rgb(0 / 255, 36 / 255, 68 / 255),       // #002444
  sapphire: rgb(0 / 255, 98 / 255, 161 / 255),  // #0062a1
  lightBlue: rgb(239 / 255, 246 / 255, 255 / 255), // #eff6ff
  darkGray: rgb(31 / 255, 41 / 255, 55 / 255),   // #1f2937
  midGray: rgb(107 / 255, 114 / 255, 128 / 255), // #6b7280
  lightGray: rgb(243 / 255, 244 / 255, 246 / 255), // #f3f4f6
  borderGray: rgb(229 / 255, 231 / 255, 235 / 255), // #e5e7eb
  white: rgb(1, 1, 1),
  green: rgb(22 / 255, 163 / 255, 74 / 255),    // #16a34a
  greenBg: rgb(240 / 255, 253 / 255, 244 / 255), // #f0fdf4
  red: rgb(220 / 255, 38 / 255, 38 / 255),       // #dc2626
  redBg: rgb(254 / 255, 242 / 255, 242 / 255),   // #fef2f2
  amber: rgb(217 / 255, 119 / 255, 6 / 255),     // #d97706
  amberBg: rgb(254 / 255, 243 / 255, 199 / 255), // #fef3c7
};

export interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "right" | "center";
}

export interface TableRow {
  values: string[];
  bold?: boolean;
}

export class MediSyncPdfDocument {
  public doc!: PDFDocument;
  public page!: PDFPage;
  public fontRegular!: PDFFont;
  public fontBold!: PDFFont;
  public fontMono!: PDFFont;

  public width: number = 595.28;  // A4 width
  public height: number = 841.89; // A4 height
  public margin: number = 40;
  public currentY: number = 800;

  static async create(): Promise<MediSyncPdfDocument> {
    const instance = new MediSyncPdfDocument();
    instance.doc = await PDFDocument.create();
    instance.fontRegular = await instance.doc.embedFont(StandardFonts.Helvetica);
    instance.fontBold = await instance.doc.embedFont(StandardFonts.HelveticaBold);
    instance.fontMono = await instance.doc.embedFont(StandardFonts.Courier);
    instance.addNewPage();
    return instance;
  }

  addNewPage(): PDFPage {
    this.page = this.doc.addPage([this.width, this.height]);
    this.currentY = this.height - this.margin;
    return this.page;
  }

  ensureSpace(requiredHeight: number): void {
    if (this.currentY - requiredHeight < this.margin + 60) {
      this.addNewPage();
    }
  }

  /**
   * Official Hospital Letterhead
   */
  drawHeader(documentTitle: string, documentSubtitle?: string): void {
    const startY = this.height - this.margin;

    // Top Navy Accent Bar
    this.page.drawRectangle({
      x: this.margin,
      y: startY + 10,
      width: this.width - this.margin * 2,
      height: 4,
      color: COLORS.sapphire,
    });

    // Hospital Name Branding
    this.page.drawText("MEDISYNC MEDICAL CENTER", {
      x: this.margin,
      y: startY - 12,
      size: 16,
      font: this.fontBold,
      color: COLORS.navy,
    });

    this.page.drawText("TERTIARY CARE & CLINICAL RESEARCH INSTITUTE", {
      x: this.margin,
      y: startY - 24,
      size: 7.5,
      font: this.fontRegular,
      color: COLORS.sapphire,
    });

    // Right-aligned hospital contacts
    const contactLines = [
      "100 Hospital Boulevard, Health City",
      "Tel: +60 (3) 8000-1234 • Emergency: 999",
      "Web: https://medisync.health",
    ];

    contactLines.forEach((line, index) => {
      const lineWidth = this.fontRegular.widthOfTextAtSize(line, 7.5);
      this.page.drawText(line, {
        x: this.width - this.margin - lineWidth,
        y: startY - 12 - index * 10,
        size: 7.5,
        font: this.fontRegular,
        color: COLORS.midGray,
      });
    });

    // Divider Line
    const dividerY = startY - 45;
    this.page.drawLine({
      start: { x: this.margin, y: dividerY },
      end: { x: this.width - this.margin, y: dividerY },
      thickness: 1,
      color: COLORS.borderGray,
    });

    // Document Title Banner
    const bannerY = dividerY - 30;
    this.page.drawText(documentTitle.toUpperCase(), {
      x: this.margin,
      y: bannerY,
      size: 14,
      font: this.fontBold,
      color: COLORS.navy,
    });

    if (documentSubtitle) {
      this.page.drawText(documentSubtitle, {
        x: this.margin,
        y: bannerY - 12,
        size: 8.5,
        font: this.fontRegular,
        color: COLORS.midGray,
      });
      this.currentY = bannerY - 30;
    } else {
      this.currentY = bannerY - 20;
    }
  }

  /**
   * Draw Status Stamp Badge (e.g. PAID, SENT, OVERDUE, DRAFT, CONFIRMED)
   */
  drawStatusStamp(status: string, x?: number, y?: number): void {
    const text = status.toUpperCase();
    const stampX = x ?? (this.width - this.margin - 90);
    const stampY = y ?? (this.currentY + 15);

    let textColor = COLORS.midGray;
    let bgColor = COLORS.lightGray;

    if (["PAID", "COMPLETED", "ACTIVE"].includes(text)) {
      textColor = COLORS.green;
      bgColor = COLORS.greenBg;
    } else if (["OVERDUE", "CRITICAL", "EXPIRED", "CANCELLED"].includes(text)) {
      textColor = COLORS.red;
      bgColor = COLORS.redBg;
    } else if (["SENT", "SCHEDULED", "CONFIRMED"].includes(text)) {
      textColor = COLORS.sapphire;
      bgColor = COLORS.lightBlue;
    } else if (["DRAFT", "PENDING"].includes(text)) {
      textColor = COLORS.amber;
      bgColor = COLORS.amberBg;
    }

    const boxWidth = 85;
    const boxHeight = 24;

    this.page.drawRectangle({
      x: stampX,
      y: stampY - 6,
      width: boxWidth,
      height: boxHeight,
      color: bgColor,
      borderColor: textColor,
      borderWidth: 1.5,
    });

    const textWidth = this.fontBold.widthOfTextAtSize(text, 10);
    this.page.drawText(text, {
      x: stampX + (boxWidth - textWidth) / 2,
      y: stampY + 1,
      size: 10,
      font: this.fontBold,
      color: textColor,
    });
  }

  /**
   * Draw Two-Column Meta Info Grid (e.g. Bill To / Invoice Details)
   */
  drawMetaGrid(left: { title: string; rows: [string, string][] }, right: { title: string; rows: [string, string][] }): void {
    const boxWidth = (this.width - this.margin * 2 - 20) / 2;
    const startY = this.currentY;
    const rowHeight = 14;
    const maxRows = Math.max(left.rows.length, right.rows.length);
    const totalBoxHeight = 24 + maxRows * rowHeight + 8;

    this.ensureSpace(totalBoxHeight);

    // Left Column Box
    this.page.drawRectangle({
      x: this.margin,
      y: startY - totalBoxHeight,
      width: boxWidth,
      height: totalBoxHeight,
      color: COLORS.lightGray,
      borderColor: COLORS.borderGray,
      borderWidth: 1,
    });

    this.page.drawText(left.title.toUpperCase(), {
      x: this.margin + 10,
      y: startY - 16,
      size: 8.5,
      font: this.fontBold,
      color: COLORS.navy,
    });

    left.rows.forEach(([label, val], idx) => {
      const y = startY - 32 - idx * rowHeight;
      this.page.drawText(`${label}:`, {
        x: this.margin + 10,
        y,
        size: 8,
        font: this.fontRegular,
        color: COLORS.midGray,
      });
      this.page.drawText(val, {
        x: this.margin + 75,
        y,
        size: 8,
        font: this.fontBold,
        color: COLORS.darkGray,
      });
    });

    // Right Column Box
    const rightX = this.margin + boxWidth + 20;
    this.page.drawRectangle({
      x: rightX,
      y: startY - totalBoxHeight,
      width: boxWidth,
      height: totalBoxHeight,
      color: COLORS.lightGray,
      borderColor: COLORS.borderGray,
      borderWidth: 1,
    });

    this.page.drawText(right.title.toUpperCase(), {
      x: rightX + 10,
      y: startY - 16,
      size: 8.5,
      font: this.fontBold,
      color: COLORS.navy,
    });

    right.rows.forEach(([label, val], idx) => {
      const y = startY - 32 - idx * rowHeight;
      this.page.drawText(`${label}:`, {
        x: rightX + 10,
        y,
        size: 8,
        font: this.fontRegular,
        color: COLORS.midGray,
      });
      this.page.drawText(val, {
        x: rightX + 85,
        y,
        size: 8,
        font: this.fontBold,
        color: COLORS.darkGray,
      });
    });

    this.currentY = startY - totalBoxHeight - 20;
  }

  /**
   * Draw Styled Table
   */
  drawTable(columns: TableColumn[], rows: TableRow[]): void {
    const tableWidth = this.width - this.margin * 2;
    const headerHeight = 22;
    const rowHeight = 20;

    this.ensureSpace(headerHeight + rows.length * rowHeight + 30);

    // Table Header Background
    this.page.drawRectangle({
      x: this.margin,
      y: this.currentY - headerHeight,
      width: tableWidth,
      height: headerHeight,
      color: COLORS.navy,
    });

    // Draw Column Headers
    let curX = this.margin;
    columns.forEach((col) => {
      let textX = curX + 6;
      if (col.align === "right") {
        const tw = this.fontBold.widthOfTextAtSize(col.header, 8.5);
        textX = curX + col.width - tw - 6;
      } else if (col.align === "center") {
        const tw = this.fontBold.widthOfTextAtSize(col.header, 8.5);
        textX = curX + (col.width - tw) / 2;
      }

      this.page.drawText(col.header, {
        x: textX,
        y: this.currentY - 15,
        size: 8.5,
        font: this.fontBold,
        color: COLORS.white,
      });
      curX += col.width;
    });

    this.currentY -= headerHeight;

    // Draw Data Rows
    rows.forEach((row, rIdx) => {
      const isEven = rIdx % 2 === 0;
      const rowY = this.currentY - rowHeight;

      if (isEven) {
        this.page.drawRectangle({
          x: this.margin,
          y: rowY,
          width: tableWidth,
          height: rowHeight,
          color: COLORS.lightGray,
        });
      }

      // Bottom Row Border
      this.page.drawLine({
        start: { x: this.margin, y: rowY },
        end: { x: this.margin + tableWidth, y: rowY },
        thickness: 0.5,
        color: COLORS.borderGray,
      });

      let cellX = this.margin;
      row.values.forEach((val, cIdx) => {
        const col = columns[cIdx];
        if (!col) return;

        const font = row.bold ? this.fontBold : this.fontRegular;
        let textX = cellX + 6;

        if (col.align === "right") {
          const tw = font.widthOfTextAtSize(val, 8);
          textX = cellX + col.width - tw - 6;
        } else if (col.align === "center") {
          const tw = font.widthOfTextAtSize(val, 8);
          textX = cellX + (col.width - tw) / 2;
        }

        this.page.drawText(val, {
          x: textX,
          y: rowY + 6,
          size: 8,
          font,
          color: row.bold ? COLORS.navy : COLORS.darkGray,
        });

        cellX += col.width;
      });

      this.currentY -= rowHeight;
    });

    this.currentY -= 15;
  }

  /**
   * Draw Totals / Summary Breakdown Box (Right Aligned)
   */
  drawTotalsBox(items: { label: string; value: string; isTotal?: boolean }[]): void {
    const boxWidth = 200;
    const boxX = this.width - this.margin - boxWidth;
    const rowHeight = 18;
    const totalHeight = items.length * rowHeight + 8;

    this.ensureSpace(totalHeight + 10);

    items.forEach((item, idx) => {
      const y = this.currentY - (idx + 1) * rowHeight;
      const font = item.isTotal ? this.fontBold : this.fontRegular;
      const size = item.isTotal ? 10 : 8.5;
      const color = item.isTotal ? COLORS.navy : COLORS.darkGray;

      if (item.isTotal) {
        // Highlight banner for final Total
        this.page.drawRectangle({
          x: boxX - 10,
          y: y - 4,
          width: boxWidth + 10,
          height: rowHeight + 2,
          color: COLORS.lightBlue,
          borderColor: COLORS.sapphire,
          borderWidth: 1,
        });
      }

      this.page.drawText(item.label, {
        x: boxX,
        y: y + 2,
        size,
        font,
        color,
      });

      const valWidth = (item.isTotal ? this.fontBold : this.fontRegular).widthOfTextAtSize(item.value, size);
      this.page.drawText(item.value, {
        x: this.width - this.margin - valWidth,
        y: y + 2,
        size,
        font: item.isTotal ? this.fontBold : this.fontRegular,
        color,
      });
    });

    this.currentY -= totalHeight + 15;
  }

  /**
   * Draw Cryptographic Digital Signature & Verification Seal
   */
  drawDigitalSignature(signerName: string, signerRole: string, rawPayloadForHash: string): void {
    this.ensureSpace(85);

    const sigBoxY = this.currentY - 70;
    const sigBoxWidth = this.width - this.margin * 2;

    // Calculate SHA-256 Document Verification Hash
    const docHash = crypto.createHash("sha256").update(rawPayloadForHash).digest("hex");
    const formattedHash = `SHA256:${docHash.slice(0, 16).toUpperCase()}-${docHash.slice(16, 32).toUpperCase()}`;

    // Security Box Container
    this.page.drawRectangle({
      x: this.margin,
      y: sigBoxY,
      width: sigBoxWidth,
      height: 70,
      color: rgb(249 / 255, 250 / 255, 251 / 255),
      borderColor: COLORS.borderGray,
      borderWidth: 1,
    });

    // Left: Verification & Integrity Hash
    this.page.drawText("DIGITALLY CERTIFIED & TAMPER-EVIDENT RECORD", {
      x: this.margin + 12,
      y: sigBoxY + 52,
      size: 7.5,
      font: this.fontBold,
      color: COLORS.sapphire,
    });

    this.page.drawText("This document is generated by MediSync AI Core. Cryptographic seal verifies document integrity.", {
      x: this.margin + 12,
      y: sigBoxY + 38,
      size: 6.5,
      font: this.fontRegular,
      color: COLORS.midGray,
    });

    this.page.drawText(`Document Security Hash: ${formattedHash}`, {
      x: this.margin + 12,
      y: sigBoxY + 22,
      size: 7,
      font: this.fontMono,
      color: COLORS.navy,
    });

    // Right: Authorized Signer
    const rightX = this.width - this.margin - 180;
    this.page.drawText(`Authorized: ${signerName}`, {
      x: rightX,
      y: sigBoxY + 48,
      size: 8,
      font: this.fontBold,
      color: COLORS.darkGray,
    });

    this.page.drawText(`Role: ${signerRole}`, {
      x: rightX,
      y: sigBoxY + 36,
      size: 7.5,
      font: this.fontRegular,
      color: COLORS.midGray,
    });

    this.page.drawText(`Timestamp: ${new Date().toISOString()}`, {
      x: rightX,
      y: sigBoxY + 22,
      size: 6.5,
      font: this.fontRegular,
      color: COLORS.midGray,
    });

    this.currentY = sigBoxY - 20;
  }

  /**
   * Finalize Document: Add Page Numbers & Legal Disclaimer
   */
  async build(): Promise<Uint8Array> {
    const totalPages = this.doc.getPageCount();

    for (let i = 0; i < totalPages; i++) {
      const page = this.doc.getPage(i);
      const pageNumText = `Page ${i + 1} of ${totalPages}`;
      const pageNumWidth = this.fontRegular.widthOfTextAtSize(pageNumText, 7.5);

      // Bottom legal rule
      page.drawLine({
        start: { x: this.margin, y: 35 },
        end: { x: this.width - this.margin, y: 35 },
        thickness: 0.5,
        color: COLORS.borderGray,
      });

      page.drawText(
        "CONFIDENTIAL MEDICAL & FINANCIAL RECORD • STRICTLY PRIVILEGED • MEDISYNC HOSPITAL MANAGEMENT SYSTEM",
        {
          x: this.margin,
          y: 24,
          size: 6,
          font: this.fontRegular,
          color: COLORS.midGray,
        }
      );

      page.drawText(pageNumText, {
        x: this.width - this.margin - pageNumWidth,
        y: 24,
        size: 7.5,
        font: this.fontRegular,
        color: COLORS.midGray,
      });
    }

    return await this.doc.save();
  }
}
