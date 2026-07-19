import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillForm } from './SkillForm.js';
import * as api from '../../api/client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SkillForm', () => {
  it('submits a local_path skill by default and calls onCreated with the created item', async () => {
    const user = userEvent.setup();
    const createdItem = { id: 9, type: 'skill', name: 'Minha Skill' };
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue(createdItem as never);
    const onCreated = vi.fn();

    render(<SkillForm onCreated={onCreated} />);

    await user.type(screen.getByLabelText('Nome'), 'Minha Skill');
    await user.type(screen.getByLabelText('Caminho local da pasta'), 'C:\\skills\\minha-skill');
    await user.click(screen.getByRole('button', { name: 'Adicionar skill' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'skill',
        name: 'Minha Skill',
        source_type: 'local_path',
        path: 'C:\\skills\\minha-skill',
      });
    });
    expect(onCreated).toHaveBeenCalledWith(createdItem);
  });

  it('submits a url skill after switching tabs', async () => {
    const user = userEvent.setup();
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue({} as never);

    render(<SkillForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Skill via URL');
    await user.click(screen.getByRole('tab', { name: 'URL' }));
    await user.type(screen.getByLabelText('URL do repositório da skill'), 'https://example.com/skill.git');
    await user.click(screen.getByRole('button', { name: 'Adicionar skill' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'skill',
        name: 'Skill via URL',
        source_type: 'url',
        url: 'https://example.com/skill.git',
      });
    });
  });

  it('submits an uploaded file skill after switching tabs', async () => {
    const user = userEvent.setup();
    const createItemSpy = vi.spyOn(api, 'createItem').mockResolvedValue({} as never);
    const file = new File(['# Skill'], 'SKILL.md', { type: 'text/markdown' });

    render(<SkillForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Skill Upload');
    await user.click(screen.getByRole('tab', { name: 'Upload' }));
    await user.upload(screen.getByLabelText('Arquivo (SKILL.md ou .zip)'), file);
    await user.click(screen.getByRole('button', { name: 'Adicionar skill' }));

    await waitFor(() => {
      expect(createItemSpy).toHaveBeenCalledWith({
        type: 'skill',
        name: 'Skill Upload',
        source_type: 'upload',
        file,
      });
    });
  });

  it('does not submit the local_path tab when the path is left empty', async () => {
    const user = userEvent.setup();
    const createItemSpy = vi.spyOn(api, 'createItem');

    render(<SkillForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Minha Skill');
    await user.click(screen.getByRole('button', { name: 'Adicionar skill' }));

    expect(createItemSpy).not.toHaveBeenCalled();
  });

  it('does not submit the url tab when the url is left empty', async () => {
    const user = userEvent.setup();
    const createItemSpy = vi.spyOn(api, 'createItem');

    render(<SkillForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Skill via URL');
    await user.click(screen.getByRole('tab', { name: 'URL' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar skill' }));

    expect(createItemSpy).not.toHaveBeenCalled();
  });

  it('shows an error when submitting the upload tab without a file', async () => {
    const user = userEvent.setup();
    const createItemSpy = vi.spyOn(api, 'createItem');

    render(<SkillForm onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome'), 'Skill Upload');
    await user.click(screen.getByRole('tab', { name: 'Upload' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar skill' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Selecione um arquivo para enviar.');
    expect(createItemSpy).not.toHaveBeenCalled();
  });
});
