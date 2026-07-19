import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listItems, listCategories } from '../api/client.js';
import { SearchFilterBar, type Filters } from '../components/SearchFilterBar.js';
import { CategoryManager } from '../components/CategoryManager.js';
import type { Category, Item, ItemFilters } from '../types.js';

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

function toApiFilters(filters: Filters): ItemFilters {
  const apiFilters: ItemFilters = {};
  if (filters.q) apiFilters.q = filters.q;
  if (filters.type) apiFilters.type = filters.type;
  if (filters.category) apiFilters.category = Number(filters.category);
  if (filters.tag) apiFilters.tag = filters.tag;
  return apiFilters;
}

export function CatalogPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filters, setFilters] = useState<Filters>({ q: '', type: '', category: '', tag: '' });
  const [refreshToken, setRefreshToken] = useState(0);

  const refetchCategories = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    const timeoutId = window.setTimeout(() => {
      Promise.all([listItems(toApiFilters(filters)), listCategories()])
        .then(([itemsResult, categoriesResult]) => {
          if (cancelled) return;
          setItems(itemsResult);
          setCategories(categoriesResult);
          setStatus('ready');
        })
        .catch(() => {
          if (!cancelled) setStatus('error');
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [filters, refreshToken]);

  const groups = groupByCategory(items, categories);

  return (
    <div>
      <SearchFilterBar categories={categories} onChange={setFilters} />
      {status === 'loading' && <p>Carregando catálogo...</p>}
      {status === 'error' && <p role="alert">Não foi possível carregar o catálogo.</p>}
      {status === 'ready' && items.length === 0 && <p>Nenhum item cadastrado ainda.</p>}
      {status === 'ready' &&
        groups.map((group) => (
          <section key={group.category}>
            <h2>{group.category}</h2>
            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  <Link to={`/items/${item.id}`}>{item.name}</Link> <span>({item.type})</span>
                  <p>{item.summary}</p>
                  <p>{item.utility}</p>
                  <p>
                    {item.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </p>
                  <p>
                    <code>{item.localPath}</code>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      {status === 'ready' && <CategoryManager categories={categories} onChanged={refetchCategories} />}
    </div>
  );
}
