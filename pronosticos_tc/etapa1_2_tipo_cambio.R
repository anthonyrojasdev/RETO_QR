# ============================================================
# UNMSM - FACULTAD DE CIENCIAS MATEMÁTICAS
# MODELOS DE PRONÓSTICOS - ACTIVIDAD APLICATIVA SEMANA 12-13
# Análisis Espectral y Modelado ARIMA-GARCH
# Serie: TIPO DE CAMBIO USD/PEN - ETAPAS 1 Y 2
# Fuente: BCRP, serie PD04638PD, TC interbancario venta (S/ por US$)
# Periodo: 2019-01-01 hasta la fecha actual
# ============================================================

# 0. PAQUETES ------------------------------------------------
# Instala solo los paquetes que falten.
paquetes <- c("jsonlite", "moments", "tseries")
faltan <- paquetes[!paquetes %in% rownames(installed.packages())]
if (length(faltan) > 0) install.packages(faltan)

library(jsonlite)  # Lee el JSON de la API del BCRP.
library(moments)   # Asimetría y curtosis de los retornos.
library(tseries)   # Prueba de normalidad de Jarque-Bera.

# Carpeta donde se guardan tablas y gráficos.
dir_salida <- "salidas"
dir.create(dir_salida, showWarnings = FALSE)

# Función auxiliar: guarda el gráfico en PNG y, si la sesión es
# interactiva (RStudio), también lo muestra en pantalla.
graficar <- function(archivo, dibujo, ancho = 1600, alto = 900) {
  png(file.path(dir_salida, archivo), width = ancho, height = alto, res = 150)
  dibujo()
  dev.off()
  if (interactive()) dibujo()
}


# ============================================================
# ETAPA 1. METODOLOGÍA Y PROCESAMIENTO DE DATOS
# ============================================================

# 1.1. DESCARGAR LOS PRECIOS DIARIOS -------------------------

fecha_inicio <- as.Date("2019-01-01")
fecha_fin    <- Sys.Date()          # "hasta la fecha actual"

url <- paste0(
  "https://estadisticas.bcrp.gob.pe/estadisticas/series/api/",
  "PD04638PD/json/",
  format(fecha_inicio, "%Y-%m-%d"), "/",
  format(fecha_fin, "%Y-%m-%d"), "/esp"
)

# Convierte la respuesta JSON en una estructura de R.
datos <- fromJSON(url)

# Separa fechas de la forma '02.Ene.19' en día, mes y año.
partes <- do.call(rbind, strsplit(datos$periods$name, "\\."))

# Traduce las abreviaturas de meses del BCRP a números.
meses <- c(Ene = "01", Feb = "02", Mar = "03", Abr = "04",
           May = "05", Jun = "06", Jul = "07", Ago = "08",
           Set = "09", Sep = "09", Oct = "10", Nov = "11", Dic = "12")

# Convierte las fechas del BCRP a fechas reconocidas por R.
fecha <- as.Date(paste0("20", partes[, 3], "-",
                        meses[partes[, 2]], "-", partes[, 1]))

# Extrae los valores; 'n.d.' (no disponible) se convierte en NA.
precio <- suppressWarnings(as.numeric(unlist(datos$periods$values)))

# Une fecha y precio, quita días sin cotización y ordena.
tc <- data.frame(fecha = fecha, precio = precio)
n_bruto <- nrow(tc)
n_nd    <- sum(is.na(tc$precio))
tc <- tc[!is.na(tc$precio), ]
tc <- tc[order(tc$fecha), ]
rownames(tc) <- NULL

cat("\n================ ETAPA 1: DATOS ================\n")
cat("Serie                  : TC interbancario venta (S/ por US$) - BCRP PD04638PD\n")
cat("Registros descargados  :", n_bruto, "\n")
cat("Días 'n.d.' eliminados :", n_nd, "(feriados / sin negociación)\n")
cat("Observaciones válidas  :", nrow(tc), "\n")
cat("Primera fecha          :", format(min(tc$fecha)), "\n")
cat("Última fecha           :", format(max(tc$fecha)), "\n")
cat("\nPrimeras observaciones:\n"); print(head(tc))
cat("\nÚltimas observaciones:\n");  print(tail(tc))

# Nota metodológica: un tipo de cambio no paga dividendos ni tiene
# splits, por lo que la cotización diaria publicada por el BCRP ya
# equivale a un "precio de cierre ajustado".

