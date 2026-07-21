import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDb } from '../connection.js';
import { ConsultasRepository } from './consultas.js';

describe('ConsultasRepository', () => {
  let db: Database.Database;
  let repo: ConsultasRepository;

  beforeEach(() => {
    db = createDb(':memory:');
    repo = new ConsultasRepository(db);
  });

  it('creates a consulta and returns it without the response payload', () => {
    const consulta = repo.create('app de leitura de PDFs', '{"skills":[],"repos":[],"mcps":[]}');
    expect(consulta.ideia).toBe('app de leitura de PDFs');
    expect(consulta.id).toBeGreaterThan(0);
    expect(consulta.createdAt).toBeTruthy();
  });

  it('persists the response JSON in the database even though create() does not return it', () => {
    repo.create('ideia', '{"skills":[],"repos":[],"mcps":[]}');
    const row = db.prepare('SELECT resposta_json FROM consultas').get() as { resposta_json: string };
    expect(row.resposta_json).toBe('{"skills":[],"repos":[],"mcps":[]}');
  });

  it('lists the most recent consultas first, respecting the limit', () => {
    for (let i = 0; i < 15; i++) {
      repo.create(`ideia ${i}`, '{}');
    }
    const recent = repo.listRecent(10);
    expect(recent).toHaveLength(10);
    expect(recent[0].ideia).toBe('ideia 14');
    expect(recent[9].ideia).toBe('ideia 5');
  });
});
