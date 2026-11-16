# Persona 2: Fundamentos de penalización y modelo Cox-Ridge

## 1. Regularización: por qué penalizar

El modelo de Cox tradicional estima los coeficientes β maximizando la verosimilitud parcial. Esto funciona bien cuando hay muchos eventos por covariable, pero falla o se vuelve inestable cuando:

- Hay **multicolinealidad** entre covariables (p. ej., `ph.karno` y `pat.karno` miden lo mismo). La matriz de información se acerca a singular y los errores estándar se inflan.
- El número de covariables **p** es grande en relación con el número de eventos **d**, o p > d. La estimación de máxima verosimilitud deja de ser única o sobreajusta.
- Se quiere **estabilizar** las predicciones para nuevos pacientes.

La regularización añade a la verosimilitud un término que castiga coeficientes grandes. A cambio de un pequeño sesgo, se reduce mucho la varianza del estimador. Es el compromiso sesgo-varianza.

## 2. Verosimilitud parcial de Cox

Con el modelo de riesgos proporcionales

$$
h(t \mid x) = h_0(t)\,\exp(x^\top \beta),
$$

la verosimilitud parcial de Cox elimina el riesgo basal $h_0(t)$. Para cada tiempo de evento $t_i$ (con $\delta_i = 1$), el conjunto de riesgo $R_i = \{j : t_j \ge t_i\}$ contiene a los individuos que siguen en riesgo. Entonces

$$
PL(\beta) = \prod_{i:\,\delta_i=1} \frac{\exp(x_i^\top \beta)}{\sum_{j \in R_i} \exp(x_j^\top \beta)},
$$

y su logaritmo es

$$
\ell(\beta) = \sum_{i:\,\delta_i=1} \Big[\, x_i^\top \beta - \log \sum_{j \in R_i} \exp(x_j^\top \beta) \Big].
$$

Para tiempos empatados se usa la aproximación de **Breslow** (es la que emplea `glmnet`; `coxph` la usa con `ties = "breslow"` para que la comparación sea directa).

## 3. Verosimilitud penalizada con L2

La verosimilitud parcial penalizada por Ridge es

$$
\ell_\lambda(\beta) = \ell(\beta) - \frac{n\lambda}{2}\,\lVert\beta\rVert_2^2 = \ell(\beta) - \frac{n\lambda}{2}\sum_{k=1}^{p}\beta_k^2 ,
$$

donde $n$ es el número de observaciones. El estimador Cox-Ridge es

$$
\hat\beta_\lambda = \arg\max_\beta\ \ell_\lambda(\beta).
$$

**Sobre el escalado de λ.** Hay dos convenciones habituales:

- Este documento usa la forma con $n$ (la de la ecuación anterior), que es la que resulta de la verosimilitud sin normalizar.
- `glmnet` minimiza $-\frac{1}{n}\ell(\beta) + \frac{\lambda}{2}\lVert\beta\rVert_2^2$. Son equivalentes con $\lambda_{\text{glmnet}} = \lambda$ y el término $n\lambda$ de arriba. Por eso en el script se usa `lambda_n = n_tr * lam`.

Solo la penalización L2 (cuadrado de la norma) produce esta forma diferenciable y cerrada en el gradiente. La penalización L1 no es derivable en cero, y eso es lo que da lugar a LASSO (persona 3).

## 4. Ecuaciones de estimación

**Score penalizado.** Con $w_j = \exp(x_j^\top\beta)$, $S_0(t_i) = \sum_{j\in R_i} w_j$ y $S_1(t_i) = \sum_{j\in R_i} w_j x_j$:

$$
U_\lambda(\beta) = \sum_{i:\,\delta_i=1}\Big[x_i - \frac{S_1(t_i)}{S_0(t_i)}\Big] - n\lambda\,\beta .
$$

**Matriz de información (menos el Hessiano).** Con $S_2(t_i) = \sum_{j\in R_i} w_j x_j x_j^\top$:

