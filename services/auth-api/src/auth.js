'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ROLE_ISSUERS } = require('./config');

/**
 * Autenticación de usuarios y emisión de tokens.
 * @module auth
 */

/**
 * Hash de una contraseña que nadie tiene. Si el usuario no existe se compara
 * contra él igualmente, para que el tiempo de respuesta no revele qué usuarios existen.
 */
const DUMMY_HASH = bcrypt.hashSync('usuario-inexistente', 10);

/**
 * Busca al usuario y verifica su contraseña con bcrypt.
 *
 * @param {import('./users').UserStore} store
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ username: string, role: string } | null>}
 */
async function authenticate(store, username, password) {
  const user = await store.findByUsername(username);
  const matches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  return user && matches ? { username: user.username, role: user.role } : null;
}

/**
 * Emite un JWT firmado con HS256. El claim "iss" identifica al consumer de Kong
 * del rol del usuario; Kong verifica la firma, "exp" y los permisos del rol.
 *
 * @param {{ username: string, role: string }} user
 * @param {{ secret: string, ttlSeconds: number }} options
 * @returns {string}
 */
function issueToken(user, { secret, ttlSeconds }) {
  return jwt.sign({ role: user.role }, secret, {
    algorithm: 'HS256',
    subject: user.username,
    issuer: ROLE_ISSUERS[user.role],
    expiresIn: ttlSeconds,
  });
}

module.exports = { authenticate, issueToken };
