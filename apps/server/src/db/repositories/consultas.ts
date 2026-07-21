import type Database from 'better-sqlite3';
import type { Consulta } from '../../types.js';

interface ConsultaRow {
  id: number;
  ideia: string;
  created_at: string;
}

function toConsulta(row: ConsultaRow): Consulta {
  return { id: row.id, ideia: row.ideia, createdAt: row.created_at };
}

export class ConsultasRepository {
  constructor(private db: Database.Database) {}

  create(ideia: string, respostaJson: string): Consulta {
    const createdAt = new Date().toISOString();
    const result = this.db
      .prepare('INSERT INTO consultas (ideia, resposta_json, created_at) VALUES (?, ?, ?)')
      .run(ideia, respostaJson, createdAt);
    return { id: Number(result.lastInsertRowid), ideia, createdAt };
  }

  listRecent(limit: number): Consulta[] {
    const rows = this.db
      .prepare('SELECT id, ideia, created_at FROM consultas ORDER BY created_at DESC, id DESC LIMIT ?')
      .all(limit) as ConsultaRow[];
    return rows.map(toConsulta);
  }
}
