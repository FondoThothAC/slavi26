# 📄 SDD: SLAVI Production Suite (v2.0)

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

## 4. Instrucción de Despliegue (Migración)
1. **GitHub**: Subir a repositorio privado (excluyendo `.env` y `data/`).
2. **Setup**:
   - `npm install`
   - Configurar `.env` con las claves API de Binance.
3. **Ejecución**: 
   - Windows: `npm run dev` o `./launch_bnb_bot.bat`
   - macOS/Linux: `npm run dev`
