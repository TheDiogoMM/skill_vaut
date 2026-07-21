import { useState, type FormEvent } from 'react';
import { createItem } from '../../api/client.js';
import type { Item } from '../../types.js';
import { Input } from '../../components/ui/forms/Input/Input.js';
import { Textarea } from '../../components/ui/forms/Textarea/Textarea.js';
import { Button } from '../../components/ui/core/Button/Button.js';
import { StatusMessage } from '../../components/ui/feedback/StatusMessage/StatusMessage.js';

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
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 18,
      }}
    >
      <Input id="mcp-name" label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        id="mcp-description"
        label="Descrição (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Textarea
        id="mcp-config"
        label="Config JSON (ex: bloco mcpServers)"
        mono
        value={configText}
        onChange={(e) => setConfigText(e.target.value)}
        required
      />
      <div>
        <Button type="submit" disabled={status === 'submitting'}>
          Adicionar MCP
        </Button>
      </div>
      {status === 'error' && <StatusMessage kind="error">{error}</StatusMessage>}
    </form>
  );
}
