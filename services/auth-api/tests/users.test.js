'use strict';

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { createMemoryUserStore, createPostgresUserStore } = require('../src/users');

describe('createMemoryUserStore', () => {
  test('guarda las contraseñas con bcrypt, nunca en texto plano', async () => {
    const store = await createMemoryUserStore([{ username: 'ana', password: 'AnaPass1', role: 'analyst' }]);
    const user = await store.findByUsername('ana');

    expect(user.passwordHash).not.toContain('AnaPass1');
    expect(user.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    await expect(bcrypt.compare('AnaPass1', user.passwordHash)).resolves.toBe(true);
    await expect(store.findByUsername('nadie')).resolves.toBeNull();
  });
});

// Se ejecuta solo si TEST_DATABASE_URL apunta a un PostgreSQL real (en CI).
const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeWithDatabase('createPostgresUserStore (integración)', () => {
  let pool;
  let store;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    store = createPostgresUserStore(pool);
    await store.migrate();
    await pool.query("DELETE FROM users WHERE username LIKE 'test-%'");
  });

  afterAll(() => pool.end());

  test('crea los usuarios iniciales una sola vez y no pisa los existentes', async () => {
    const users = [{ username: 'test-ana', password: 'AnaPass1', role: 'analyst' }];

    await expect(store.seed(users)).resolves.toBe(1);
    await expect(store.seed([{ ...users[0], password: 'OtraClave' }])).resolves.toBe(0);

    const saved = await store.findByUsername('test-ana');
    expect(saved).toMatchObject({ username: 'test-ana', role: 'analyst' });
    await expect(bcrypt.compare('AnaPass1', saved.passwordHash)).resolves.toBe(true);
  });

  test('el rol está restringido por la base de datos', async () => {
    await expect(
      pool.query("INSERT INTO users (username, password_hash, role) VALUES ('test-x', 'h', 'root')"),
    ).rejects.toThrow(/check constraint/);
  });
});
