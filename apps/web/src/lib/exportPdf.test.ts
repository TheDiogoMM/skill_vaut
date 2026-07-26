import { describe, it, expect, vi } from 'vitest';
import { buildPdf } from './exportPdf.js';
import type { ExportRow } from './export.js';

// jsPDF assigns `text` (and friends) as an *own instance property* inside its
// constructor rather than putting it on `jsPDF.prototype`, so a plain
// `vi.spyOn(jsPDF.prototype, 'text')` never observes any calls. Instead we
// wrap the real class: after `super()` runs (and jsPDF has installed its own
// `this.text`), we re-wrap that instance method so every call is recorded
// before delegating to the original implementation.
const { textCalls } = vi.hoisted(() => ({ textCalls: [] as unknown[][] }));

vi.mock('jspdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jspdf')>();
  class InstrumentedJsPDF extends actual.jsPDF {
    constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
      super(...args);
      const originalText = this.text.bind(this);
      this.text = ((...textArgs: Parameters<typeof originalText>) => {
        textCalls.push(textArgs);
        return originalText(...textArgs);
      }) as typeof this.text;
    }
  }
  return { ...actual, jsPDF: InstrumentedJsPDF };
});

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
    textCalls.length = 0;

    const longPath = 'C:/Users/Diogo/Projetos/'.repeat(10) + 'arquivo-com-nome-bem-longo.psd';
    const longName = 'Nome de item extremamente longo '.repeat(8).trim();
    const rows: ExportRow[] = [
      {
        category: 'dev-tools',
        // Description is deliberately short so it can never itself wrap onto
        // multiple lines. Any multi-line array passed to `doc.text()` below
        // must therefore have come from wrapping `name` or `link`.
        name: longName,
        link: longPath,
        description: 'Curta.',
      },
    ];

    expect(() => buildPdf(rows)).not.toThrow();

    // If the fix were reverted to `doc.text(row.name, ...)` /
    // `doc.text(row.link, ...)` (plain unwrapped strings), every recorded
    // call would carry a string as its first argument and this would fail.
    const wrappedBlockCalls = textCalls.filter(
      (args) => Array.isArray(args[0]) && (args[0] as string[]).length > 1,
    );
    expect(wrappedBlockCalls.length).toBeGreaterThan(0);
  });
});
