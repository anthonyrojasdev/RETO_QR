# Reto QR — Factorización QR con Go, Node.js y Kong

Sistema de microservicios que recibe una matriz rectangular, calcula su **factorización QR** en Go y
obtiene **estadísticas** de Q y R en Node.js. Todo se expone a través de un **API Gateway (Kong)** con JWT,
y se incluye un **frontend en React + TypeScript**.

| Pieza | Tecnología | Responsabilidad |
|---|---|---|
| `services/qr-api` | Go 1.25 · Fiber · Gonum | Factorización QR, caché (Redis) e historial (PostgreSQL) |
| `services/stats-api` | Node.js · Express | Máximo, mínimo, promedio, suma y matriz diagonal sobre Q y R |
| `services/auth-api` | Node.js · Express | Login y emisión de JWT; usuarios con bcrypt en PostgreSQL |
| `gateway` | Kong 3.9 (db-less) | JWT, roles (ACL), rate limiting, CORS, X-Request-ID, logs |
| `frontend` | React 19 · TypeScript · Vite | Login, editor de matrices, resultados, estadísticas e historial |
| Infraestructura | PostgreSQL 17 · Redis 7 · Docker Compose · GitHub Actions | Datos, caché, orquestación y CI/CD |

## Arquitectura

```
                         Navegador (React)                curl / Postman
                               │                                │
                               └────────────── HTTPS ───────────┘
                                                │
                                   ┌────────────▼────────────┐
                                   │       KONG  :8000       │  JWT · ACL por rol · rate limit (Redis)
                                   │     (único expuesto)    │  CORS · tamaño máx. · X-Request-ID · logs
                                   └──┬──────────┬────────┬──┘
                    /api/auth/login   │  /api/qr │        │ /api/statistics (solo admin)
                           ┌──────────▼┐   ┌─────▼──────┐ │
                           │ auth-api  │   │  qr-api    │ │
                           │ (Node)    │   │  (Go)      │─┼──── HTTP ────┐
                           └─────┬─────┘   └──┬──────┬──┘ │              │
                                 │            │      │    │     ┌────────▼────────┐
                           ┌─────▼────────────▼┐  ┌──▼──┐ └────►│   stats-api     │
                           │    PostgreSQL     │  │Redis│       │   (Node)        │
                           │ db auth │ db qr   │  └─────┘       └─────────────────┘
                           └───────────────────┘
```

Flujo de `POST /api/qr`:

1. **Kong** asigna un `X-Request-ID`, verifica el JWT (firma y `exp`), el rol (ACL) y el límite de peticiones.
2. **qr-api (Go)** valida la matriz y busca el resultado en **Redis** (la QR es determinista).
3. Si no está en caché, factoriza con **Gonum** y envía Q y R por HTTP a **stats-api (Node)**.
4. **stats-api** valida Q y R y calcula las estadísticas en una sola pasada.
5. qr-api guarda el cálculo en el **historial** del usuario (PostgreSQL) y responde `Q`, `R` y `statistics`.

Solo Kong (8000) y el frontend (5173) publican puertos; los servicios, PostgreSQL y Redis quedan en la red interna.

## Ejecutar con Docker

Requisitos: Docker con Compose v2.

```bash
cp .env.example .env
docker compose up -d --build --wait
```

Si Docker está instalado dentro de WSL, ejecuta los mismos comandos desde WSL en la carpeta del proyecto
(por ejemplo `cd /mnt/c/Users/<usuario>/Documents/Reto_QR`); los puertos 8000 y 5173 quedan accesibles
desde Windows. Para detener todo: `docker compose down` (agrega `-v` para borrar también los datos de PostgreSQL).

| URL | Qué es |
|---|---|
| http://localhost:5173 | Frontend |
| http://localhost:8000 | API (Kong) |
| http://localhost:8000/api/docs/qr/index.html | OpenAPI de la QR API |
| http://localhost:8000/api/docs/stats/ | OpenAPI de la Stats API (con la barra final) |

Usuarios de prueba (definidos en `.env.example`):

| Usuario | Contraseña | Rol | Puede |
|---|---|---|---|
| `analyst` | `Analyst123!` | analyst | `POST /api/qr`, `GET /api/qr/history` |
| `admin` | `Admin123!` | admin | Lo anterior y `POST /api/statistics` |

## Uso de la API

```bash
# 1. Obtener un token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"analyst","password":"Analyst123!"}' | jq -r .accessToken)

# 2. Factorizar (ejemplo del enunciado)
curl -s -X POST http://localhost:8000/api/qr \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"matrix": [[1,2,3],[4,5,6]]}'

# 3. Historial del usuario
curl -s http://localhost:8000/api/qr/history?limit=5 -H "Authorization: Bearer $TOKEN"
```

Respuesta de `POST /api/qr` (valores exactos: Q₁₁ = 1/√17, R₁₁ = √17):

