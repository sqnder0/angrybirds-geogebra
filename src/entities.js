import { debugging, BLOCK_MAX_IMAGE_STATE, PIG_MAX_IMAGE_STATE } from "./config.js";
import { entities } from "./state.js";
import { capitalize, modify, queueXML, tryTo } from "./util.js";
import { score } from "./score.js";

function contact(nx, ny, depth) {
  return { normal: { x: nx, y: ny }, depth: depth };
}

function circleRectContact(c, r) {
  const halfW = r.width / 2;
  const halfH = r.height / 2;
  const dx = c.center.x - r.center.x;
  const dy = c.center.y - r.center.y;

  const inside = Math.abs(dx) <= halfW && Math.abs(dy) <= halfH;

  if (!inside) {
    const cx = Math.min(Math.max(dx, -halfW), halfW);
    const cy = Math.min(Math.max(dy, -halfH), halfH);
    const ox = dx - cx;
    const oy = dy - cy;
    const dist = Math.sqrt(ox * ox + oy * oy);
    if (dist >= c.radius) return null;
    return contact(ox / dist, oy / dist, c.radius - dist);
  }

  const toEdgeX = halfW - Math.abs(dx);
  const toEdgeY = halfH - Math.abs(dy);
  if (toEdgeX < toEdgeY) return contact(Math.sign(dx) || 1, 0, c.radius + toEdgeX);
  return contact(0, Math.sign(dy) || 1, c.radius + toEdgeY);
}

function centroid(vertices) {
  const sum = vertices.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 });
  return { x: sum.x / vertices.length, y: sum.y / vertices.length };
}


function edgeNormals(vertices) {
  return vertices.map((v, i) => {
    const next = vertices[(i + 1) % vertices.length];
    const ex = next.x - v.x;
    const ey = next.y - v.y;
    const len = Math.sqrt(ex * ex + ey * ey);
    return { x: ey / len, y: -ex / len };
  });
}

function project(vertices, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of vertices) {
    const d = v.x * axis.x + v.y * axis.y;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return { min, max };
}


function smallestOverlap(axes, projectA, projectB, centerA, centerB) {
  let best = null;
  for (const axis of axes) {
    const a = projectA(axis);
    const b = projectB(axis);
    const overlap = Math.min(a.max, b.max) - Math.max(a.min, b.min);
    if (overlap <= 0) return null;
    if (best === null || overlap < best.depth) {
      // Point the normal from B towards A
      const dir = (centerA.x - centerB.x) * axis.x + (centerA.y - centerB.y) * axis.y;
      best = dir < 0 ? contact(-axis.x, -axis.y, overlap) : contact(axis.x, axis.y, overlap);
    }
  }
  return best;
}

function polygonContact(a, b) {
  const va = a.vertices();
  const vb = b.vertices();
  return smallestOverlap(
    [...edgeNormals(va), ...edgeNormals(vb)],
    (axis) => project(va, axis),
    (axis) => project(vb, axis),
    centroid(va),
    centroid(vb),
  );
}

function circlePolygonContact(c, p) {
  const vp = p.vertices();

  let closest = vp[0];
  let closestDist = Infinity;
  for (const v of vp) {
    const d = (v.x - c.center.x) ** 2 + (v.y - c.center.y) ** 2;
    if (d < closestDist) {
      closest = v;
      closestDist = d;
    }
  }
  const axes = edgeNormals(vp);
  if (closestDist > 0) {
    const len = Math.sqrt(closestDist);
    axes.push({ x: (c.center.x - closest.x) / len, y: (c.center.y - closest.y) / len });
  }

  return smallestOverlap(
    axes,
    (axis) => {
      const d = c.center.x * axis.x + c.center.y * axis.y;
      return { min: d - c.radius, max: d + c.radius };
    },
    (axis) => project(vp, axis),
    c.center,
    centroid(vp),
  );
}

export class HitBox {
  constructor(center) {
    this.center = { ...center };
  }

  contains(point) {
    return false;
  }

  collide(hBox) {
    return null;
  }

  collidesWith(hBox) {
    return this.collide(hBox) !== null;
  }

  halfHeight() {
    return 0;
  }

  area() {
    return 0;
  }

  moveTo(center) {
    this.center = { ...center };
    return this;
  }

  translate(dx, dy) {
    this.center = { x: this.center.x + dx, y: this.center.y + dy };
    return this;
  }
}

export class Circle extends HitBox {
  constructor(center, radius) {
    super(center);
    this.type = "circle";
    this.radius = radius;
  }

  contains(point) {
    const dx = point.x - this.center.x;
    const dy = point.y - this.center.y;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }

