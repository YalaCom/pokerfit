export class StickyCoinManager {
  constructor(engine) {
    this.engine = engine;
    this.PIXI = engine.PIXI;
    this.nodes = new Map();

    this.root = new this.PIXI.Container();
    this.root.zIndex = 120;
    this.engine.layers.foreground.addChild(this.root);
  }

  destroy() {
    this.reset();
    try {
      this.root.destroy({ children: true });
    } catch {}
  }

  reset() {
    for (const node of this.nodes.values()) {
      try {
        gsap.killTweensOf(node);
        gsap.killTweensOf(node.scale);
        node.destroy({ children: true });
      } catch {}
    }
    this.nodes.clear();
  }

  hide() {
    this.root.visible = false;
  }

  show() {
    this.root.visible = true;
  }

  count() {
    return this.nodes.size;
  }

  async addNew(positions = []) {
    this.show();

    for (const position of positions) {
      const key = this.keyOf(position);
      if (this.nodes.has(key)) continue;

      const cell = this.engine.reels.visibleCenter(position.r, position.c);
      const node = this.makeNode();
      node.position.set(cell.x, cell.y);
      node.scale.set(0.15);
      node.alpha = 0;

      this.root.addChild(node);
      this.nodes.set(key, node);

      this.engine.audio.play("stickyCoinLand", {
        volume: 0.82,
        rate: 0.94 + Math.random() * 0.12
      });
      this.engine.haptics.impact("light");
      this.engine.particles.emit("goldCoinBurst", cell.x, cell.y, {
        count: 14,
        tint: 0xffd75b,
        speed: 150,
        life: 0.72
      });

      await timelineDone(
        gsap.timeline()
          .to(node, { alpha: 1, duration: 0.08 })
          .to(node.scale, {
            x: 1.18,
            y: 1.18,
            duration: 0.2,
            ease: "back.out(3)"
          }, 0)
          .to(node.scale, {
            x: 1,
            y: 1,
            duration: 0.12,
            ease: "power2.out"
          })
      );
    }
  }

  sync(positions = []) {
    const wanted = new Set(positions.map(position => this.keyOf(position)));

    for (const position of positions) {
      const key = this.keyOf(position);
      if (this.nodes.has(key)) continue;

      const cell = this.engine.reels.visibleCenter(position.r, position.c);
      const node = this.makeNode();
      node.position.set(cell.x, cell.y);
      this.root.addChild(node);
      this.nodes.set(key, node);
    }

    for (const [key, node] of [...this.nodes.entries()]) {
      if (wanted.has(key)) continue;
      try {
        node.destroy({ children: true });
      } catch {}
      this.nodes.delete(key);
    }
  }

  makeNode() {
    const PIXI = this.PIXI;
    const container = new PIXI.Container();

    const ring = new PIXI.Graphics();
    ring
      .circle(0, 0, 48)
      .fill({ color: 0x2a1502, alpha: 0.86 })
      .stroke({ color: 0xffd75a, width: 4, alpha: 0.95 });

    const coin = new PIXI.Text({
      text: "🪙",
      style: {
        fontFamily: "Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif",
        fontSize: 72,
        align: "center"
      }
    });
    coin.anchor.set(0.5);

    const lock = new PIXI.Text({
      text: "LOCKED",
      style: {
        fontFamily: "Arial",
        fontSize: 13,
        fontWeight: "900",
        fill: 0xffedaa,
        stroke: { color: 0x3a1900, width: 3 }
      }
    });
    lock.anchor.set(0.5);
    lock.y = 35;

    container.addChild(ring, coin, lock);

    const cellSize = Math.min(
      this.engine.reels.cellW,
      this.engine.reels.cellH
    );
    const scale = Math.min(1, cellSize / 104);
    container.scale.set(scale);

    return container;
  }

  keyOf(position) {
    return `${position.r}:${position.c}`;
  }
}

function timelineDone(timeline) {
  return new Promise(resolve => timeline.eventCallback("onComplete", resolve));
}
