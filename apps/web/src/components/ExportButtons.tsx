import type { Item, Category } from '../types.js';
import { buildExportRows, renderExportMarkdown } from '../lib/export.js';
import { downloadTextFile } from '../lib/download.js';
import { buildPdf } from '../lib/exportPdf.js';
import { Button } from './ui/core/Button/Button.js';

export interface ExportButtonsProps {
  items: Item[];
  categories: Category[];
  disabled?: boolean;
}

export function ExportButtons({ items, categories, disabled }: ExportButtonsProps) {
  function handleExportMarkdown() {
    const rows = buildExportRows(items, categories);
    downloadTextFile(renderExportMarkdown(rows), 'catalogo.md', 'text/markdown');
  }

  function handleExportPdf() {
    const rows = buildExportRows(items, categories);
    buildPdf(rows).save('catalogo.pdf');
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button variant="secondary" size="sm" onClick={handleExportMarkdown} disabled={disabled}>
        Baixar .md
      </Button>
      <Button variant="secondary" size="sm" onClick={handleExportPdf} disabled={disabled}>
        Baixar .pdf
      </Button>
    </div>
  );
}
