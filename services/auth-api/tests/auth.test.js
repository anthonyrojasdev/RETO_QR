'use strict';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createApp } = require('../src/app');
const { authenticate, issueToken } = require('../src/auth');
const { loadConfig, parseUsers } = require('../src/config');
const { createMemoryUserStore } = require('../src/users');

const secret = 'clave-de-pruebas-de-al-menos-32-caracteres';
const users = parseUsers('admin:AdminPass1:admin,ana:AnaPass1:analyst');

let userStore;
let app;

beforeAll(async () => {
  userStore = await createMemoryUserStore(users);
  app = createApp({ jwtSecret: secret, tokenTtlSeconds: 3600, userStore });
});

describe('POST /auth/login', () => {
  test('emite un JWT HS256 con el consumer de Kong del rol', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'ana', password: 'AnaPass1' })
      .expect(200);

    expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600, user: { username: 'ana', role: 'analyst' } });
    expect(res.headers['cache-control']).toBe('no-store');

    const claims = jwt.verify(res.body.accessToken, secret, { algorithms: ['HS256'] });
    expect(claims).toMatchObject({ iss: 'qr-analyst', sub: 'ana', role: 'analyst' });
    expect(claims.exp - claims.iat).toBe(3600);
  });

  test('el administrador recibe el consumer qr-admin', async () => {
    const res = await request(app).post('/auth/login').send({ username: 'admin', password: 'AdminPass1' }).expect(200);
    expect(jwt.decode(res.body.accessToken).iss).toBe('qr-admin');
  });

  test.each([
    ['contraseña incorrecta', { username: 'ana', password: 'otra' }],
    ['usuario inexistente', { username: 'nadie', password: 'AnaPass1' }],
  ])('responde 401 con el mismo mensaje: %s', async (_name, body) => {
    const res = await request(app).post('/auth/login').send(body).expect(401);
    expect(res.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos' });
  });

  test.each([
    ['sin cuerpo', undefined],
    ['sin password', { username: 'ana' }],
    ['tipos incorrectos', { username: 1, password: true }],
  ])('responde 400 si faltan credenciales: %s', async (_name, body) => {
    const res = await request(app).post('/auth/login').send(body).expect(400);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS_FORMAT');
  });

  test('responde 503 si no se puede consultar la base de usuarios', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const brokenStore = { findByUsername: async () => { throw new Error('connection refused'); } };
    const brokenApp = createApp({ jwtSecret: secret, tokenTtlSeconds: 60, userStore: brokenStore });

    const res = await request(brokenApp).post('/auth/login').send({ username: 'ana', password: 'x' }).expect(503);
    expect(res.body.error.code).toBe('AUTH_UNAVAILABLE');
  });

  test('responde 400 si el JSON está mal formado', async () => {
    const res = await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{"username":').expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  test('responde 413 si el cuerpo es demasiado grande', async () => {
    const res = await request(app).post('/auth/login').send({ username: 'a', password: 'x'.repeat(20_000) }).expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('propaga el X-Request-ID y registra la petición', async () => {
    const lines = [];
    const loggedApp = createApp({ jwtSecret: secret, tokenTtlSeconds: 60, userStore, logger: { info: (l) => lines.push(l) } });

    const res = await request(loggedApp).get('/health').set('X-Request-ID', 'req-auth').expect(200);

    expect(res.headers['x-request-id']).toBe('req-auth');
    expect(JSON.parse(lines[0])).toMatchObject({ requestId: 'req-auth', status: 200 });
  });

  test('ruta inexistente responde 404', async () => {
    const res = await request(app).get('/no-existe').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('authenticate e issueToken', () => {
  test('authenticate devuelve el usuario solo con la contraseña correcta', async () => {
    await expect(authenticate(userStore, 'admin', 'AdminPass1')).resolves.toEqual({ username: 'admin', role: 'admin' });
    await expect(authenticate(userStore, 'admin', 'adminpass1')).resolves.toBeNull();
    await expect(authenticate(userStore, 'desconocido', 'AdminPass1')).resolves.toBeNull();
  });

  test('issueToken respeta la vigencia configurada', () => {
    const claims = jwt.verify(issueToken({ username: 'admin', role: 'admin' }, { secret, ttlSeconds: 120 }), secret);
    expect(claims.exp - claims.iat).toBe(120);
  });
});

describe('configuración', () => {
  const base = { JWT_SECRET: secret, AUTH_USERS: 'admin:AdminPass1:admin' };

  test('usa valores por defecto', () => {
    expect(loadConfig(base)).toEqual({
      port: 4000, jwtSecret: secret, tokenTtlSeconds: 3600, databaseUrl: undefined,
      users: [{ username: 'admin', password: 'AdminPass1', role: 'admin' }],
    });
  });

  test('lee DATABASE_URL', () => {
    expect(loadConfig({ ...base, DATABASE_URL: 'postgres://u:p@db/auth' }).databaseUrl).toBe('postgres://u:p@db/auth');
  });

  test.each([
    [{ ...base, JWT_SECRET: 'corta' }, /JWT_SECRET/],
    [{ ...base, PORT: 'x' }, /PORT/],
    [{ ...base, JWT_TTL_SECONDS: '0' }, /JWT_TTL_SECONDS/],
    [{ ...base, AUTH_USERS: '' }, /al menos un usuario/],
    [{ ...base, AUTH_USERS: 'admin:sin-rol' }, /formato usuario:clave:rol/],
    [{ ...base, AUTH_USERS: 'eva:Clave1:superadmin' }, /rol "superadmin" no existe/],
  ])('rechaza configuración inválida %#', (env, message) => {
    expect(() => loadConfig(env)).toThrow(message);
  });
});
