import { modify } from "./util.js";

const IDLE_HOP_PERIOD = 2.6;   
const IDLE_HOP_TIME = 0.35;  
const IDLE_HOP_HEIGHT = 0.5;
const LOAD_TIME = 0.6;       
const LOAD_ARC = 3;         
const SHUFFLE_TIME = 0.45;
const SHUFFLE_ARC = 0.8;


function arc(u, height) {
  return 4 * height * u * (1 - u);
}

export function BirdQueue(image, size, count, firstSpot, spacing) {
  this.image = image;
  this.size = size;
  this.firstSpot = { ...firstSpot };
  this.spacing = spacing;
  this.birds = [];

  this.spot = (i) => ({ x: this.firstSpot.x - i * this.spacing, y: this.firstSpot.y });

  this.create = () => {
    for (let i = 0; i < count; i++) {
      const n = `Queue${i + 1}`;
      const s = this.spot(i);
      ggbApplet.evalCommand(`${n}C = (${s.x}, ${s.y})`);
      ggbApplet.evalCommand(`${n}L = (x(${n}C) - ${size}/2, y(${n}C) - ${size}/2)`);
      ggbApplet.evalCommand(`${n}R = (x(${n}C) + ${size}/2, y(${n}C) - ${size}/2)`);
      ggbApplet.evalXML(`
      <element type="image" label="${n}Img">
          <file name="${this.image}"/>
          <show object="true" label="false"/>
          <layer val="5"/>
          <startPoint number="0" exp="${n}L"/>
          <startPoint number="1" exp="${n}R"/>
      </element>`);
      [`${n}C`, `${n}L`, `${n}R`].forEach((o) => modify(o, { visible: false }));

      this.birds.push({ label: n, pos: s, move: null, phase: i * 0.9 });
    }
  };

  this.waiting = () => this.birds.length;

  this.next = (target, now, onArrive) => {
    if (this.birds.length === 0) return false;

    const front = this.birds.shift();
    front.move = { from: front.pos, to: { ...target }, start: now, time: LOAD_TIME, arc: LOAD_ARC, done: onArrive };
    this.leaving = front;

    this.birds.forEach((b, i) => {
      b.move = { from: b.pos, to: this.spot(i), start: now + 150 * (i + 1), time: SHUFFLE_TIME, arc: SHUFFLE_ARC };
    });
    return true;
  };

  this.update = (now) => {
    const seconds = now / 1000;

    for (const b of [...this.birds, this.leaving].filter(Boolean)) {
      let p;
      if (b.move && now >= b.move.start) {
        const u = Math.min(1, (now - b.move.start) / 1000 / b.move.time);
        p = {
          x: b.move.from.x + (b.move.to.x - b.move.from.x) * u,
          y: b.move.from.y + (b.move.to.y - b.move.from.y) * u + arc(u, b.move.arc),
        };
        if (u >= 1) {
          b.pos = { ...b.move.to };
          const done = b.move.done;
          b.move = null;
          if (done) {
            ggbApplet.setVisible(`${b.label}Img`, false);
            this.leaving = null;
            done();
            continue;
          }
        }
      } else if (b.move) {
        p = b.pos;
      } else {
        const t = (seconds + b.phase) % IDLE_HOP_PERIOD;
        p = { x: b.pos.x, y: b.pos.y + (t < IDLE_HOP_TIME ? arc(t / IDLE_HOP_TIME, IDLE_HOP_HEIGHT) : 0) };
      }
      ggbApplet.setCoords(`${b.label}C`, p.x, p.y);
    }
  };
}
