import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RepoForm } from './forms/RepoForm.js';
import { McpForm } from './forms/McpForm.js';
import { SkillForm } from './forms/SkillForm.js';
import { PluginForm } from './forms/PluginForm.js';
import { Select } from '../components/ui/forms/Select/Select.js';
import type { Item } from '../types.js';

type ItemTypeChoice = 'repo' | 'skill' | 'mcp' | 'plugin';
const VALID_TYPES: ItemTypeChoice[] = ['repo', 'skill', 'mcp', 'plugin'];

export function AddPage() {
  const [searchParams] = useSearchParams();
  const typeParam = searchParams.get('type');
  const initialType: ItemTypeChoice = VALID_TYPES.includes(typeParam as ItemTypeChoice)
    ? (typeParam as ItemTypeChoice)
    : 'repo';
  const initialName = searchParams.get('name') ?? '';
  const initialUrl = searchParams.get('url') ?? '';

  const [type, setType] = useState<ItemTypeChoice>(initialType);
  const navigate = useNavigate();

  function handleCreated(item: Item) {
    navigate(`/items/${item.id}`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 520 }}>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--fw-display)',
          color: 'var(--color-text)',
        }}
      >
        Adicionar item
      </h2>
      <Select
        label="Tipo"
        id="item-type"
        value={type}
        onChange={(e) => setType(e.target.value as ItemTypeChoice)}
        style={{ width: 220 }}
      >
        <option value="repo">Repositório</option>
        <option value="skill">Skill</option>
        <option value="mcp">MCP</option>
        <option value="plugin">Plugin</option>
      </Select>

      {type === 'repo' && <RepoForm onCreated={handleCreated} initialName={initialName} initialUrl={initialUrl} />}
      {type === 'skill' && <SkillForm onCreated={handleCreated} initialName={initialName} initialUrl={initialUrl} />}
      {type === 'mcp' && <McpForm onCreated={handleCreated} initialName={initialName} />}
      {type === 'plugin' && <PluginForm onCreated={handleCreated} initialName={initialName} initialUrl={initialUrl} />}
    </div>
  );
}
