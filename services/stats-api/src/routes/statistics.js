'use strict';

const express = require('express');
const { computeStatistics } = require('../services/statistics');
const { validateQRResult } = require('../validation/qrResult');
const { ApiError } = require('../errors');

/**
 * @openapi
 * components:
 *   schemas:
 *     Matrix:
 *       type: array
 *       description: Matriz representada fila a fila.
 *       items:
 *         type: array
 *         items:
 *           type: number
 *     QRResult:
 *       type: object
 *       required: [Q, R]
 *       properties:
 *         Q:
 *           $ref: '#/components/schemas/Matrix'
 *         R:
 *           $ref: '#/components/schemas/Matrix'
 *       example:
 *         Q: [[0.242536, 0.970143], [0.970143, -0.242536]]
 *         R: [[4.123106, 5.335784, 6.548462], [0, 0.727607, 1.455214]]
 *     MatrixSummary:
 *       type: object
 *       properties:
 *         rows: { type: integer, example: 2 }
 *         columns: { type: integer, example: 3 }
 *         isDiagonal: { type: boolean, example: false }
 *     Statistics:
 *       type: object
 *       properties:
 *         max: { type: number, description: Valor máximo, example: 6.548462 }
 *         min: { type: number, description: Valor mínimo, example: -0.242536 }
 *         average: { type: number, description: Promedio de todos los valores, example: 2.013046 }
 *         sum: { type: number, description: Suma total, example: 20.130457 }
 *         count: { type: integer, description: Cantidad de valores analizados, example: 10 }
 *         isAnyDiagonal: { type: boolean, description: Si alguna matriz es diagonal, example: false }
 *         matrices:
 *           type: object
 *           description: Resumen de cada matriz por nombre.
 *           additionalProperties:
 *             $ref: '#/components/schemas/MatrixSummary'
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: object
 *           properties:
 *             code: { type: string, example: INVALID_MATRICES }
 *             message: { type: string, example: Las matrices recibidas no son válidas }
 *             requestId: { type: string, example: 3f1b6c2e-7a55-4a8e-9b1d-0c5e2f7a9d10 }
 *             details:
 *               type: array
 *               items: { type: string }
 *               example: ['Q debe ser cuadrada por ser ortogonal (se recibió 2×3)']
 */

/**
 * Crea el router de estadísticas.
 *
 * @param {{ tolerance: number }} options Tolerancia para la comprobación de matriz diagonal.
 * @returns {import('express').Router}
 */
function statisticsRouter({ tolerance }) {
  const router = express.Router();

  /**
   * @openapi
   * /statistics:
   *   post:
   *     summary: Estadísticas de las matrices Q y R
   *     description: >
   *       Recibe el resultado de la factorización QR (Q y R) y calcula valor máximo,
   *       valor mínimo, promedio, suma total y si alguna de las matrices es diagonal.
   *       La usa internamente la QR API; a través de Kong solo pueden llamarla usuarios con rol admin.
   *     tags: [statistics]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/QRResult'
   *     responses:
   *       200:
   *         description: Estadísticas calculadas.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Statistics'
   *       400:
   *         description: JSON inválido o matrices con formato incorrecto.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       401:
   *         description: Token ausente, inválido o expirado (responde Kong).
   *       403:
   *         description: El rol del usuario no tiene acceso (responde Kong).
   */
  router.post('/statistics', (req, res) => {
    const errors = validateQRResult(req.body);
    if (errors.length > 0) {
      throw new ApiError(400, 'INVALID_MATRICES', 'Las matrices recibidas no son válidas', errors);
    }
    const { Q, R } = req.body;
    res.json(computeStatistics({ Q, R }, { tolerance }));
  });

  return router;
}

module.exports = { statisticsRouter };
