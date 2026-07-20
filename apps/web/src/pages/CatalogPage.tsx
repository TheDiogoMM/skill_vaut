import { useCallback, useEffect, useState } from 'react';
import { listItems, listCategories } from '../api/client.js';
import { SearchFilterBar, type Filters } from '../components/SearchFilterBar.js';
import { CategoryManager } from '../components/CategoryManager.js';
import { ItemCard } from '../components/ui/data-display/ItemCard/ItemCard.js';
import { StatusMessage } from '../components/ui/feedback/StatusMessage/StatusMessage.js';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <h1
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--fw-display)',
          letterSpacing: 'var(--ls-display)',
          color: 'var(--color-text)',
        }}
      >
        Catálogo
      </h1>
      <SearchFilterBar categories={categories} onChange={setFilters} />
      {status === 'loading' && <p>Carregando catálogo...</p>}
      {status === 'error' && <StatusMessage kind="error">Não foi possível carregar o catálogo.</StatusMessage>}
      {status === 'ready' && items.length === 0 && <p>Nenhum item cadastrado ainda.</p>}
      {status === 'ready' &&
        groups.map((group) => (
          <section key={group.category} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-title)',
                fontWeight: 'var(--fw-title)',
                color: 'var(--color-text)',
              }}
            >
              {group.category}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {group.items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
      {status === 'ready' && <CategoryManager categories={categories} onChanged={refetchCategories} />}
    </div>
  );
}
