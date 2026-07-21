import { useState } from 'react';
import { mergeCategory, renameCategory } from '../api/client.js';
import type { Category } from '../types.js';
import { Input } from './ui/forms/Input/Input.js';
import { Select } from './ui/forms/Select/Select.js';
import { Button } from './ui/core/Button/Button.js';
import { StatusMessage } from './ui/feedback/StatusMessage/StatusMessage.js';

interface CategoryManagerProps {
  categories: Category[];
  onChanged: () => void;
}

export function CategoryManager({ categories, onChanged }: CategoryManagerProps) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [error, setError] = useState('');

  function startRename(category: Category) {
    setRenamingId(category.id);
    setRenameValue(category.name);
  }

  async function submitRename(id: number) {
    setError('');
    try {
      await renameCategory(id, renameValue);
      setRenamingId(null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitMerge() {
    setError('');
    if (!mergeSourceId || !mergeTargetId) return;
    try {
      await mergeCategory(Number(mergeSourceId), Number(mergeTargetId));
      setMergeSourceId('');
      setMergeTargetId('');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontFamily: 'var(--font-sans)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 16,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14, color: 'var(--color-text)' }}>Categorias</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {categories.map((category) => (
          <div key={category.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {renamingId === category.id ? (
              <>
                <Input
                  label="Novo nome"
                  id={`rename-${category.id}`}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  style={{ width: 200 }}
                />
                <Button size="sm" onClick={() => submitRename(category.id)}>
                  Salvar
                </Button>
              </>
            ) : (
              <>
                <span style={{ fontSize: 14, color: 'var(--color-text)', width: 200 }}>{category.name}</span>
                <Button size="sm" variant="ghost" onClick={() => startRename(category)}>
                  Renomear
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Select
          label="Mesclar categoria"
          id="merge-source"
          value={mergeSourceId}
          onChange={(e) => setMergeSourceId(e.target.value)}
          style={{ width: 170 }}
        >
          <option value="">Selecione a origem</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Select
          label="Em"
          id="merge-target"
          value={mergeTargetId}
          onChange={(e) => setMergeTargetId(e.target.value)}
          style={{ width: 170 }}
        >
          <option value="">Selecione o destino</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={submitMerge}>
          Mesclar
        </Button>
      </div>

      {error && <StatusMessage kind="error">{error}</StatusMessage>}
    </section>
  );
}
