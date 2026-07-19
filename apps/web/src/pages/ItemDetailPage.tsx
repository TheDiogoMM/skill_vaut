import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { getItem, listCategories, updateItem } from '../api/client.js';
import type { Category, ItemDetail } from '../types.js';

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [copied, setCopied] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus('loading');
    Promise.all([getItem(Number(id)), listCategories()])
      .then(([itemResult, categoriesResult]) => {
        if (cancelled) return;
        setItem(itemResult);
        setCategories(categoriesResult);
        setCategoryId(itemResult.categoryId !== null ? String(itemResult.categoryId) : '');
        setTagsInput(itemResult.tags.join(', '));
        setSaveStatus('idle');
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleCopy() {
    if (!item) return;
    await navigator.clipboard.writeText(item.localPath);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave() {
    if (!item) return;
    setSaveStatus('saving');
    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const updated = await updateItem(item.id, {
        categoryId: categoryId ? Number(categoryId) : null,
        tags,
      });
      setItem({ ...item, ...updated });
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }

  if (status === 'loading') return <p>Carregando item...</p>;
  if (status === 'error' || !item) return <p role="alert">Não foi possível carregar o item.</p>;

  return (
    <article>
      <h2>{item.name}</h2>
      <p>{item.summary}</p>
      <p>{item.utility}</p>
      <p>
        <code>{item.localPath}</code>{' '}
        <button type="button" onClick={handleCopy}>
          {copied ? 'Copiado!' : 'Copiar caminho'}
        </button>
      </p>

      <div>
        <label htmlFor="item-category">Categoria</label>
        <select id="item-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Sem categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <label htmlFor="item-tags">Tags (separadas por vírgula)</label>
        <input id="item-tags" type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />

        <button type="button" onClick={handleSave} disabled={saveStatus === 'saving'}>
          Salvar
        </button>
        {saveStatus === 'saved' && <span>Salvo!</span>}
        {saveStatus === 'error' && <span role="alert">Erro ao salvar.</span>}
      </div>

      {item.type === 'mcp' ? <pre>{item.content}</pre> : <ReactMarkdown>{item.content}</ReactMarkdown>}
    </article>
  );
}
