// Cliente de render con PixiJS v8. Dibuja el estado que entrega la simulación:
// suelo isométrico, nodos recolectables (con resaltado del objetivo), jugador,
// y textos flotantes de feedback. Todo ordenado por profundidad.

import { Application, Container, Graphics, Text } from 'pixi.js';
import { TILE_W, TILE_H } from '../shared/constants';
import { gridToScreen, depthOf } from '../shared/iso';
import type { ChunkData, NodeSnap, Snapshot } from '../shared/protocol';

const TILE_COLORS = [0x5a9e4f, 0x4f8f45, 0x3a6ea5]; // pasto, pasto variante, agua

interface RenderEntity {
  sprite: Container;
  tx: number;
  ty: number;
  rx: number;
  ry: number;
}

interface RenderNode {
  sprite: Container;
  x: number;
  y: number;
  kind: string;
  amount: number;
  pulse: number; // animación de "golpe" (1 -> 0)
}

interface FloatText {
  text: Text;
  life: number;
}

export class GameRenderer {
  app!: Application;
  readonly world = new Container(); // contenedor-cámara
  readonly ground = new Graphics();
  readonly highlight = new Graphics();
  readonly entities = new Container(); // nodos + jugador + flotantes, ordenado por profundidad
  readonly ents = new Map<number, RenderEntity>();
  readonly nodes = new Map<number, RenderNode>();
  readonly floats: FloatText[] = [];
  playerId = -1;
  targetNodeId = -1;

  async init(parent: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      background: 0x1e2030,
      antialias: false,
      resizeTo: window,
      preference: 'webgl',
    });
    parent.appendChild(this.app.canvas);

    this.entities.sortableChildren = true;
    this.world.addChild(this.ground);
    this.world.addChild(this.highlight);
    this.world.addChild(this.entities);
    this.app.stage.addChild(this.world);

    this.app.ticker.add((ticker) => this.update(ticker.deltaMS));
    // eslint-disable-next-line no-console
    console.log('[client] pixi listo');
  }

  setChunk(chunk: ChunkData): void {
    this.drawGround(chunk);
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

  setNodes(list: NodeSnap[]): void {
    for (const n of list) this.upsertNode(n);
  }

  updateNodes(list: NodeSnap[]): void {
    for (const n of list) this.upsertNode(n);
  }

  private upsertNode(n: NodeSnap): void {
    let rn = this.nodes.get(n.id);
    if (!n.alive) {
      if (rn) {
        this.entities.removeChild(rn.sprite);
        rn.sprite.destroy();
        this.nodes.delete(n.id);
      }
      return;
    }
    if (!rn) {
      const sprite = this.makeNode(n.kind);
      const s = gridToScreen(n.x, n.y);
      sprite.x = s.x;
      sprite.y = s.y;
      sprite.zIndex = depthOf(n.x, n.y);
      this.entities.addChild(sprite);
      rn = { sprite, x: n.x, y: n.y, kind: n.kind, amount: n.amount, pulse: 0 };
      this.nodes.set(n.id, rn);
    }
    if (n.amount < rn.amount) rn.pulse = 1; // se recolectó: dispara el "pop"
    rn.amount = n.amount;
  }

  private makeNode(kind: string): Container {
    const c = new Graphics();
    if (kind === 'tree') {
      c.ellipse(0, -2, 12, 6).fill({ color: 0x000000, alpha: 0.22 }); // sombra
      c.rect(-3, -20, 6, 20).fill({ color: 0x6b4a2b }); // tronco
      c.ellipse(0, -28, 16, 18).fill({ color: 0x2f7d3a }); // copa
      c.ellipse(-6, -34, 10, 11).fill({ color: 0x3a9247 });
    } else {
      c.ellipse(0, -1, 12, 6).fill({ color: 0x000000, alpha: 0.22 });
      c.ellipse(0, -6, 14, 10).fill({ color: 0x7a7f8a }); // roca
      c.ellipse(-4, -10, 8, 7).fill({ color: 0x9aa0ab });
    }
    return c;
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
    this.targetNodeId = snap.targetNodeId;
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

  spawnFloat(label: string, color: number, gx: number, gy: number): void {
    const t = new Text({
      text: label,
      style: {
        fill: color,
        fontSize: 15,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: '700',
        stroke: { color: 0x0a0a12, width: 3 },
      },
    });
    t.anchor.set(0.5);
    const s = gridToScreen(gx, gy);
    t.x = s.x;
    t.y = s.y - 34;
    t.zIndex = 1_000_000;
    this.entities.addChild(t);
    this.floats.push({ text: t, life: 0 });
  }

  private update(dtMs: number): void {
    if (!this.app) return;
    const dt = dtMs / 1000;
    const k = Math.min(1, dt * 20);

    for (const [id, re] of this.ents) {
      re.rx += (re.tx - re.rx) * k;
      re.ry += (re.ty - re.ry) * k;
      const s = gridToScreen(re.rx, re.ry);
      re.sprite.x = s.x;
      re.sprite.y = s.y;
      re.sprite.zIndex = depthOf(re.rx, re.ry) + 0.5;
      if (id === this.playerId) {
        this.world.x = this.app.screen.width / 2 - s.x;
        this.world.y = this.app.screen.height / 2 - s.y;
      }
    }

    // Resaltado del nodo objetivo
    this.drawHighlight(this.nodes.get(this.targetNodeId));

    // Animación de "golpe" de los nodos
    for (const rn of this.nodes.values()) {
      if (rn.pulse > 0) {
        rn.pulse = Math.max(0, rn.pulse - dt * 6);
        rn.sprite.scale.set(1 + 0.16 * rn.pulse);
      }
    }

    // Textos flotantes de feedback
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life += dt;
      f.text.y -= dt * 26;
      f.text.alpha = Math.max(0, 1 - f.life / 0.9);
      if (f.life >= 0.9) {
        this.entities.removeChild(f.text);
        f.text.destroy();
        this.floats.splice(i, 1);
      }
    }
  }

  private drawHighlight(target?: RenderNode): void {
    const g = this.highlight;
    g.clear();
    if (!target) return;
    const s = gridToScreen(target.x, target.y);
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    g.poly([s.x, s.y - hh, s.x + hw, s.y, s.x, s.y + hh, s.x - hw, s.y]).stroke({
      width: 2,
      color: 0xf5c96b,
      alpha: 0.95,
    });
  }
}
