import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RepoForm } from './forms/RepoForm.js';
import { McpForm } from './forms/McpForm.js';
import { SkillForm } from './forms/SkillForm.js';
import type { Item } from '../types.js';

type ItemTypeChoice = 'repo' | 'skill' | 'mcp';

export function AddPage() {
  const [type, setType] = useState<ItemTypeChoice>('repo');
  const navigate = useNavigate();

  function handleCreated(item: Item) {
    navigate(`/items/${item.id}`);
  }

  return (
    <div>
      <h2>Adicionar item</h2>
      <label htmlFor="item-type">Tipo</label>
      <select id="item-type" value={type} onChange={(e) => setType(e.target.value as ItemTypeChoice)}>
        <option value="repo">Repositório</option>
        <option value="skill">Skill</option>
        <option value="mcp">MCP</option>
      </select>

      {type === 'repo' && <RepoForm onCreated={handleCreated} />}
      {type === 'skill' && <SkillForm onCreated={handleCreated} />}
      {type === 'mcp' && <McpForm onCreated={handleCreated} />}
    </div>
  );
}
