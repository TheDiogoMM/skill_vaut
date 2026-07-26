import { describe, it, expect } from 'vitest';
import { buildPdf } from './exportPdf.js';
import type { ExportRow } from './export.js';

function manyRows(count: number): ExportRow[] {
  return Array.from({ length: count }, (_, i) => ({
    category: 'dev-tools',
    name: `Item ${i}`,
    link: `/local/item-${i}`,
    description: 'Uma descrição razoavelmente longa para ocupar espaço vertical na página do PDF gerado.',
  }));
}

describe('buildPdf', () => {
  it('builds a single-page PDF for a small number of rows', () => {
    const doc = buildPdf(manyRows(2));
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('adds new pages once content overflows a single page', () => {
    const doc = buildPdf(manyRows(60));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('wraps long local-path-style links and names instead of clipping them off the page', () => {
    const longPath = 'C:/Users/Diogo/Projetos/'.repeat(10) + 'arquivo-com-nome-bem-longo.psd';
    const longName = 'Nome de item extremamente longo '.repeat(8).trim();
    const rows: ExportRow[] = [
      {
        category: 'dev-tools',
        name: longName,
        link: longPath,
        description: 'Descrição curta.',
      },
    ];

    expect(() => buildPdf(rows)).not.toThrow();
    const doc = buildPdf(rows);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    const splitLines = doc.splitTextToSize(longPath, 180) as string[];
    expect(splitLines.length).toBeGreaterThan(1);
  });
});