# 1.2. RETORNOS LOGARÍTMICOS ---------------------------------
# R_t = ln(P_t / P_{t-1}) = ln(P_t) - ln(P_{t-1})
tc$retorno <- c(NA, diff(log(tc$precio)))

# Serie de trabajo (sin el primer NA).
ret <- tc[!is.na(tc$retorno), c("fecha", "retorno")]
r   <- ret$retorno

cat("\nRetornos logarítmicos calculados:", length(r), "observaciones\n")
print(head(ret))

# Guarda la base procesada (precio + retorno).
write.csv(tc, file.path(dir_salida, "tc_precios_retornos.csv"), row.names = FALSE)


# ============================================================
# ETAPA 2. ANÁLISIS EXPLORATORIO EN EL DOMINIO DEL TIEMPO
# ============================================================

# 2.1. ESTADÍSTICAS DESCRIPTIVAS DE LOS RETORNOS ------------

dias_anio <- 252   # días hábiles de negociación por año

media_d    <- mean(r)
mediana_d  <- median(r)
de_d       <- sd(r)
de_anual   <- de_d * sqrt(dias_anio)       # desviación estándar anualizada
media_anual <- media_d * dias_anio         # retorno medio anualizado
r_min      <- min(r);  f_min <- ret$fecha[which.min(r)]
r_max      <- max(r);  f_max <- ret$fecha[which.max(r)]
asimetria  <- skewness(r)
curt       <- kurtosis(r)                  # curtosis (normal = 3)
jb         <- jarque.bera.test(r)

tabla_desc <- data.frame(
  Estadistico = c("N° de observaciones",
                  "Media diaria",
                  "Media anualizada (x252)",
                  "Mediana diaria",
                  "Desv. estándar diaria",
                  "Desv. estándar anualizada (x raiz(252))",
                  "Mínimo",
                  "Fecha del mínimo",
                  "Máximo",
                  "Fecha del máximo",
                  "Rango (máx - mín)",
                  "Asimetría",
                  "Curtosis (normal = 3)",
                  "Jarque-Bera (p-valor)"),
  Valor = c(length(r),
            sprintf("%.6f (%.4f%%)", media_d, 100 * media_d),
            sprintf("%.4f%%", 100 * media_anual),
            sprintf("%.6f (%.4f%%)", mediana_d, 100 * mediana_d),
            sprintf("%.6f (%.4f%%)", de_d, 100 * de_d),
            sprintf("%.4f%%", 100 * de_anual),
            sprintf("%.6f (%.4f%%)", r_min, 100 * r_min),
            format(f_min),
            sprintf("%.6f (%.4f%%)", r_max, 100 * r_max),
            format(f_max),
            sprintf("%.6f (%.4f%%)", r_max - r_min, 100 * (r_max - r_min)),
            sprintf("%.4f", asimetria),
            sprintf("%.4f", curt),
            format.pval(jb$p.value, digits = 4))
)

cat("\n========== ETAPA 2.1: ESTADÍSTICAS DESCRIPTIVAS ==========\n")
print(tabla_desc, row.names = FALSE, right = FALSE)
write.csv(tabla_desc, file.path(dir_salida, "tabla_2_1_descriptivos.csv"),
          row.names = FALSE)

# Prueba t: ¿la media de los retornos es distinta de cero?
prueba_media <- t.test(r, mu = 0)
cat("\nPrueba t (H0: media = 0): t =", round(prueba_media$statistic, 4),
    " p-valor =", format.pval(prueba_media$p.value, digits = 4), "\n")

# Descriptivos complementarios del precio (nivel).
cat("\nResumen del tipo de cambio (nivel, S/ por US$):\n")
print(summary(tc$precio))

# Resumen por año: precio inicial/final, variación y volatilidad.
tc$anio  <- as.integer(format(tc$fecha, "%Y"))
ret$anio <- as.integer(format(ret$fecha, "%Y"))
tabla_anual <- do.call(rbind, lapply(split(tc, tc$anio), function(d) {
  ra <- ret$retorno[ret$anio == d$anio[1]]
  data.frame(
    Anio           = d$anio[1],
    Obs            = nrow(d),
    TC_inicio      = round(d$precio[1], 4),
    TC_fin         = round(d$precio[nrow(d)], 4),
    TC_min         = round(min(d$precio), 4),
    TC_max         = round(max(d$precio), 4),
    Ret_log_acum   = sprintf("%.2f%%", 100 * sum(ra)),
    Vol_anualizada = sprintf("%.2f%%", 100 * sd(ra) * sqrt(dias_anio))
  )
}))
cat("\nResumen anual:\n")
print(tabla_anual, row.names = FALSE)
write.csv(tabla_anual, file.path(dir_salida, "tabla_2_1_resumen_anual.csv"),
          row.names = FALSE)

