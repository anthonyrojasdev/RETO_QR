'use strict';

const bcrypt = require('bcryptjs');

/**
 * Almacenes de usuarios. En Docker se usa PostgreSQL; sin DATABASE_URL (desarrollo
 * local y pruebas) se usa memoria. Las contraseñas siempre se guardan con bcrypt.
 * @module users
 */

/** Costo de bcrypt: ~50-100 ms por hash, suficiente para frenar ataques de diccionario. */
const BCRYPT_ROUNDS = 10;

/**
 * @typedef {Object} StoredUser
 * @property {string} username
 * @property {string} passwordHash Hash bcrypt de la contraseña.
 * @property {string} role
 */

/**
 * @typedef {Object} UserStore
 * @property {(username: string) => Promise<StoredUser | null>} findByUsername
 */

/**
 * Crea un almacén en memoria a partir de usuarios con contraseña en texto plano.
 *
 * @param {import('./config').User[]} users
 * @returns {Promise<UserStore>}
 */
async function createMemoryUserStore(users) {
  const byName = new Map();
  for (const { username, password, role } of users) {
    byName.set(username, { username, role, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) });
  }
  return { findByUsername: async (username) => byName.get(username) ?? null };
}

/** Esquema de la base "auth" (propiedad de este servicio). Idempotente. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    username      TEXT        PRIMARY KEY,
    password_hash TEXT        NOT NULL,
    role          TEXT        NOT NULL CHECK (role IN ('admin', 'analyst')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

/**
 * Crea un almacén respaldado por PostgreSQL.
 *
 * @param {import('pg').Pool} pool
 */
function createPostgresUserStore(pool) {
  return {
    /** Crea la tabla si no existe. */
    async migrate() {
      await pool.query(SCHEMA);
    },

    /**
     * Crea los usuarios iniciales que aún no existen. No modifica los existentes,
     * así un cambio de contraseña hecho en la base no se pierde al reiniciar.
     *
     * @param {import('./config').User[]} users
     * @returns {Promise<number>} Cantidad de usuarios creados.
     */
    async seed(users) {
      let created = 0;
      for (const { username, password, role } of users) {
        const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const result = await pool.query(
          'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING',
          [username, hash, role],
        );
        created += result.rowCount;
      }
      return created;
    },

    /** @type {UserStore['findByUsername']} */
    async findByUsername(username) {
      const { rows } = await pool.query(
        'SELECT username, password_hash AS "passwordHash", role FROM users WHERE username = $1',
        [username],
      );
      return rows[0] ?? null;
    },
  };
}

module.exports = { createMemoryUserStore, createPostgresUserStore, BCRYPT_ROUNDS };
