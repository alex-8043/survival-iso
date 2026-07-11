// Cliente de render con PixiJS v8. Solo dibuja el estado que entrega la
// simulación: capa de suelo (un Graphics), capa de entidades ordenada por
// profundidad (props + jugador) y una cámara que sigue al jugador.

import { Application, Container, Graphics } from 'pixi.js';
import { TILE_W, TILE_H } from '../shared/constants';
import { gridToScreen, depthOf } from '../shared/iso';
import type { ChunkData, Snapshot } from '../shared/protocol';

const TILE_COLORS = [0x5a9e4f, 0x4f8f45, 0x3a6ea5]; // pasto, pasto variante, agua

interface RenderEntity {
  sprite: Container;
  tx: number; // objetivo (grid) que envía la sim
  ty: number;
  rx: number; // posición renderizada (suavizada)
  ry: number;
}

export class GameRenderer {
  app!: Application;
  readonly world = new Container(); // contenedor-cámara
  readonly ground = new Graphics();
  readonly entities = new Container();
  readonly ents = new Map<number, RenderEntity>();
  playerId = -1;

  async init(parent: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      background: 0x1e2030,
      antialias: false, // pixel-art: sin suavizado
      resizeTo: window,
      // WebGL por compatibilidad máxima (es suficiente para pixel-art 2D).
      // WebGPU en Pixi v8 puede dejar la pantalla en blanco en algunos equipos;
      // se puede reactivar cambiando a 'webgpu' cuando se estabilice.
      preference: 'webgl',
    });
    parent.appendChild(this.app.canvas);

    this.entities.sortableChildren = true;
    this.world.addChild(this.ground);
    this.world.addChild(this.entities);
    this.app.stage.addChild(this.world);

    this.app.ticker.add((ticker) => this.update(ticker.deltaMS));
    // eslint-disable-next-line no-console
    console.log('[client] pixi listo');
  }

  setChunk(chunk: ChunkData, playerId: number): void {
    this.playerId = playerId;
    this.drawGround(chunk);
    this.drawProps(chunk);
    // eslint-disable-next-line no-console
    console.log('[client] chunk recibido: size', chunk.size, 'props', chunk.props.length);
  }

  private drawGround(chunk: ChunkData): void {
    const g = this.ground;
    g.clear();
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    for (let y = 0; y < chunk.size; y++) {
      for (let x = 0; x < chunk.size; x++) {
        const t = chunk.tiles[y * chunk.size + x];
        const s = gridToScreen(x, y);
        g.poly([s.x, s.y - hh, s.x + hw, s.y, s.x, s.y + hh, s.x - hw, s.y])
          .fill({ color: TILE_COLORS[t] ?? TILE_COLORS[0] })
          .stroke({ width: 1, color: 0x000000, alpha: 0.08 });
      }
    }
  }

  private drawProps(chunk: ChunkData): void {
    for (const p of chunk.props) {
      const s = gridToScreen(p.x, p.y);
      const c = new Graphics();
      if (p.kind === 'tree') {
        c.ellipse(0, -2, 12, 6).fill({ color: 0x000000, alpha: 0.22 }); // sombra
        c.rect(-3, -20, 6, 20).fill({ color: 0x6b4a2b }); // tronco
        c.ellipse(0, -28, 16, 18).fill({ color: 0x2f7d3a }); // copa
        c.ellipse(-6, -34, 10, 11).fill({ color: 0x3a9247 });
      } else {
        c.ellipse(0, -1, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
        c.ellipse(0, -6, 14, 10).fill({ color: 0x7a7f8a }); // roca
        c.ellipse(-4, -10, 8, 7).fill({ color: 0x9aa0ab });
      }
      c.x = s.x;
      c.y = s.y;
      c.zIndex = depthOf(p.x, p.y);
      this.entities.addChild(c);
    }
  }

  private makePlayer(): Container {
    const g = new Graphics();
    g.ellipse(0, 0, 9, 5).fill({ color: 0x000000, alpha: 0.28 }); // sombra
    g.roundRect(-6, -22, 12, 20, 3).fill({ color: 0xe0803a }); // cuerpo
    g.circle(0, -26, 6.5).fill({ color: 0xf2d3a8 }); // cabeza
    g.rect(-6, -14, 12, 3).fill({ color: 0x9c4a1e }); // cinturón
    return g;
  }

  applySnapshot(snap: Snapshot): void {
    for (const e of snap.entities) {
      let re = this.ents.get(e.id);
      if (!re) {
        const sprite = this.makePlayer();
        this.entities.addChild(sprite);
        re = { sprite, tx: e.x, ty: e.y, rx: e.x, ry: e.y };
        this.ents.set(e.id, re);
      } else {
        re.tx = e.x;
        re.ty = e.y;
      }
    }
  }

  private update(dtMs: number): void {
    if (!this.app) return;
    const k = Math.min(1, (dtMs / 1000) * 20); // suavizado exponencial
    for (const [id, re] of this.ents) {
      re.rx += (re.tx - re.rx) * k;
      re.ry += (re.ty - re.ry) * k;
      const s = gridToScreen(re.rx, re.ry);
      re.sprite.x = s.x;
      re.sprite.y = s.y;
      re.sprite.zIndex = depthOf(re.rx, re.ry) + 0.5; // por encima del prop de su tile
      if (id === this.playerId) {
        this.world.x = this.app.screen.width / 2 - s.x;
        this.world.y = this.app.screen.height / 2 - s.y;
      }
    }
  }
}
