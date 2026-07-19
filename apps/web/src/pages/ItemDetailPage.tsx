import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { getItem } from '../api/client.js';
import type { ItemDetail } from '../types.js';

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStatus('loading');
    getItem(Number(id))
      .then((result) => {
        if (cancelled) return;
        setItem(result);
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
      <ul>
        {item.tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
      {item.type === 'mcp' ? <pre>{item.content}</pre> : <ReactMarkdown>{item.content}</ReactMarkdown>}
    </article>
  );
}
