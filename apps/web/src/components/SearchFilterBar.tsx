import { useState } from 'react';
import type { Category, ItemType } from '../types.js';
import { Input } from './ui/forms/Input/Input.js';
import { Select } from './ui/forms/Select/Select.js';

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
    <div role="search" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <Input
        type="search"
        placeholder="Buscar..."
        aria-label="Buscar"
        value={filters.q}
        onChange={(e) => update({ q: e.target.value })}
        style={{ width: 220 }}
      />
      <Select
        aria-label="Tipo"
        value={filters.type}
        onChange={(e) => update({ type: e.target.value as ItemType | '' })}
        style={{ width: 160 }}
      >
        <option value="">Todos os tipos</option>
        <option value="skill">Skill</option>
        <option value="repo">Repo</option>
        <option value="mcp">MCP</option>
      </Select>
      <Select
        aria-label="Categoria"
        value={filters.category}
        onChange={(e) => update({ category: e.target.value })}
        style={{ width: 190 }}
      >
        <option value="">Todas as categorias</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
      <Input
        type="text"
        placeholder="Filtrar por tag"
        aria-label="Tag"
        value={filters.tag}
        onChange={(e) => update({ tag: e.target.value })}
        style={{ width: 160 }}
      />
    </div>
  );
}