  collide(hbox) {
    switch (hbox.type) {
      case "circle": {
        const dx = this.center.x - hbox.center.x;
        const dy = this.center.y - hbox.center.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const totalRadius = this.radius + hbox.radius;
        if (dist >= totalRadius) return null;
        if (dist === 0) return contact(0, 1, totalRadius);
        return contact(dx / dist, dy / dist, totalRadius - dist);
      }

      case "rectangle":
        return circleRectContact(this, hbox);

      case "triangle":
        return circlePolygonContact(this, hbox);
    }
    return null;
  }

  halfHeight() {
    return this.radius;
  }

  area() {
    return Math.PI * this.radius * this.radius;
  }
}

export class Rectangle extends HitBox {
  constructor(center, width, height) {
    super(center);
    this.type = "rectangle";
    this.width = width;
    this.height = height;
  }

  contains(point) {
    return (
      Math.abs(point.x - this.center.x) <= this.width / 2 &&
      Math.abs(point.y - this.center.y) <= this.height / 2
    );
  }

  collide(hbox) {
    switch (hbox.type) {
      case "circle": {
        const hit = circleRectContact(hbox, this);
        if (!hit) return null;
        return contact(-hit.normal.x, -hit.normal.y, hit.depth);
      }

      case "rectangle": {
        const dx = this.center.x - hbox.center.x;
        const dy = this.center.y - hbox.center.y;
        const overlapX = (this.width + hbox.width) / 2 - Math.abs(dx);
        const overlapY = (this.height + hbox.height) / 2 - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) return null;

        // Separate along the axis with the least overlap
        if (overlapX < overlapY) return contact(Math.sign(dx) || 1, 0, overlapX);
        return contact(0, Math.sign(dy) || 1, overlapY);
      }

      case "triangle":
        return polygonContact(this, hbox);
    }
    return null;
  }

  vertices() {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const { x, y } = this.center;
    return [
      { x: x - halfW, y: y - halfH },
      { x: x + halfW, y: y - halfH },
      { x: x + halfW, y: y + halfH },
      { x: x - halfW, y: y + halfH },
    ];
  }

  halfHeight() {
    return this.height / 2;
  }

  area() {
    return this.width * this.height;
  }
}

export class Triangle extends HitBox {
  constructor(center, width, height, apex = "left") {
    super(center);
    this.type = "triangle";
    this.width = width;
    this.height = height;
    this.apex = apex;
  }

  vertices() {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const { x, y } = this.center;
    const cornerX = { left: x - halfW, right: x + halfW, center: x }[this.apex];
    // Counter-clockwise so edgeNormals point outwards
    return [
      { x: x - halfW, y: y - halfH },
      { x: x + halfW, y: y - halfH },
      { x: cornerX, y: y + halfH },
    ];
  }

  contains(point) {
    const v = this.vertices();
    return edgeNormals(v).every(
      (n, i) => (point.x - v[i].x) * n.x + (point.y - v[i].y) * n.y <= 0,
    );
  }

  collide(hbox) {
    switch (hbox.type) {
      case "circle": {
        const hit = circlePolygonContact(hbox, this);
        if (!hit) return null;
        return contact(-hit.normal.x, -hit.normal.y, hit.depth);
      }

      case "rectangle":
      case "triangle":
        return polygonContact(this, hbox);
    }
    return null;
  }

  halfHeight() {
    return this.height / 2;
  }

  area() {
    return (this.width * this.height) / 2;
  }
}

function createImageCorners(c, l, r, halfWidth, below, angle) {
  const corner = (dx) => {
    const p = `(x(${c}) + (${dx}), y(${c}) - ${below})`;
    return angle ? `Rotate(${p}, ${angle}, ${c})` : p;
  };
  if (angle) {
    ggbApplet.evalCommand(`${angle} = 0`);
    ggbApplet.setVisible(angle, false);
  }
  ggbApplet.evalCommand(`${l} = ${corner(-halfWidth)}`);
  ggbApplet.evalCommand(`${r} = ${corner(halfWidth)}`);
}