```json
{
  "Q": [[0.242536, 0.970143], [0.970143, -0.242536]],
  "R": [[4.123106, 5.335784, 6.548462], [0, 0.727607, 1.455214]],
  "statistics": {
    "max": 6.548462, "min": -0.242536, "average": 2.013046, "sum": 20.130457, "count": 10,
    "isAnyDiagonal": false,
    "matrices": {
      "Q": { "rows": 2, "columns": 2, "isDiagonal": false },
      "R": { "rows": 2, "columns": 3, "isDiagonal": false }
    }
  }
}
```

Cabeceras útiles: `X-Request-ID` (trazabilidad en los logs de Kong, Go y Node) y `X-Cache: HIT|MISS`.

Todos los servicios responden los errores con el mismo formato:

```json
{ "error": { "code": "INVALID_MATRIX", "message": "la matriz debe ser rectangular: ...", "requestId": "..." } }
```

| Estado | Cuándo |
|---|---|
| 400 | JSON inválido, matriz vacía, no rectangular, con `null` o mayor a 100×100 |
| 401 | Sin token, firma inválida o token expirado (Kong) |
| 403 | El rol no tiene acceso a la ruta (Kong ACL) |
| 413 | Cuerpo mayor a 1 MB (Kong) |
| 415 | El cuerpo no es `application/json` |
| 429 | Límite de peticiones superado (Kong + Redis) |
| 502 | La Stats API no respondió correctamente |

## Decisiones técnicas

**Factorización QR y no rotación.** La sección de arquitectura del enunciado menciona "rotación de la matriz",
pero la funcionalidad requerida pide explícitamente la factorización QR; se interpretó la mención como un
remanente y se implementó QR.

**QR completa, también para m < n.** Se devuelve Q ortogonal (m×m) y R triangular superior (m×n), la definición
estándar de "Q ortogonal". Gonum solo factoriza matrices con m ≥ n, pero el ejemplo del enunciado es 2×3: para
m < n se factoriza el bloque cuadrado A[:, :m] = Q·R₁ y se completa R = [R₁ | Qᵀ·A[:, m:]], que cumple A = Q·R
porque Q es ortogonal.

**Signos normalizados.** Se fuerza la diagonal de R a ser no negativa (cambiando el signo de filas de R y columnas
de Q). Así el resultado es único para matrices de rango completo y las pruebas pueden comparar valores exactos.

**Contrato Go → Node.** La Stats API recibe exactamente el resultado de la QR (`{ "Q", "R" }`) y valida que sea
coherente: Q cuadrada (por ser ortogonal) y con tantas filas como R. Las estadísticas se calculan en una pasada
O(n) sin `Math.max(...valores)`, que desborda la pila con matrices grandes.

**Matriz diagonal con tolerancia.** En punto flotante un cero puede llegar como `1e-17`; se considera cero todo
valor con |x| ≤ 1e-10 (`DIAGONAL_TOLERANCE`). La definición aplica también a matrices rectangulares y se informa
por matriz (`matrices.Q.isDiagonal`) y en conjunto (`isAnyDiagonal`, "si alguna matriz es diagonal").

**Kong como gateway.** Centraliza lo transversal para que las APIs solo tengan lógica de negocio: JWT, ACL por rol,
rate limiting, CORS, límite de tamaño, `X-Request-ID` y logs JSON sin el token. Se prefirió sobre NGINX (la
validación JWT nativa es de NGINX Plus) y Traefik (su middleware JWT es de Traefik Hub). Corre en modo
declarativo (db-less): la configuración vive en el repositorio (`gateway/kong.template.yml`) y los secretos
llegan por variables de entorno.

**JWT y roles.** La Auth API firma tokens HS256 cuyo claim `iss` identifica un *consumer* de Kong por rol; Kong
verifica firma y expiración y aplica la ACL del grupo. En producción se reemplazaría por un proveedor de
identidad (Keycloak, Auth0, Cognito) con RS256/JWKS, sin cambiar las APIs.

**Redis.** Guarda los contadores de rate limiting (compartidos si hay varias instancias de Kong) y un caché de
resultados en la QR API: la misma matriz produce siempre la misma respuesta, así que se reutiliza sin recalcular
ni llamar a Node. Si Redis falla, la API sigue respondiendo sin caché.

**PostgreSQL, una base por servicio.** `auth` guarda usuarios con contraseñas bcrypt (nunca en texto plano) y
`qr` el historial de cada usuario. Cada servicio tiene su propio usuario de base de datos y crea su esquema al
arrancar. Si la base del historial falla, la factorización responde igual.

**Resiliencia y trazabilidad.** Go llama a Node con timeout y un reintento ante errores de red o 5xx (calcular
estadísticas es idempotente). Cada petición conserva el mismo `X-Request-ID` en Kong, Go y Node. Los servicios
tienen healthchecks, apagado ordenado e imágenes mínimas sin usuario root (Go usa distroless).

## Estructura

