import { useState } from 'react';
import { mergeCategory, renameCategory } from '../api/client.js';
import type { Category } from '../types.js';

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
    <section>
      <h3>Categorias</h3>
      <ul>
        {categories.map((category) => (
          <li key={category.id}>
            {renamingId === category.id ? (
              <>
                <label htmlFor={`rename-${category.id}`}>Novo nome</label>
                <input
                  id={`rename-${category.id}`}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                />
                <button type="button" onClick={() => submitRename(category.id)}>
                  Salvar
                </button>
              </>
            ) : (
              <>
                {category.name}{' '}
                <button type="button" onClick={() => startRename(category)}>
                  Renomear
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <div>
        <label htmlFor="merge-source">Mesclar categoria</label>
        <select id="merge-source" value={mergeSourceId} onChange={(e) => setMergeSourceId(e.target.value)}>
          <option value="">Selecione a origem</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <label htmlFor="merge-target">Em</label>
        <select id="merge-target" value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)}>
          <option value="">Selecione o destino</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <button type="button" onClick={submitMerge}>
          Mesclar
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
    </section>
  );
}