export function JoyStick(radius, x, y) {
  this.radius = radius;
  this.center = { x: x, y: y };
  this.centerPoint = `(${this.center.x}, ${this.center.y})`;

  this.draw = function () {
    if (ggbApplet.exists("joystick")) {
      console.log("Joystick already exists");
      ggbApplet.deleteObject("joystick");
      ggbApplet.deleteObject("thumb");
    }

    ggbApplet.evalCommand(
      `joystick = Circle(${this.centerPoint}, ${this.radius})`,
    );
    modify("joystick", { color: [0, 0, 0], labelVisible: false });

    ggbApplet.evalCommand(`Thumb = ${this.centerPoint}`);
    modify("Thumb", { color: [0, 0, 0], labelVisible: false });

    ggbApplet.evalCommand(
      `Thumb' = ${this.centerPoint} + (Min[1, ${radius} / Distance[${this.centerPoint}, Thumb]] * (Thumb - ${this.centerPoint}))`,
    );
    modify("Thumb'", { labelVisible: false, visible: false });

    ggbApplet.evalCommand(
      `Vpull = (${this.center.x} - x(Thumb'))/${this.radius}`,
    );
    ggbApplet.evalCommand(
      `Hpull = (${this.center.y} - y(Thumb'))/${this.radius}`,
    );
  };

  this.verticalPull = function () {
    return (this.center.x - ggbApplet.getXcoord("Thumb'")) / this.radius;
  };
  this.horizontalPull = function () {
    return (this.center.y - ggbApplet.getYcoord("Thumb'")) / this.radius;
  };
}

export function Bird(name, image, width, x, y) {
  this.image = image;
  this.height = width;
  this.width = width;
  this.center = { x: x, y: y };
  this.left = { x: x - width / 2, y: y - width / 2 };
  this.right = { x: x + width / 2, y: y - width / 2 };
  this.movement = { x: 0, y: 0 };
  this.name = capitalize(name);
  this.falling = false;
  this.lastMove;
  this.restitution = { x: 0.5, y: 0.5 };
  this.hitbox = new Circle(this.center, width / 2);
  this.mass = this.hitbox.area();
  this.rolls = true;
  this.angle = 0;
  this.spin = 0;

  this.create = () => {
    entities.push(this);

    const n = this.name;

    ggbApplet.evalCommand(`${n}Center = (${this.center.x}, ${this.center.y})`);
    createImageCorners(`${n}Center`, `${n}Left`, `${n}Right`, this.width / 2, this.width / 2, `${n}Ang`);

    ggbApplet.evalXML(`
    <element type="image" label="${n}Img">
        <file name="${this.image}"/>
        <show object="true" label="false"/>
        <layer val="5"/>
        <startPoint number="0" exp="${n}Left"/>
        <startPoint number="1" exp="${n}Right"/>
    </element>`);

    modify(`${n}Center`, { visible: false });
    modify(`${n}Left`, { visible: false });
    modify(`${n}Right`, { visible: false });
  };

  this.draw = () => {
    ggbApplet.setCoords(`${this.name}Center`, this.center.x, this.center.y);
    ggbApplet.setValue(`${this.name}Ang`, this.angle);
  };
}


function makeDamageable(entity, label, maxImageState, kind) {
  const despawnState = maxImageState + 1;
  entity.despawned = false;

  entity.calcState = () => {
    if (entity.hp <= 0) return despawnState;
    const damaged = 1 - entity.hp / entity.originalHp;
    return Math.min(maxImageState, Math.floor(damaged * (maxImageState + 1)));
  };

  entity.draw = () => {
    if (entity.despawned) return;
    ggbApplet.setCoords(`${label}C`, entity.center.x, entity.center.y);
    if (entity.rolls) ggbApplet.setValue(`${label}Ang`, entity.angle);

    const newState = entity.calcState();
    if (newState === entity.state) return;

    if (newState === despawnState) {
      entity.despawn();
    } else {
      ggbApplet.setVisible(entity.imgName(entity.state), false);
      ggbApplet.setVisible(entity.imgName(newState), true);
    }
    entity.state = newState;
  };

  entity.despawn = () => {
    entity.despawned = true;
    for (let s = 0; s <= maxImageState; s++) {
      if (ggbApplet.exists(entity.imgName(s)))
        ggbApplet.deleteObject(entity.imgName(s));
    }
    [`${label}L`, `${label}R`, `${label}C`, `${label}Ang`].forEach((o) => {
      if (ggbApplet.exists(o)) ggbApplet.deleteObject(o);
    });
  };

  entity.damage = (amount) => {
    if (entity.despawned) return;
    entity.hp = Math.max(0, entity.hp - amount);
    score.hit(kind, entity.hp === 0);
    entity.draw();
  };
}

