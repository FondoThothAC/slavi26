# 📄 SLAVI Production Suite (v2.1)

SLAVI es un motor de trading algorítmico de **Alta Frecuencia** diseñado para operar pares contra BNB en Binance.

### 🎯 Estrategia: Refined Riding
El bot implementa un sistema de **Momentum Scalping** con salida mediante **Trailing Take Profit (TTP)**. Una vez que una operación alcanza el objetivo neto del **+0.30%**, el bot activa el modo "Riding" para surfear la tendencia, cerrando la posición solo cuando el precio retrocede un 10% desde su pico máximo.

Para más detalles técnicos, consulta la [Especificación del Diseño del Sistema (SDD)](./docs/SDD-refined-riding.md).

## 1. Visión General del Sistema
SLAVI es un bot de trading algorítmico de alta frecuencia (Scalping) diseñado para el exchange Binance. Su objetivo es ejecutar operaciones cortas en el mercado Spot, aprovechando ineficiencias de precios en pares contra **BNB** (ej. ADA/BNB, SOL/BNB). 

El sistema está desacoplado: cuenta con un motor de ejecución en el backend (Node.js/TypeScript) y un panel de telemetría en tiempo real (React) con estética "Antigravity".

## 2. Arquitectura Tecnológica
* **Backend Motor:** Node.js + TypeScript (Ejecución rápida, tipado estricto).
* **Conexión Exchange:** API REST de Binance (Órdenes) + WebSockets (Precios en tiempo real).
* **Base de Datos:** SQLite (`trades.db`) para persistencia ligera de operaciones activas e historial.
* **Servidor de Eventos:** WebSocket Nativo (`ws` en el puerto 8080) para emisión de telemetría.
* **Frontend UI (Antigravity):** React 19 + Tailwind CSS + Vite (Renderizado basado en eventos WS).

## 3. Lógica Central (Core Logic)

### A. Módulo de Tesorería Automática (DCA)
* **Objetivo:** Inyectar liquidez al sistema de forma pasiva.
* **Lógica:** Un proceso en segundo plano consulta el balance de `MXN` cada 15 minutos. Si supera el umbral (ej. `$200 MXN`), ejecuta una orden `MARKET BUY` en el par `BNBMXN`.
* **Efecto:** Maximiza el capital operativo convirtiendo ahorros en "munición" para el bot.

### B. Escalabilidad Dinámica de Pares (Dynamic Slots)
* **Objetivo:** Interés compuesto automático.
* **Lógica:** El bot calcula cuántos "slots" de trading puede costear basado en el `Free BNB`.
* **Cálculo:** 
  - Tier 1: 0.0132 BNB -> 1 par
  - Tier 2: 0.0264 BNB -> 2 pares
  - Tier 3: 0.0528 BNB -> 4 pares
  - (Sigue escalando hasta un máximo de 10 pares).

### C. Estrategia de Salida: Refined Riding (Trailing Stop)
* **Target Inicial:** +0.30% (Neto).
* **Fase Riding:** Al alcanzar el target, el bot entra en modo "Riding" (Surfeo).
* **Venta Inteligente:** El bot rastrea el pico máximo de ganancia. Si la ganancia cae un **10% de ese pico** (ej. de +0.50% a +0.45%), se ejecuta la venta para asegurar beneficios.

## 4. Instrucción de Despliegue y Ejecución
1. **Configuración**: Asegúrate de tener tu archivo `.env` con `BINANCE_API_KEY` y `BINANCE_SECRET`.
2. **Puertos**: El Dashboard utiliza el puerto **3334** y el WebSocket el **8080**.

### Ejecución Directa:
- **Mac / Linux**: 
  ```bash
  chmod +x start_slavi.sh
  ./start_slavi.sh
  ```
- **Windows**: 
  Haz doble clic en `start_slavi.bat`.

### Dashboard:
Accede a la telemetría en tiempo real: **[http://localhost:3334](http://localhost:3334)**

### Comandos Adicionales:
- `npm run analyze`: Muestra el resumen de ganancias y trades cerrados.
- `npm run migrate:001`: Inicializa/Actualiza la base de datos de trades.
