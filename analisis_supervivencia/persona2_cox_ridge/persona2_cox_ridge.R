# =============================================================================
# Persona 2: Modelo de supervivencia de Cox penalizado con Ridge (L2)
# Requiere: survival, glmnet
#
# NOTA: el ejemplo usa survival::lung como base de prueba. Para el proyecto,
# reemplazar la sección 1 por la base real manteniendo el esquema:
#   time   = tiempo de seguimiento
#   event  = 1 si ocurrió el evento, 0 si fue censura
#   resto  = covariables (numéricas o dummies)
# =============================================================================

suppressPackageStartupMessages({
  library(survival)
  library(glmnet)
})

set.seed(2026)

# -----------------------------------------------------------------------------
# 1. Datos y preparación
# -----------------------------------------------------------------------------
data(lung, package = "survival")
dat <- lung
dat$event <- dat$status - 1          # lung: 1 = censura, 2 = muerte  ->  0 / 1
dat$sex   <- dat$sex - 1             # 0 = hombre, 1 = mujer

vars <- c("age", "sex", "ph.ecog", "ph.karno", "pat.karno", "meal.cal", "wt.loss")
dat  <- na.omit(dat[, c("time", "event", vars)])

X <- as.matrix(dat[, vars])
n <- nrow(X)
p <- ncol(X)
cat("Observaciones completas:", n, "| eventos:", sum(dat$event), "\n")

# Partición 70 / 30 para evaluar capacidad predictiva fuera de muestra
train_id <- sample(seq_len(n), size = round(0.7 * n))
test_id  <- setdiff(seq_len(n), train_id)

# Estandarización con medias y desviaciones SOLO del conjunto de entrenamiento
mu  <- colMeans(X[train_id, ])
sdv <- apply(X[train_id, ], 2, sd)
std <- function(M) sweep(sweep(M, 2, mu, "-"), 2, sdv, "/")

Xtr <- std(X[train_id, ])
Xte <- std(X[test_id, ])
tr_time  <- dat$time[train_id];  tr_event <- dat$event[train_id]
te_time  <- dat$time[test_id];   te_event <- dat$event[test_id]
ytr <- Surv(tr_time, tr_event)
yte <- Surv(te_time, te_event)

# Índice de concordancia de Harrell (implementación explícita, sin ambigüedad de signo).
# risk alto = riesgo alto = evento más temprano.
c_index <- function(time, event, risk) {
  num <- 0; den <- 0
  for (i in which(event == 1)) {
    comp <- time > time[i]                 # pares comparables: j sobrevive más que i
    den  <- den + sum(comp)
    num  <- num + sum(risk[i] > risk[comp]) + 0.5 * sum(risk[i] == risk[comp])
  }
  num / den
}

# -----------------------------------------------------------------------------
# 2. Referencia: Cox tradicional (lambda = 0), método de Breslow para empates
#    (mismo que usa glmnet, para que las comparaciones sean justas)
# -----------------------------------------------------------------------------
dtr <- data.frame(Xtr, time = tr_time, event = tr_event)
fit_cox <- coxph(Surv(time, event) ~ . , data = dtr, ties = "breslow")
lp_cox_te <- predict(fit_cox, newdata = as.data.frame(Xte), type = "lp")

# -----------------------------------------------------------------------------
# 3. Cox-Ridge con glmnet
#    glmnet minimiza:  -(1/n) * loglik(beta) + lambda * (1/2) * ||beta||^2
#    (alpha = 0 indica penalización puramente L2)
# -----------------------------------------------------------------------------
fit_ridge <- glmnet(Xtr, ytr, family = "cox", alpha = 0, standardize = FALSE)
plot(fit_ridge, xvar = "lambda", label = TRUE)   # ruta de coeficientes

# Selección de lambda por validación cruzada (devianza parcial)
cv_ridge <- cv.glmnet(Xtr, ytr, family = "cox", alpha = 0, standardize = FALSE,
                      nfolds = 10, type.measure = "deviance")
plot(cv_ridge)

lam_min <- cv_ridge$lambda.min   # mejor ajuste en CV
lam_1se <- cv_ridge$lambda.1se   # modelo más regularizado dentro de 1 EE del mínimo
cat("\nlambda.min =", round(lam_min, 5), "| lambda.1se =", round(lam_1se, 5), "\n")