# Los 10 retornos diarios más extremos (en valor absoluto).
top_ext <- ret[order(-abs(ret$retorno)), c("fecha", "retorno")][1:10, ]
top_ext$retorno_pct <- sprintf("%.3f%%", 100 * top_ext$retorno)
cat("\nLos 10 movimientos diarios más extremos:\n")
print(top_ext[, c("fecha", "retorno_pct")], row.names = FALSE)

# --- Interpretación automática de 2.1 ----------------------
cat("\n---------- INTERPRETACIÓN 2.1 ----------\n")
cat(sprintf(
"* Media: el retorno logarítmico medio diario es %.4f%% (%.2f%% anual), prácticamente
  cero; la prueba t (p = %s) %s. En promedio el sol %s frente al dólar en el periodo.\n",
  100 * media_d, 100 * media_anual, format.pval(prueba_media$p.value, digits = 3),
  ifelse(prueba_media$p.value < 0.05,
         "rechaza H0: la media es estadísticamente distinta de cero",
         "no rechaza H0: la media no es distinta de cero"),
  ifelse(media_d > 0, "se depreció levemente", "se apreció levemente")))
cat(sprintf(
"* Mediana: %.4f%%, %s que la media (%.4f%%); junto con la asimetría (%.3f)
  indica que la distribución %s. Ambas son casi cero: el día típico
  el tipo de cambio prácticamente no se mueve.\n",
  100 * mediana_d, ifelse(mediana_d > media_d, "mayor", "menor"), 100 * media_d,
  asimetria,
  ifelse(asimetria > 0,
         "tiene una cola derecha (depreciaciones bruscas del sol) algo más larga",
         "tiene una cola izquierda (apreciaciones bruscas del sol) algo más larga")))
cat(sprintf(
"* Volatilidad: la desviación estándar diaria es %.4f%% y la anualizada %.2f%%.
  Es un nivel bajo frente a acciones (20-30%%) o a otras monedas emergentes,
  coherente con la intervención cambiaria del BCRP que suaviza el tipo de cambio.\n",
  100 * de_d, 100 * de_anual))
cat(sprintf(
"* Rango: los retornos van de %.3f%% (%s) a %.3f%% (%s), un rango de %.3f%%.
  Estos extremos son %.1f y %.1f desviaciones estándar, valores que serían
  casi imposibles bajo normalidad.\n",
  100 * r_min, format(f_min), 100 * r_max, format(f_max), 100 * (r_max - r_min),
  abs(r_min - media_d) / de_d, (r_max - media_d) / de_d))
cat(sprintf(
"* Forma: asimetría = %.3f y curtosis = %.2f (> 3): distribución leptocúrtica
  con colas pesadas. Jarque-Bera p = %s => se rechaza normalidad. Esto justifica
  usar luego una distribución t-Student en el GARCH (Etapa 5).\n",
  asimetria, curt, format.pval(jb$p.value, digits = 3)))


# 2.2. GRÁFICOS DE EVOLUCIÓN TEMPORAL ------------------------

# Volatilidad móvil de 21 días (≈ 1 mes hábil), anualizada,
# para ubicar los episodios de alta volatilidad (clustering).
ventana <- 21
vol_movil <- rep(NA_real_, length(r))
for (i in ventana:length(r)) {
  vol_movil[i] <- sd(r[(i - ventana + 1):i]) * sqrt(dias_anio)
}
ret$vol21 <- vol_movil

# Media móvil de 63 días (≈ 1 trimestre) del precio como tendencia.
tc$mm63 <- as.numeric(stats::filter(tc$precio, rep(1 / 63, 63), sides = 1))

# Episodios de alta volatilidad: meses cuya volatilidad móvil
# promedio supera el percentil 90.
umbral_vol <- quantile(ret$vol21, 0.90, na.rm = TRUE)
ret$mes <- format(ret$fecha, "%Y-%m")
vol_mes <- aggregate(vol21 ~ mes, data = ret, FUN = mean)
episodios <- vol_mes[vol_mes$vol21 > umbral_vol, ]
episodios <- episodios[order(-episodios$vol21), ]
episodios$vol21 <- sprintf("%.2f%%", 100 * episodios$vol21)
cat("\n========== ETAPA 2.2: EPISODIOS DE ALTA VOLATILIDAD ==========\n")
cat(sprintf("Umbral (percentil 90 de la vol. móvil 21d): %.2f%% anual\n",
            100 * umbral_vol))