$$
I(\beta) = \sum_{i:\,\delta_i=1}\Big[\frac{S_2(t_i)}{S_0(t_i)} - \frac{S_1(t_i)\,S_1(t_i)^\top}{S_0(t_i)^2}\Big].
$$

**Penalización en la información.** La penalización añade $n\lambda I_p$ a la información. Como esa matriz es definida positiva para $\lambda>0$, el sistema siempre tiene solución única aunque $X$ tenga colinealidad perfecta o $p > d$.

**Newton-Raphson penalizado:**

$$
\beta^{(m+1)} = \beta^{(m)} + \big[I(\beta^{(m)}) + n\lambda I_p\big]^{-1}\big[U(\beta^{(m)}) - n\lambda\,\beta^{(m)}\big].
$$

Se itera hasta que el cambio máximo en β sea menor que una tolerancia (p. ej., $10^{-10}$).

## 5. Papel de λ

| Valor de λ | Comportamiento |
|---|---|
| $\lambda = 0$ | Se recupera el Cox tradicional (máxima verosimilitud parcial). |
| $\lambda$ pequeño | Poca contracción; el modelo se parece al tradicional. |
| $\lambda$ grande | Todos los coeficientes se contraen hacia 0; el modelo tiende a predecir el riesgo basal. |
| $\lambda \to \infty$ | $\hat\beta_\lambda \to 0$. |

**Intuición con el caso lineal.** En regresión lineal con $X = UDV^\top$ (SVD), el estimador Ridge es $\hat\beta_\lambda = V\,\mathrm{diag}\!\big(\tfrac{d_j}{d_j^2+\lambda}\big)U^\top y$. Cada dirección se multiplica por el factor de contracción $\frac{d_j^2}{d_j^2+\lambda}$. Las direcciones con valores singulares pequeños (las que causan la inestabilidad por colinealidad) se contraen más. En Cox el mismo principio aplica con la información $I(\hat\beta)$ en lugar de $X^\top X$.

**Grados de libertad efectivos.**

$$
\mathrm{df}(\lambda) = \mathrm{tr}\big\{I(\hat\beta_\lambda)\,[I(\hat\beta_\lambda) + n\lambda I_p]^{-1}\big\},
$$

que va de $p$ (en $\lambda = 0$) hacia 0 al aumentar λ. Es una forma de medir cuánta complejidad conserva el modelo.

**Interpretación bayesiana.** Si se asigna a cada $\beta_k$ un prior normal $N(0, \tau^2)$ independiente, la estimación MAP coincide con el estimador Ridge, con $\lambda$ relacionado con $\tau^2$. Por eso se suele decir que Ridge equivale a un prior gaussiano centrado en cero.

## 6. Selección de λ

Se elige λ por **validación cruzada K-fold** (habitualmente K = 10), maximizando la verosimilitud parcial en los pliegues de validación (devianza parcial). Dos reglas comunes:

- **λ mínimo** (`lambda.min`): el de mejor ajuste en CV.
- **λ 1-EE** (`lambda.1se`): el mayor λ con devianza a 1 error estándar del mínimo. Da un modelo más contraído y más simple. Es preferible cuando se busca estabilidad.

También se puede usar el C-index como criterio de CV (`type.measure = "C"`), que mide directamente la discriminación.

## 7. Estandarización

Ridge no es invariante a escala: una covariable medida en gramos recibe una penalización distinta que una medida en kilogramos. Por eso:

- Se estandarizan todas las covariables (media 0, desviación 1).
- Los coeficientes se interpretan como efecto por **una desviación estándar** de la covariable.
- Para no filtrar información, la media y la desviación se calculan **solo con el conjunto de entrenamiento** y se aplican al de prueba.

## 8. Ventajas y limitaciones

**Ventajas**

