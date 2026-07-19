import { useState } from 'react';
import type { Category, ItemType } from '../types.js';

export interface Filters {
  q: string;
  type: ItemType | '';
  category: string;
  tag: string;
}

interface SearchFilterBarProps {
  categories: Category[];
  onChange: (filters: Filters) => void;
}

export function SearchFilterBar({ categories, onChange }: SearchFilterBarProps) {
  const [filters, setFilters] = useState<Filters>({ q: '', type: '', category: '', tag: '' });

  function update(partial: Partial<Filters>) {
    const next = { ...filters, ...partial };
    setFilters(next);
    onChange(next);
  }

  return (
    <div role="search">
      <input
        type="search"
        placeholder="Buscar..."
        aria-label="Buscar"
        value={filters.q}
        onChange={(e) => update({ q: e.target.value })}
      />
      <select
        aria-label="Tipo"
        value={filters.type}
        onChange={(e) => update({ type: e.target.value as ItemType | '' })}
      >
        <option value="">Todos os tipos</option>
        <option value="skill">Skill</option>
        <option value="repo">Repo</option>
        <option value="mcp">MCP</option>
      </select>
      <select aria-label="Categoria" value={filters.category} onChange={(e) => update({ category: e.target.value })}>
        <option value="">Todas as categorias</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Filtrar por tag"
        aria-label="Tag"
        value={filters.tag}
        onChange={(e) => update({ tag: e.target.value })}
      />
    </div>
  );
}
