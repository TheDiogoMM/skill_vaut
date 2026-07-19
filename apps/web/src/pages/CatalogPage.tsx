import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listItems, listCategories } from '../api/client.js';
import type { Category, Item } from '../types.js';

interface GroupedItems {
  category: string;
  items: Item[];
}

function groupByCategory(items: Item[], categories: Category[]): GroupedItems[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const name = item.categoryId !== null ? nameById.get(item.categoryId) ?? 'Sem categoria' : 'Sem categoria';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(item);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, groupItems]) => ({ category, items: groupItems }));
}

export function CatalogPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    Promise.all([listItems(), listCategories()])
      .then(([itemsResult, categoriesResult]) => {
        if (cancelled) return;
        setItems(itemsResult);
        setCategories(categoriesResult);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') return <p>Carregando catálogo...</p>;
  if (status === 'error') return <p role="alert">Não foi possível carregar o catálogo.</p>;
  if (items.length === 0) return <p>Nenhum item cadastrado ainda.</p>;

  const groups = groupByCategory(items, categories);

  return (
    <div>
      {groups.map((group) => (
        <section key={group.category}>
          <h2>{group.category}</h2>
          <ul>
            {group.items.map((item) => (
              <li key={item.id}>
                <Link to={`/items/${item.id}`}>{item.name}</Link> <span>({item.type})</span>
                <p>{item.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
