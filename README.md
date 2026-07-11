# Survival Iso — Fase 1 (núcleo técnico)

Prototipo del juego de supervivencia isométrico 2D. Esta fase valida la premisa
técnica: **caminar por un mundo isométrico con orden de profundidad correcto**,
con la lógica ya separada en una **simulación ECS headless** dentro de un
**Web Worker** (arquitectura lista para multiplayer sin reescritura).

## Requisitos

- Node.js 18+ (probado con Node 22)

## Cómo ejecutar

```bash
npm install
npm run dev
```

Abrí la URL que imprime Vite (por defecto http://localhost:5173).

Controles: **WASD** o **flechas** para moverte.

Otros scripts:

```bash
npm run build      # typecheck + build de producción a /dist
npm run preview    # sirve /dist
npm run typecheck  # solo comprobación de tipos
```

## Qué incluye esta fase

- **Simulación autoritativa** con [bitECS](https://github.com/NateTheGreatt/bitECS)
  (`Position`, `Velocity`, `Player`) corriendo en un Web Worker a 60 Hz con
  timestep fijo.
- **Protocolo con forma de red** cliente↔simulación (`input` → sim; `ready` /
  `snapshot` → cliente). El mismo contrato servirá para el servidor multiplayer.
- **Render PixiJS v8** (WebGPU con fallback a WebGL): mundo isométrico por rombos,
  props (árboles/rocas) y jugador ordenados por profundidad, cámara que sigue.
- **Mundo determinista** por semilla (mismo seed → mismo mapa).

## Estructura

```
src/
  shared/     código compartido sim <-> cliente (sin DOM ni Pixi)
    constants.ts   tamaños de tile/chunk, tick, velocidad
    iso.ts         conversión cuadrícula <-> pantalla + profundidad
    rng.ts         PRNG determinista (mulberry32)
    protocol.ts    tipos de mensajes (contrato de red)
  sim/        SIMULACIÓN (headless; corre en Worker hoy, en Node en MP)
    world.ts       componentes ECS, generación de chunk, paso de simulación
    worker.ts      entrada del Web Worker + loop de tick + protocolo
  client/     RENDER + input (solo en el navegador)
    renderer.ts    Pixi: capas, isometría, depth-sort, cámara
    input.ts       teclado -> estado de input -> mensajes
  main.ts     arranque: init render, lanzar worker, cablear todo
```

## Próximos pasos (Fase 2)

Nodos de recurso, recolección e inventario data-driven. La simulación ya está
preparada para añadir sistemas ECS (gather, craft, build, combat) sin tocar el
render.