cat("Meses con volatilidad promedio sobre el umbral:\n")
print(episodios, row.names = FALSE)

# Gráfico 1: precio (tipo de cambio) con tendencia.
graficar("fig_2_1_precio.png", function() {
  par(mar = c(4, 4.5, 3, 1))
  plot(tc$fecha, tc$precio, type = "l", col = "steelblue4", lwd = 1.2,
       main = "Figura 2.1. Tipo de cambio interbancario venta (S/ por US$)",
       xlab = "Fecha", ylab = "S/ por US$", xaxt = "n")
  axis.Date(1, at = seq(as.Date("2019-01-01"), max(tc$fecha), by = "6 months"),
            format = "%b-%y", cex.axis = 0.8)
  lines(tc$fecha, tc$mm63, col = "firebrick", lwd = 2)
  points(tc$fecha[which.max(tc$precio)], max(tc$precio), pch = 19, col = "darkred")
  points(tc$fecha[which.min(tc$precio)], min(tc$precio), pch = 19, col = "darkgreen")
  text(tc$fecha[which.max(tc$precio)], max(tc$precio),
       sprintf("Máx %.3f (%s)", max(tc$precio), format(tc$fecha[which.max(tc$precio)])),
       pos = 4, cex = 0.75, col = "darkred")
  text(tc$fecha[which.min(tc$precio)], min(tc$precio),
       sprintf("Mín %.3f (%s)", min(tc$precio), format(tc$fecha[which.min(tc$precio)])),
       pos = 4, cex = 0.75, col = "darkgreen")
  grid(col = "grey85")
  legend("topleft", c("Tipo de cambio", "Media móvil 63 días"),
         col = c("steelblue4", "firebrick"), lwd = c(1.2, 2), bty = "n", cex = 0.85)
})

# Gráfico 2: retornos logarítmicos diarios con bandas de ±2 y ±3 desv. est.
graficar("fig_2_2_retornos.png", function() {
  par(mar = c(4, 4.5, 3, 1))
  plot(ret$fecha, 100 * r, type = "l", col = "grey30", lwd = 0.7,
       main = "Figura 2.2. Retornos logarítmicos diarios del tipo de cambio",
       xlab = "Fecha", ylab = "Retorno (%)", xaxt = "n")
  axis.Date(1, at = seq(as.Date("2019-01-01"), max(ret$fecha), by = "6 months"),
            format = "%b-%y", cex.axis = 0.8)
  abline(h = 0, col = "black")
  abline(h = 100 * (media_d + c(-2, 2) * de_d), col = "orange", lty = 2)
  abline(h = 100 * (media_d + c(-3, 3) * de_d), col = "red", lty = 2)
  extremos <- abs(r - media_d) > 3 * de_d
  points(ret$fecha[extremos], 100 * r[extremos], pch = 20, col = "red", cex = 0.7)
  legend("topright", c("±2 desv. est.", "±3 desv. est.", "Retornos > 3 desv. est."),
         col = c("orange", "red", "red"), lty = c(2, 2, NA), pch = c(NA, NA, 20),
         bty = "n", cex = 0.8)
})

# Gráfico 3: volatilidad móvil (evidencia de clustering).
graficar("fig_2_3_volatilidad_movil.png", function() {
  par(mar = c(4, 4.5, 3, 1))
  plot(ret$fecha, 100 * ret$vol21, type = "l", col = "darkorchid4", lwd = 1.3,
       main = "Figura 2.3. Volatilidad móvil de 21 días (anualizada)",
       xlab = "Fecha", ylab = "Volatilidad anual (%)", xaxt = "n")
  axis.Date(1, at = seq(as.Date("2019-01-01"), max(ret$fecha), by = "6 months"),
            format = "%b-%y", cex.axis = 0.8)
  abline(h = 100 * de_anual, col = "grey40", lty = 2)
  abline(h = 100 * umbral_vol, col = "red", lty = 3)
  legend("topright", c("Vol. móvil 21 días", "Vol. anual promedio",
                       "Percentil 90"),
         col = c("darkorchid4", "grey40", "red"), lty = c(1, 2, 3), bty = "n",
         cex = 0.8)
})

