import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportButtons } from './ExportButtons.js';
import * as downloadLib from '../lib/download.js';
import * as exportPdfLib from '../lib/exportPdf.js';
import type { Item } from '../types.js';

function sampleItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    type: 'repo',
    name: 'Item A',
    sourceType: 'url',
    sourceValue: 'https://example.com',
    localPath: '/local',
    categoryId: null,
    summary: 'Resumo',
    utility: null,
    tags: [],
    enrichmentSource: null,
    globalInstallStatus: null,
    downloadStatus: null,
    installedGlobally: null,
    hasRedactedSecret: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('ExportButtons', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads a Markdown file when "Baixar .md" is clicked', async () => {
    const user = userEvent.setup();
    const downloadSpy = vi.spyOn(downloadLib, 'downloadTextFile').mockImplementation(() => {});

    render(<ExportButtons items={[sampleItem()]} categories={[]} />);
    await user.click(screen.getByRole('button', { name: 'Baixar .md' }));

    expect(downloadSpy).toHaveBeenCalledWith(expect.stringContaining('Item A'), 'catalogo.md', 'text/markdown');
  });

  it('generates and saves a PDF when "Baixar .pdf" is clicked', async () => {
    const user = userEvent.setup();
    const saveSpy = vi.fn();
    vi.spyOn(exportPdfLib, 'buildPdf').mockReturnValue({ save: saveSpy } as unknown as ReturnType<
      typeof exportPdfLib.buildPdf
    >);

    render(<ExportButtons items={[sampleItem()]} categories={[]} />);
    await user.click(screen.getByRole('button', { name: 'Baixar .pdf' }));

    expect(saveSpy).toHaveBeenCalledWith('catalogo.pdf');
  });

  it('disables both buttons when disabled is true', () => {
    render(<ExportButtons items={[]} categories={[]} disabled />);
    expect(screen.getByRole('button', { name: 'Baixar .md' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Baixar .pdf' })).toBeDisabled();
  });
});
