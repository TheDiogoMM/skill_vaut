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

  it('returns 400 from PATCH when the body is missing a name', async () => {
    const app = buildApp({ db: createDb(':memory:') });

    const create = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'dev-tools' },
    });
    const category = create.json();

    const rename = await app.inject({
      method: 'PATCH',
      url: `/api/categories/${category.id}`,
      payload: {},
    });
    expect(rename.statusCode).toBe(400);
  });

  it('returns 404 from merge when target_id does not refer to a real category', async () => {
    const app = buildApp({ db: createDb(':memory:') });

    const create = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'dev-tools' },
    });
    const category = create.json();

    const merge = await app.inject({
      method: 'POST',
      url: `/api/categories/${category.id}/merge`,
      payload: { target_id: 999999 },
    });
    expect(merge.statusCode).toBe(404);
  });

  it('returns 400 from merge when source and target ids are the same', async () => {
    const app = buildApp({ db: createDb(':memory:') });

    const create = await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'dev-tools' },
    });
    const category = create.json();

    const merge = await app.inject({
      method: 'POST',
      url: `/api/categories/${category.id}/merge`,
      payload: { target_id: category.id },
    });
    expect(merge.statusCode).toBe(400);
  });
});