# Se usa lambda.min en lo que sigue; cambiar a lam_1se para un modelo más conservador
lam <- lam_min

# -----------------------------------------------------------------------------
# 4. Coeficientes: Cox tradicional vs Cox-Ridge
#    Coeficientes en unidades de "por 1 desviación estándar" de cada covariable
# -----------------------------------------------------------------------------
b_ridge <- as.matrix(coef(cv_ridge, s = "lambda.min"))[, 1]
b_cox   <- coef(fit_cox)

tabla <- data.frame(
  variable   = vars,
  beta_cox   = b_cox[vars],
  beta_ridge = b_ridge[vars]
)
tabla$HR_cox   <- exp(tabla$beta_cox)
tabla$HR_ridge <- exp(tabla$beta_ridge)
cat("\nCoeficientes (por 1 DE):\n")
print(tabla, digits = 3, row.names = FALSE)

# -----------------------------------------------------------------------------
# 5. Capacidad predictiva en el conjunto de prueba
# -----------------------------------------------------------------------------
lp_ridge_te <- drop(predict(cv_ridge, newx = Xte, s = "lambda.min", type = "link"))

cat("\nC-index en prueba  | Cox:", round(c_index(te_time, te_event, lp_cox_te), 3),
    "| Cox-Ridge:", round(c_index(te_time, te_event, lp_ridge_te), 3), "\n")

# -----------------------------------------------------------------------------
# 6. Verificación: Newton-Raphson penalizado implementado a mano
#    beta_{m+1} = beta_m + [I(beta_m) + n*lambda*I]^{-1} [U(beta_m) - n*lambda*beta_m]
#    donde n*lambda es el lambda de la verosimilitud SIN dividir entre n.
# -----------------------------------------------------------------------------
cox_ridge_newton <- function(X, time, event, lambda_n, maxit = 50, tol = 1e-10) {
  p <- ncol(X)
  b <- numeric(p)
  ev <- which(event == 1)
  for (it in seq_len(maxit)) {
    w <- exp(drop(X %*% b))
    U <- numeric(p)
    I <- matrix(0, p, p)
    for (i in ev) {
      R  <- which(time >= time[i])                  # conjunto de riesgo
      XR <- X[R, , drop = FALSE]
      wR <- w[R]
      S0 <- sum(wR)
      S1 <- colSums(XR * wR)                        # sum w x
      S2 <- crossprod(XR * sqrt(wR))                # sum w x x'
      U  <- U + X[i, ] - S1 / S0                    # score
      I  <- I + S2 / S0 - tcrossprod(S1 / S0)       # informacion (= -Hessiano)
    }
    step <- solve(I + lambda_n * diag(p), U - lambda_n * b)
    b <- b + step
    if (max(abs(step)) < tol) break
  }
  list(beta = b, info = I, iter = it)
}

# (a) Con lambda = 0 debe reproducir coxph (Breslow)
b_newton0 <- cox_ridge_newton(Xtr, tr_time, tr_event, lambda_n = 0)$beta
cat("\nVerificación lambda = 0 (Newton propio vs coxph):\n")
print(round(cbind(coxph = b_cox[vars], newton = b_newton0), 5))

# (b) Con lambda > 0 debe reproducir glmnet (sin estandarizar de nuevo)
n_tr     <- nrow(Xtr)
lambda_n <- n_tr * lam
b_newton <- cox_ridge_newton(Xtr, tr_time, tr_event, lambda_n = lambda_n)
fit_chk  <- glmnet(Xtr, ytr, family = "cox", alpha = 0, standardize = FALSE,
                   lambda = lam, thresh = 1e-12)
b_glm <- as.matrix(coef(fit_chk))[, 1]
cat("\nVerificación lambda > 0 (Newton propio vs glmnet):\n")
print(round(cbind(glmnet = b_glm, newton = b_newton$beta), 5))
cat("Diferencia máxima:", format(max(abs(b_glm - b_newton$beta)), scientific = TRUE), "\n")

# -----------------------------------------------------------------------------
# 7. Grados de libertad efectivos: df(lambda) = tr{ I (I + n*lambda*I)^{-1} }
# -----------------------------------------------------------------------------
I_r <- b_newton$info
df_ridge <- sum(diag(I_r %*% solve(I_r + lambda_n * diag(p))))
cat("\nGrados de libertad efectivos (Cox-Ridge):", round(df_ridge, 2),
    "de", p, "covariables\n")
