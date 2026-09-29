'use strict';

/**
 * Configuración de la Auth API leída de variables de entorno.
 * @module config
 */

/**
 * Cada rol se asocia a un consumer de Kong. Kong identifica al consumer por el
 * claim "iss" del token y aplica los permisos (ACL) del grupo correspondiente.
 * Estas claves deben coincidir con gateway/kong.template.yml.
 */
const ROLE_ISSUERS = Object.freeze({
  admin: 'qr-admin',
  analyst: 'qr-analyst',
});

/**
 * @typedef {Object} User
 * @property {string} username
 * @property {string} password
 * @property {keyof typeof ROLE_ISSUERS} role
 */

/**
 * @typedef {Object} Config
 * @property {number} port Puerto HTTP (PORT, 4000).
 * @property {string} jwtSecret Clave HS256 compartida con Kong (JWT_SECRET, mínimo 32 caracteres).
 * @property {number} tokenTtlSeconds Vigencia del token (JWT_TTL_SECONDS, 3600).
 * @property {User[]} users Usuarios iniciales (AUTH_USERS="usuario:clave:rol,..."). Con
 *   PostgreSQL se crean con bcrypt en el primer arranque; después manda la base de datos.
 * @property {string} [databaseUrl] Conexión a PostgreSQL (DATABASE_URL). Sin ella se usa memoria.
 */

/**
 * Convierte "admin:clave:admin,analyst:clave:analyst" en una lista de usuarios.
 *
 * @param {string} raw
 * @returns {User[]}
 */
function parseUsers(raw) {
  return raw.split(',').filter(Boolean).map((entry) => {
    const [username, password, role] = entry.split(':').map((part) => part?.trim());
    if (!username || !password || !role) {
      throw new Error(`AUTH_USERS: "${entry}" debe tener el formato usuario:clave:rol`);
    }
    if (!Object.hasOwn(ROLE_ISSUERS, role)) {
      throw new Error(`AUTH_USERS: el rol "${role}" no existe (roles: ${Object.keys(ROLE_ISSUERS).join(', ')})`);
    }
    return { username, password, role };
  });
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Config}
 */
function loadConfig(env = process.env) {
  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET es obligatorio y debe tener al menos 32 caracteres');
  }

  const port = Number(env.PORT ?? 4000);
  const tokenTtlSeconds = Number(env.JWT_TTL_SECONDS ?? 3600);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT debe ser un entero positivo');
  }
  if (!Number.isInteger(tokenTtlSeconds) || tokenTtlSeconds <= 0) {
    throw new Error('JWT_TTL_SECONDS debe ser un entero positivo');
  }

  const users = parseUsers(env.AUTH_USERS ?? '');
  if (users.length === 0) {
    throw new Error('AUTH_USERS debe definir al menos un usuario');
  }

  return { port, jwtSecret, tokenTtlSeconds, users, databaseUrl: env.DATABASE_URL || undefined };
}

module.exports = { loadConfig, parseUsers, ROLE_ISSUERS };
