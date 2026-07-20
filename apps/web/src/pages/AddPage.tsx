import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RepoForm } from './forms/RepoForm.js';
import { McpForm } from './forms/McpForm.js';
import { SkillForm } from './forms/SkillForm.js';
import { Select } from '../components/ui/forms/Select/Select.js';
import type { Item } from '../types.js';

type ItemTypeChoice = 'repo' | 'skill' | 'mcp';

export function AddPage() {
  const [type, setType] = useState<ItemTypeChoice>('repo');
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
      </Select>

      {type === 'repo' && <RepoForm onCreated={handleCreated} />}
      {type === 'skill' && <SkillForm onCreated={handleCreated} />}
      {type === 'mcp' && <McpForm onCreated={handleCreated} />}
    </div>
  );
}
