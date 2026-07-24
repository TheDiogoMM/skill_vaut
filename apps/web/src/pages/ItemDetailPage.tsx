import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { getItem, listCategories, updateItem } from '../api/client.js';
import type { Category, ItemDetail } from '../types.js';
import { Button } from '../components/ui/core/Button/Button.js';
import { Icon } from '../components/ui/core/Icon/Icon.js';
import { Select } from '../components/ui/forms/Select/Select.js';
import { Input } from '../components/ui/forms/Input/Input.js';
import { Tag } from '../components/ui/data-display/Tag/Tag.js';
import { TypeBadge } from '../components/ui/data-display/TypeBadge/TypeBadge.js';
import { RepoDownloadAction } from '../components/ui/data-display/RepoDownloadAction/RepoDownloadAction.js';
import { StatusMessage } from '../components/ui/feedback/StatusMessage/StatusMessage.js';

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
      setItem((prev) => (prev ? { ...prev, ...updated } : prev));
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }

  if (status === 'loading') return <p>Carregando item...</p>;
  if (status === 'error' || !item) return <StatusMessage kind="error">Não foi possível carregar o item.</StatusMessage>;

  const parsedTags = tagsInput
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return (
    <article style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-display)',
            fontWeight: 'var(--fw-display)',
            color: 'var(--color-text)',
          }}
        >
          {item.name}
        </h2>
        <TypeBadge type={item.type} />
      </div>
      <p style={{ margin: 0, fontSize: 15, color: 'var(--color-text-secondary)' }}>{item.summary}</p>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-tertiary)' }}>{item.utility}</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <code
          style={{
            background: 'var(--color-bg-inset)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
          }}
        >
          {item.localPath}
        </code>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Icon name={copied ? 'check' : 'copy'} size={13} />}
          onClick={handleCopy}
        >
          {copied ? 'Copiado!' : 'Copiar caminho'}
        </Button>
        <RepoDownloadAction item={item} onUpdated={(updated) => setItem((prev) => (prev ? { ...prev, ...updated } : prev))} />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-end',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 16,
          flexWrap: 'wrap',
        }}
      >
        <Select
          label="Categoria"
          id="item-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          style={{ width: 200 }}
        >
          <option value="">Sem categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <Input
          label="Tags (separadas por vírgula)"
          id="item-tags"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          style={{ width: 260 }}
        />
        <Button onClick={handleSave} disabled={saveStatus === 'saving'}>
          Salvar
        </Button>
        {saveStatus === 'saved' && <StatusMessage kind="success">Salvo!</StatusMessage>}
        {saveStatus === 'error' && <StatusMessage kind="error">Erro ao salvar.</StatusMessage>}
      </div>

      {parsedTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {parsedTags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}

      {item.type === 'mcp' ? <pre>{item.content}</pre> : <ReactMarkdown>{item.content}</ReactMarkdown>}
    </article>
  );
}