- Estabiliza la estimación bajo multicolinealidad y cuando $p$ es grande respecto a $d$.
- Tiene solución única para cualquier λ > 0.
- Tiene forma cerrada en el gradiente y la información; la optimización es suave (Newton o descenso por coordenadas).
- Las predicciones suelen generalizar mejor que el Cox tradicional cuando hay sobreajuste.
- Conserva a todas las covariables con coeficientes pequeños pero no nulos, lo que es razonable si todas aportan algo.

**Limitaciones**

- **No selecciona variables**: los coeficientes se contraen pero no llegan a exactamente 0. Si se necesita un modelo parsimonioso, hay que usar LASSO o Elastic Net.
- **Sesgo**: los coeficientes son sesgados hacia 0. La interpretación como HR debe hacerse con cuidado.
- **Inferencia no estándar**: no hay errores estándar ni p-valores directos del estimador penalizado. Para intervalos de confianza se recomiendan bootstrap o la aproximación bayesiana.
- **Depende de la escala** y necesita estandarizar.
- **Una sola λ** para todos los coeficientes: penaliza igual a covariables relevantes e irrelevantes.
- **Dependencia de la partición**: la elección de λ y la estimación del error de predicción varían con la semilla de CV. Conviene repetir la CV con varias semillas.

## 9. Aplicación en R

El script `persona2_cox_ridge.R` (en esta misma carpeta) realiza:

1. **Preparación**: se usa `survival::lung` como base de prueba (reemplazar por la base del proyecto), se eliminan valores faltantes y se separa 70 % entrenamiento / 30 % prueba.
2. **Referencia**: Cox tradicional con `coxph(..., ties = "breslow")`.
3. **Ruta de coeficientes**: `glmnet(..., family = "cox", alpha = 0)`.
4. **Selección de λ**: `cv.glmnet(..., nfolds = 10)`, con `lambda.min` y `lambda.1se`.
5. **Coeficientes y HR** por 1 DE para Cox y Cox-Ridge.
6. **C-index en prueba** con una función propia de Harrell's C, para no depender de la convención de signo de `concordance()`.
7. **Verificación**: un Newton-Raphson penalizado escrito a mano. Con λ = 0 reproduce `coxph`; con λ > 0 reproduce `glmnet` hasta la tolerancia numérica.
8. **Grados de libertad efectivos** $\mathrm{df}(\lambda)$.

### Verificación realizada

- **R no está disponible en el entorno** en el que se preparó este material, así que el script R **no se ejecutó**. Queda pendiente correrlo en RStudio o R y revisar la sección 6 del script (verificación), donde deben coincidir los coeficientes de coxph y Newton con λ = 0, y los de glmnet y Newton con λ > 0.
- Las ecuaciones de score, información y el paso de Newton penalizado se comprobaron en Python con datos simulados. El gradiente y la información analíticos coinciden con diferencias finitas (error ≈ 1e-7), y el punto de Newton anula el gradiente penalizado y es un máximo local. Además, $\mathrm{df}$ disminuye de 4 a 2.47 al pasar de λ = 0 a λ = 50 en ese ejemplo.

## 10. Resultados

*Pendiente de completar al ejecutar el script en R con la base del proyecto.* Tabla a llenar:

| Variable | HR Cox | HR Cox-Ridge (λ.min) | HR Cox-Ridge (λ.1se) |
|---|---|---|---|
| (completar) | | | |

| Modelo | C-index (prueba) | λ | df(λ) |
|---|---|---|---|
| Cox tradicional | | 0 | p |
| Cox-Ridge | | | |

## 11. Conclusiones preliminares para la persona 5

- Ridge conserva todas las covariables y reduce la varianza; sirve como referencia de penalización continua.
- La decisión entre Ridge, LASSO y Elastic Net depende de si se necesita selección de variables (LASSO/Elastic Net) o de la estabilidad con colinealidad fuerte (Ridge).
- Para comparar modelos conviene usar la misma partición train/test y la misma semilla de CV.
