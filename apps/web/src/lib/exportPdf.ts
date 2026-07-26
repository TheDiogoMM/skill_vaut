import { jsPDF } from 'jspdf';
import type { ExportRow } from './export.js';

const PAGE_MARGIN = 15;
const LINE_HEIGHT = 6;
const TITLE_SIZE = 18;
const CATEGORY_SIZE = 13;
const NAME_SIZE = 11;
const BODY_SIZE = 9;

export function buildPdf(rows: ExportRow[]): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  let y = PAGE_MARGIN;

  function ensureSpace(height: number) {
    if (y + height > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(TITLE_SIZE);
  doc.text('SkillVault — Catálogo', PAGE_MARGIN, y);
  y += LINE_HEIGHT * 2;

  const byCategory = new Map<string, ExportRow[]>();
  for (const row of rows) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }
  const sortedCategories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));

  for (const category of sortedCategories) {
    ensureSpace(LINE_HEIGHT * 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(CATEGORY_SIZE);
    doc.text(category, PAGE_MARGIN, y);
    y += LINE_HEIGHT * 1.5;

    for (const row of byCategory.get(category)!) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(NAME_SIZE);
      const descriptionLines = doc.splitTextToSize(row.description, contentWidth) as string[];
      const blockHeight = LINE_HEIGHT * 2 + descriptionLines.length * (LINE_HEIGHT * 0.8);
      ensureSpace(blockHeight);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(NAME_SIZE);
      doc.text(row.name, PAGE_MARGIN, y);
      y += LINE_HEIGHT * 0.9;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(BODY_SIZE);
      doc.text(row.link, PAGE_MARGIN, y);
      y += LINE_HEIGHT * 0.8;

      doc.text(descriptionLines, PAGE_MARGIN, y);
      y += descriptionLines.length * (LINE_HEIGHT * 0.8) + LINE_HEIGHT * 0.5;
    }
    y += LINE_HEIGHT * 0.5;
  }

  return doc;
}