```
.
├── docker-compose.yml          # entorno completo
├── docker-compose.prod.yml     # VPS: imágenes de GHCR + Caddy
├── .env.prod.example           # plantilla de producción
├── deploy/                     # Caddyfile, bootstrap del VPS y backups
├── .env.example                # configuración y secretos de desarrollo
├── gateway/                    # Kong: configuración declarativa y entrypoint
├── infra/postgres/init.sh      # crea las bases auth y qr con sus usuarios
├── services/
│   ├── qr-api/                 # Go: cmd/server, internal/{qr,httpapi,stats,cache,history,identity,config}
│   ├── stats-api/              # Node: src/{routes,services,validation}, tests/
│   └── auth-api/               # Node: src/{auth,users,config}, tests/
├── frontend/                   # React + TypeScript + Vite
├── tests/e2e/                  # pruebas de extremo a extremo a través de Kong
└── .github/workflows/ci.yml    # CI/CD
```

## Pruebas

| Nivel | Qué cubre | Comando |
|---|---|---|
| Unitarias Go | QR (propiedades Qᵀ·Q = I, Q·R = A, R triangular), validación, cliente HTTP con reintentos, caché, historial, identidad | `cd services/qr-api && go test -race -cover ./...` |
| Unitarias Node | Estadísticas, validación, rutas y errores (supertest) | `cd services/stats-api && npm test` |
| Auth | Login, JWT, bcrypt, configuración | `cd services/auth-api && npm test` |
| Frontend | Parser de matrices, cliente HTTP y flujo completo con Testing Library | `cd frontend && npm test` |
| Integración | Go ↔ PostgreSQL/Redis y Auth ↔ PostgreSQL (se activan con `TEST_DATABASE_URL` / `TEST_REDIS_URL`) | En CI con contenedores de servicio |
| E2E | Kong → Go → Node con PostgreSQL y Redis reales: JWT, roles, caché, historial, CORS, rate limit | `docker compose up -d --build --wait && node --test tests/e2e/*.test.mjs` |

La prueba E2E de rate limit bloquea el login por un minuto; si repites la suite, espera ese minuto.

## CI/CD y despliegue en la nube

`.github/workflows/ci.yml` ejecuta en cada push y pull request:

1. Pruebas de cada servicio (Go con PostgreSQL y Redis reales como contenedores de servicio).
2. Lint, pruebas y build del frontend.
3. E2E con todo el sistema levantado en Docker.
4. En `main`: publica las imágenes en GitHub Container Registry (`ghcr.io/<owner>/reto-qr-*`).
5. En `main`, si está activado: despliega por SSH en una VM.

### Despliegue en un VPS (Ubuntu/Debian, por IP y HTTP)

`docker-compose.prod.yml` añade Caddy, que es lo único que publica puerto (80): `http://IP/api/*` va a Kong y
el resto al frontend. Sin dominio no hay HTTPS válido; cuando tengas uno, sigue las instrucciones del
comentario en `deploy/Caddyfile` (quitar `http://`, cambiar `DOMAIN`, `PUBLIC_API_URL` y `CORS_ORIGIN`, abrir 443).

```bash
# 1. En el VPS, como root: instala Docker, abre 22/80 y clona el repo en ~/reto-qr
curl -fsSL https://raw.githubusercontent.com/<owner>/RETO_QR/main/deploy/bootstrap.sh -o bootstrap.sh
bash bootstrap.sh https://github.com/<owner>/RETO_QR.git

# 2. Configura los secretos (openssl rand -hex 32) y arranca
cd ~/reto-qr && cp .env.prod.example .env && nano .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build --wait

# 3. Copias diarias de PostgreSQL (deploy/backup.sh, 7 días en ./backups)
bash deploy/install-backup-cron.sh
```

Si los paquetes de GHCR son privados, haz antes `docker login ghcr.io` con un token `read:packages`
(o vuélvelos públicos en GitHub → Packages).

Para el despliegue automático, define en el repositorio la variable `DEPLOY_ENABLED=true`, la variable
`PUBLIC_API_URL` (la misma URL `http://<IP>` que en `.env`; se compila dentro del frontend), el entorno
`production` y los secretos `DEPLOY_HOST`, `DEPLOY_USER` y `DEPLOY_SSH_KEY`.

## Desarrollo sin Docker

Cada servicio funciona por separado; sin `REDIS_URL` ni `DATABASE_URL` la QR API trabaja sin caché ni historial y
la Auth API guarda los usuarios en memoria (con bcrypt).

```bash
cd services/stats-api && npm install && npm run dev                       # :3000
cd services/qr-api && go run ./cmd/server                                 # :8080
cd services/auth-api && npm install && JWT_SECRET=<32+ caracteres> AUTH_USERS=admin:Admin123!:admin npm run dev  # :4000
cd frontend && npm install && npm run dev                                 # :5173 (espera a Kong en :8000)
```

La documentación de la QR API se regenera con [swag](https://github.com/swaggo/swag):
`swag init --generalInfo cmd/server/main.go --output docs --parseInternal`.
