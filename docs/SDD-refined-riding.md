# 📄 SDD: SLAVI Production Suite (v2.1)

## 1. Introducción
### 1.1. Propósito del Documento
Este documento de Especificación del Diseño del Sistema (SDD) describe la arquitectura, los componentes y la lógica operativa del bot de trading SLAVI v2.1. Sirve como referencia técnica para el mantenimiento y evolución del sistema.

### 1.2. Alcance del Sistema
SLAVI es un bot de trading algorítmico diseñado para el exchange Binance. Su objetivo es ejecutar operaciones de **Scalping de Alta Frecuencia** en mercados de gran liquidez, priorizando el par base BNB.

### 1.3. Definiciones y Acrónimos
*   **HF (High Frequency):** Alta frecuencia de operaciones.
*   **TTP (Trailing Take Profit):** Toma de ganancias que sigue el precio al alza.
*   **Refined Riding:** Nombre de la estrategia central de surfeo de tendencias.
*   **Net PnL:** Ganancia o pérdida neta descontando comisiones.
*   **Whipsaw:** Movimiento errático del mercado que genera señales falsas.

## 2. Descripción General del Sistema
### 2.1. Perspectiva del Sistema
El sistema consta de:
*   **Backend:** Motor en Node.js/TypeScript que procesa datos de mercado y ejecuta órdenes.
*   **Frontend:** Dashboard de monitoreo en tiempo real (Vite/React).
*   **DB:** Persistencia en SQLite para el historial de transacciones.

### 2.2. Funcionalidades
*   **Escaneo de Mercado:** Identifica pares con mayor volumen 24h.
*   **Gestión de Capital:** Sistema de slots dinámicos según el balance.
*   **Ejecución Algorítmica:** Entrada por momentum y salida por trailing stop adaptativo.

## 3. Arquitectura del Sistema
### 3.1. Componentes Principales
*   **`BinanceExchange.ts`:** Adaptador para la API y WebSockets de Binance.
*   **`ProductionGridBot.ts`:** Orquestador del ciclo de vida del bot y gestión de slots.
*   **`StrategyEngine.ts`:** Motor de lógica de trading (ActiveScalperStrategy).
*   **`AsyncTradeDB.ts`:** Capa de persistencia para trades y estados.

## 4. Especificación de la Estrategia "Refined Riding"
### 4.1. Lógica de Entrada (Momentum Entry)
1.  **Escaneo:** El sistema obtiene los 10 pares con mayor volumen contra BNB.
2.  **Filtrado:** Prioriza pares definidos en `PAIR_PRIORITY_LIST`.
3.  **Apertura:** Ejecuta una orden `MARKET BUY` cuando se detecta un slot disponible y una señal de volumen/momentum.

### 4.2. Lógica de Salida (Trailing Take Profit)
*   **Objetivo Inicial:** Se activa cuando el `netPnlPct` alcanza el **+0.30%**.
*   **Modo Riding:** Al alcanzar el objetivo, el bot no vende; inicia el rastreo del pico máximo (`highWaterMarkGain`).
*   **Trailing Stop:** Si el profit cae un **10%** (fijo en 0.10 puntos porcentuales) desde el pico máximo, se ejecuta la venta `MARKET SELL`.
*   **Net PnL:** Todos los cálculos restan un **0.15%** (round-trip fee) para asegurar rentabilidad real.

### 4.3. Gestión de Riesgos (Fase 2.1)
*   **Hard Stop-Loss:** Si el `netPnlPct` cae al **-1.20%**, el bot aborta la posición inmediatamente para proteger el capital.
*   **Timeout:** Cierre automático tras 8 horas si no se alcanza el target (configurable).

## 5. Gestión de Capital y Escalado
### 5.1. Sistema de Slots
El bot escala el número de pares simultáneos según el balance libre de BNB:
*   **T1:** >= 0.0100 BNB -> 1 Slot (Orden de 0.0105 BNB)
*   **T2:** >= 0.0264 BNB -> 2 Slots
*   *Configuración en `SCALING_CONFIG`.*

## 6. Configuración Técnica
### 6.1. Parámetros Clave
*   `targetProfit`: 0.003 (0.3%)
*   `trailingCallbackPct`: 0.10 (Pullback de 10%)
*   `HARD_STOP_LOSS_PCT`: -1.20%
*   `ROUND_TRIP_FEE_PCT`: 0.15%

---
*Documentación generada para el repositorio FondoThothAC/slavi26.*
