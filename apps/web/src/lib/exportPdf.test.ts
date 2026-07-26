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
});