export function Pig(
  name,
  image,
  width,
  height,
  health,
  center,
  falling,
  maxImageState = PIG_MAX_IMAGE_STATE,
) {
  this.image = image;
  this.height = height;
  this.width = width;
  // Center is the middle of the round body, anything taller (a crown) sticks out above it
  this.center = center;
  this.radius = Math.min(width, height) / 2;
  this.left = { x: this.center.x - width / 2, y: this.center.y - this.radius };
  this.right = { x: this.center.x + width / 2, y: this.center.y - this.radius };
  this.movement = { x: 0, y: 0 };
  this.name = capitalize(name);

  this.originalHp = health;
  this.hp = health;

  this.state = 0;

  this.falling = falling;
  this.restitution = { x: 0.75, y: 0.6 };
  this.hitbox = new Circle(this.center, this.radius);
  this.mass = this.hitbox.area();
  this.rolls = true;
  this.angle = 0;
  this.spin = 0;

  this.path = image;

  this.imgName = (s) => `${this.name}Img${s}`;
  this.imgFile = (s) => `${this.path}/damage_${s}.png`;

  this.create = () => {
    entities.push(this);

    const n = this.name;

    ggbApplet.evalCommand(`${n}C = (${this.center.x}, ${this.center.y})`);
    createImageCorners(`${n}C`, `${n}L`, `${n}R`, this.width / 2, this.radius, `${n}Ang`);

    for (let s = 0; s <= maxImageState; s++) {
      queueXML(`
            <element type="image" label="${this.imgName(s)}">
                <file name="${this.imgFile(s)}"/>
                <show object="${s === this.state}" label="false"/>
                <layer val="5"/>
                <startPoint number="0" exp="${n}L"/>
                <startPoint number="1" exp="${n}R"/>
            </element>`);
    }

    modify(`${n}C`, { visible: false });
    modify(`${n}L`, { visible: false });
    modify(`${n}R`, { visible: false });
  };

  makeDamageable(this, this.name, maxImageState, "pig");
}

export function Trajectory() {
  this.lineStyle = 3;
  this.lineThickness = 10;
  this.opacity = 20;
  this.visible = true;
  this.color = [0, 0, 0];

  this.setup = () => {
    tryTo("Graph setup: t(x)", () => {
      // Time to reach x when launched from the pulled back pouch (LaunchX, LaunchY)
      ggbApplet.evalCommand(`t(x) = (x - LaunchX) / ((v * Vpull))`);
      modify("t", { visible: false });
    });

    ggbApplet.evalXML(`
        <element type="function" label="f">
            <lineStyle thickness="${this.lineThickness}" type="${this.lineStyle}" typeHidden="1" opacity="${this.opacity}"/>
        </element>`);

    tryTo("Graph setup: f(x)", () => {
      ggbApplet.evalCommand(
        `f(x) = If(Vpull > 0 && x >= LaunchX + 2 && LaunchY + ((v * Hpull) * t(x)) - ((0.5 * g) * (t(x))^(2)) >= LaunchY, ` +
          `LaunchY + ((v * Hpull) * t(x)) - ((0.5 * g) * (t(x))^(2)))`,
      );

      this.update();
    });
  };

  this.update = () => {
    ggbApplet.setLineStyle("f", this.lineStyle);
    ggbApplet.setLineThickness("f", this.lineThickness);
    modify("f", {
      color: this.color,
      visible: this.visible,
      labelVisible: false,
    });
  };
}

export function Block(
  path,
  center,
  hitbox,
  id,
  width = 2,
  height = 2,
  health = 20,
  isStatic = true,
) {
  this.id = capitalize(id);

  this.path = path;
  this.center = center;
  this.hitbox = hitbox ?? new Rectangle(center, width, height);
  this.width = width;
  this.height = height;
  this.originalHp = health;
  this.hp = health;
  this.state = 0;

  this.isStatic = isStatic;
  this.movement = { x: 0, y: 0 };
  this.falling = !isStatic;
  this.restitution = { x: 0.5, y: 0.5 };
  this.mass = this.hitbox.area();
  // Wooden balls roll, everything else slides
  this.rolls = this.hitbox.type === "circle";
  this.angle = 0;
  this.spin = 0;

  this.imgName = (s) => `${this.id}Img${s}`;
  this.imgFile = (s) => `${this.path}/damage_${s}.png`;

  this.create = () => {
    entities.push(this);

    const n = this.id;

    ggbApplet.evalCommand(`${n}C = (${this.center.x}, ${this.center.y})`);
    createImageCorners(`${n}C`, `${n}L`, `${n}R`, this.width / 2, this.height / 2, this.rolls && `${n}Ang`);

    for (let s = 0; s <= BLOCK_MAX_IMAGE_STATE; s++) {
      queueXML(`
            <element type="image" label="${this.imgName(s)}">
                <file name="${this.imgFile(s)}"/>
                <show object="${s === this.state}" label="false"/>
                <layer val="5"/>
                <startPoint number="0" exp="${n}L"/>
                <startPoint number="1" exp="${n}R"/>
            </element>`);
    }

    modify(`${n}C`, { visible: debugging });
    modify(`${n}L`, { visible: debugging });
    modify(`${n}R`, { visible: debugging });
  };

  makeDamageable(this, this.id, BLOCK_MAX_IMAGE_STATE, "block");
}
