import { describe, it, expect } from 'vitest';
import { createDb } from '../db/connection.js';
import { buildApp } from '../app.js';

describe('categories routes', () => {
  it('creates, lists, renames, and merges categories', async () => {
    const app = buildApp({ db: createDb(':memory:') });

    const createA = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'dev-tools' },
    });
    expect(createA.statusCode).toBe(201);
    const categoryA = createA.json();

    const createB = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'automacao' },
    });
    const categoryB = createB.json();

    const list = await app.inject({ method: 'GET', url: '/api/categories' });
    expect(list.json()).toHaveLength(2);

    const rename = await app.inject({
      method: 'PATCH',
      url: `/api/categories/${categoryA.id}`,
      payload: { name: 'ferramentas-dev' },
    });
    expect(rename.json().name).toBe('ferramentas-dev');

    const merge = await app.inject({
      method: 'POST',
      url: `/api/categories/${categoryA.id}/merge`,
      payload: { target_id: categoryB.id },
    });
    expect(merge.statusCode).toBe(204);

    const finalList = await app.inject({ method: 'GET', url: '/api/categories' });
    expect(finalList.json()).toHaveLength(1);
  });
});
