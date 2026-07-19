import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';

interface McpFormProps {
  onCreated: (item: Item) => void;
}

export function McpForm({ onCreated }: McpFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [configText, setConfigText] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(configText);
    } catch {
      setError('O config precisa ser um JSON válido.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    try {
      const item = await createItem({ type: 'mcp', name, config: parsedConfig, description: description || undefined });
      setName('');
      setDescription('');
      setConfigText('');
      setStatus('idle');
      onCreated(item);
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="mcp-name">Nome</label>
      <input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} required />

      <label htmlFor="mcp-description">Descrição (opcional)</label>
      <input id="mcp-description" value={description} onChange={(e) => setDescription(e.target.value)} />

      <label htmlFor="mcp-config">Config JSON (ex: bloco mcpServers)</label>
      <textarea id="mcp-config" value={configText} onChange={(e) => setConfigText(e.target.value)} required />

      <button type="submit" disabled={status === 'submitting'}>
        Adicionar MCP
      </button>
      {status === 'error' && <p role="alert">{error}</p>}
    </form>
  );
}