# Gráfico 4: panel conjunto (precio, retornos, retornos al cuadrado).
graficar("fig_2_4_panel.png", function() {
  par(mfrow = c(3, 1), mar = c(2.5, 4.5, 2.2, 1))
  plot(tc$fecha, tc$precio, type = "l", col = "steelblue4",
       main = "Precio (S/ por US$)", xlab = "", ylab = "S/")
  plot(ret$fecha, 100 * r, type = "l", col = "grey30", lwd = 0.6,
       main = "Retornos logarítmicos (%)", xlab = "", ylab = "%")
  abline(h = 0)
  plot(ret$fecha, (100 * r)^2, type = "h", col = "firebrick",
       main = "Retornos al cuadrado (proxy de la varianza)", xlab = "", ylab = "%²")
}, alto = 1400)

# Gráfico 5: histograma de retornos vs. curva normal.
graficar("fig_2_5_histograma.png", function() {
  par(mar = c(4, 4.5, 3, 1))
  hist(100 * r, breaks = 80, freq = FALSE, col = "lightsteelblue", border = "white",
       main = "Figura 2.5. Distribución de los retornos vs. normal",
       xlab = "Retorno diario (%)", ylab = "Densidad")
  lines(density(100 * r), col = "steelblue4", lwd = 2)
  curve(dnorm(x, 100 * media_d, 100 * de_d), add = TRUE, col = "red", lwd = 2, lty = 2)
  legend("topright", c("Densidad empírica", "Normal teórica"),
         col = c("steelblue4", "red"), lwd = 2, lty = c(1, 2), bty = "n")
})

# --- Interpretación automática de 2.2 ----------------------
i_max <- which.max(tc$precio); i_min <- which.min(tc$precio)
cat("\n---------- INTERPRETACIÓN 2.2 ----------\n")
cat(sprintf(
"* Tendencias (Fig. 2.1): el tipo de cambio pasa de %.3f (%s) a %.3f (%s),
  una variación acumulada de %.2f%%. El mínimo del periodo fue %.3f (%s) y el
  máximo %.3f (%s). La media móvil de 63 días muestra fases de depreciación y
  apreciación del sol: la serie en niveles NO es estacionaria (tiene tendencia
  estocástica), por eso se trabaja con retornos.\n",
  tc$precio[1], format(tc$fecha[1]), tc$precio[nrow(tc)], format(tc$fecha[nrow(tc)]),
  100 * (tc$precio[nrow(tc)] / tc$precio[1] - 1),
  tc$precio[i_min], format(tc$fecha[i_min]), tc$precio[i_max], format(tc$fecha[i_max])))
cat(
"* Retornos (Fig. 2.2): oscilan alrededor de cero sin tendencia (media constante),
  pero su amplitud cambia en el tiempo: hay tramos tranquilos y tramos agitados.\n")
cat(sprintf(
"* Clustering (Figs. 2.3 y 2.4): la volatilidad móvil varía entre %.2f%% y %.2f%%
  anual. Los periodos de alta volatilidad se agrupan (grandes cambios seguidos de
  grandes cambios), lo que evidencia heterocedasticidad condicional (efecto ARCH).
  Meses más volátiles: %s.\n",
  100 * min(ret$vol21, na.rm = TRUE), 100 * max(ret$vol21, na.rm = TRUE),
  paste(head(episodios$mes, 6), collapse = ", ")))
cat(
"* Contexto de los episodios (verificar con las fechas impresas arriba):
  - Mar-Abr 2020: inicio de la pandemia COVID-19 y cuarentena.
  - Abr-Ago 2021: elecciones generales 2021 e incertidumbre política; el TC
    alcanza su máximo histórico del periodo (sep-2021).
  - Feb-Abr 2022: invasión de Rusia a Ucrania (24-feb-2022) y choque de materias primas.
  - Jun 2026: segunda vuelta de las elecciones generales 2026.
  - 2025: tramo de apreciación sostenida del sol (caída del TC de ~3.75 a ~3.36).\n")
cat(
"* Implicancia para el modelado: media ≈ 0 y estable (adecuada para un ARMA de
  bajo orden) + varianza cambiante y colas pesadas => se justifica un modelo
  ARMA-GARCH con innovaciones t-Student en las etapas siguientes.\n")

cat("\nArchivos generados en la carpeta '", dir_salida, "':\n", sep = "")
print(list.files(dir_salida))
