(() => {
  // src/config.js
  var debugging = false;
  var g = 9.81;
  var speed = 7.5 * Math.sqrt(g);
  var MIN_SUPPORT_NORMAL_Y = 0.7;
  var RESTITUTION = 0.5;
  var RESTITUTION_Y = RESTITUTION;
  var RESTITUTION_X = RESTITUTION * (3 / 4);
  var DAMAGE_PER_SPEED = 0.5;
  var REST_SPEED = 2;
  var BLOCK_MAX_IMAGE_STATE = 3;
  var PIG_MAX_IMAGE_STATE = 2;
  var MIN_PUSH_DOWN_NORMAL_Y = 0.9;
  var ROLL_FRICTION = 3;
  var ROLL_STOP_SPEED = 0.2;
  var HIT_POINTS = { block: 10, pig: 50 };
  var DESTROY_POINTS = { block: 100, pig: 1e3 };

  // src/state.js
  var entities = [];

  // src/util.js
  function tryTo(label, fn) {
    try {
      fn();
    } catch (e) {
      console.log("Step failed:", label, String(e));
    }
  }
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  function modify(label, { color, labelVisible, visible } = {}) {
    if (!ggbApplet.exists(label)) {
      console.log("Item for", label, "doesn't exist yet.");
      return 1;
    }
    if (color !== void 0) {
      tryTo("Set color for " + label, function() {
        ggbApplet.setColor(label, color[0], color[1], color[2]);
      });
    }
    if (labelVisible !== void 0) {
      tryTo("Set label visibility for " + label, function() {
        ggbApplet.setLabelVisible(label, labelVisible);
      });
    }
    if (visible !== void 0) {
      tryTo("Set visibility for " + label, function() {
        ggbApplet.setVisible(label, visible);
      });
    }
  }
  var pendingXML = "";
  function queueXML(xml) {
    pendingXML += xml;
  }
  function flushXML() {
    if (!pendingXML) return;
    const xml = pendingXML;
    pendingXML = "";
    ggbApplet.evalXML(xml);
  }

  // src/physics.js
  function rollFriction(e, dt) {
    const slow = ROLL_FRICTION * dt;
    e.movement.x = Math.abs(e.movement.x) <= slow ? 0 : e.movement.x - Math.sign(e.movement.x) * slow;
  }
  function stepMovement(e, dt, now) {
    const halfH = e.hitbox.halfHeight();
    if (e.rolls && e.grounded) rollFriction(e, dt);
    e.supportedBy = null;
    e.grounded = false;
    if (e.falling) {
      e.center.y += e.movement.y * dt - 0.5 * g * dt * dt;
      e.movement.y -= g * dt;
    } else {
      e.center.y += e.movement.y * dt;
    }
    e.center.x += e.movement.x * dt;
    if (e.falling && e.center.y - halfH <= 0) {
      e.center.y = halfH;
      if (Math.abs(e.movement.y) > REST_SPEED) {
        e.movement.y = -e.movement.y * RESTITUTION_Y;
        e.movement.x = e.movement.x * RESTITUTION_X;
      } else if (e.rolls && Math.abs(e.movement.x) > ROLL_STOP_SPEED) {
        e.movement.y = 0;
        e.grounded = true;
        e.spin = -e.movement.x / e.hitbox.radius;
      } else {
        e.movement.x = 0;
        e.movement.y = 0;
        e.falling = false;
        e.spin = 0;
      }
    }
    if (e.rolls) e.angle += e.spin * dt;
    e.hitbox.moveTo(e.center);
  }
  function keepAboveGround(e) {
    const halfH = e.hitbox.halfHeight();
    if (e.center.y - halfH < 0) e.center.y = halfH;
  }
  function isSupported(e) {
    for (let i = 0; e && i < 16; i++, e = e.supportedBy) {
      if (e.despawned) return false;
      if (e.isStatic || !e.falling) return true;
    }
    return false;
  }
  function inverseMass(other, normal) {
    if (other.isStatic) return 0;
    if (normal.y > MIN_PUSH_DOWN_NORMAL_Y && isSupported(other)) return 0;
    return 1 / other.mass;
  }
  function resolveCollision(e, other) {
    if (e.despawned || other.despawned) return;
    e.hitbox.moveTo(e.center);
    other.hitbox.moveTo(other.center);
    const hit = e.hitbox.collide(other.hitbox);
    if (!hit) return;
    const n = hit.normal;
    const invE = 1 / e.mass;
    const invO = inverseMass(other, n);
    const invSum = invE + invO;
    if (n.y > MIN_SUPPORT_NORMAL_Y && invO === 0) e.supportedBy = other;
    e.center.x += n.x * hit.depth * invE / invSum;
    e.center.y += n.y * hit.depth * invE / invSum;
    other.center.x -= n.x * hit.depth * invO / invSum;
    other.center.y -= n.y * hit.depth * invO / invSum;
    keepAboveGround(e);
    keepAboveGround(other);
    e.hitbox.moveTo(e.center);
    other.hitbox.moveTo(other.center);
    if (invO > 0) other.falling = true;
    const relX = e.movement.x - other.movement.x;
    const relY = e.movement.y - other.movement.y;
    const vn = relX * n.x + relY * n.y;
    if (vn >= 0) return;
    const tx = relX - vn * n.x;
    const ty = relY - vn * n.y;
    const impactSpeed = -vn;
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const rx = (e.restitution.x + other.restitution.x) / 2;
    const ry = (e.restitution.y + other.restitution.y) / 2;
    const resting = impactSpeed < REST_SPEED && ay > MIN_SUPPORT_NORMAL_Y;
    const normalRestitution = resting ? 0 : ax * rx + ay * ry;
    const tangentRestitution = e.rolls ? 1 : resting ? 0 : ax + ay * rx;
    const jn = -(1 + normalRestitution) * vn / invSum;
    const jx = jn * n.x - (1 - tangentRestitution) * tx / invSum;
    const jy = jn * n.y - (1 - tangentRestitution) * ty / invSum;
    e.movement.x += jx * invE;
    e.movement.y += jy * invE;
    other.movement.x -= jx * invO;
    other.movement.y -= jy * invO;
    if (e.rolls && n.y > 0) {
      e.spin = -(e.movement.x * n.y - e.movement.y * n.x) / e.hitbox.radius;
      if (n.y > MIN_SUPPORT_NORMAL_Y) e.grounded = true;
    }
    const damage = Math.round(impactSpeed * DAMAGE_PER_SPEED);
    if (damage > 0) {
      e.damage?.(damage);
      other.damage?.(damage);
    }
  }

  // src/score.js
  function endTextXML(visible, x, y) {
    return `
    <element type="text" label="endText">
        <show object="${visible}" label="false"/>
        <objColor r="40" g="30" b="10" alpha="0"/>
        <bgColor r="255" g="240" b="200" alpha="255"/>
        <layer val="9"/>
        <fixed val="true"/>
        <font serif="false" sizeM="4" size="0" style="1"/>
        <absoluteScreenLocation x="${x}" y="${y}"/>
    </element>`;
  }
  var score = {
    points: 0,
    create(goal) {
      ggbApplet.evalCommand("score = 0");
      ggbApplet.evalCommand(`scoreGoal = ${goal}`);
      ggbApplet.evalCommand("stars = If(score >= scoreGoal, 3, If(3 score >= 2 scoreGoal, 2, If(3 score >= scoreGoal, 1, 0)))");
      ggbApplet.evalCommand('starText = If(stars == 3, "\u2605\u2605\u2605", If(stars == 2, "\u2605\u2605\u2606", If(stars == 1, "\u2605\u2606\u2606", "\u2606\u2606\u2606")))');
      ["score", "scoreGoal", "stars", "starText"].forEach((o) => ggbApplet.setVisible(o, false));
      ggbApplet.evalCommand('scoreText = "Score: " + score + "   " + starText');
      ggbApplet.evalXML(`
    <element type="text" label="scoreText">
        <show object="true" label="false"/>
        <objColor r="40" g="30" b="10" alpha="0"/>
        <layer val="9"/>
        <fixed val="true"/>
        <font serif="false" sizeM="2" size="0" style="1"/>
        <absoluteScreenLocation x="20" y="40"/>
    </element>`);
      ggbApplet.evalCommand(
        'endText = "Level over!" + UnicodeToLetter(10) + starText + UnicodeToLetter(10) + "Score: " + score + " / " + scoreGoal'
      );
      ggbApplet.evalXML(endTextXML(false, 40, 120));
    },
    // Something got hit, kind is "block" or "pig"
    hit(kind, destroyed) {
      this.points += HIT_POINTS[kind] + (destroyed ? DESTROY_POINTS[kind] : 0);
      ggbApplet.setValue("score", this.points);
    },
    showResult() {
      const view = JSON.parse(ggbApplet.getViewProperties());
      const x = Math.max(20, Math.round(view.width / 2 - 290));
      const y = Math.max(60, Math.round(view.height / 2 - 145));
      ggbApplet.evalXML(endTextXML(true, x, y));
    }
  };

  // src/entities.js
  function contact(nx, ny, depth) {
    return { normal: { x: nx, y: ny }, depth };
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
      centroid(vb)
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
      centroid(vp)
    );
  }
  var HitBox = class {
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
  };
  var Circle = class extends HitBox {
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
  };
  var Rectangle = class extends HitBox {
    constructor(center, width, height) {
      super(center);
      this.type = "rectangle";
      this.width = width;
      this.height = height;
    }
    contains(point) {
      return Math.abs(point.x - this.center.x) <= this.width / 2 && Math.abs(point.y - this.center.y) <= this.height / 2;
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
        { x: x - halfW, y: y + halfH }
      ];
    }
    halfHeight() {
      return this.height / 2;
    }
    area() {
      return this.width * this.height;
    }
  };
  var Triangle = class extends HitBox {
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
      return [
        { x: x - halfW, y: y - halfH },
        { x: x + halfW, y: y - halfH },
        { x: cornerX, y: y + halfH }
      ];
    }
    contains(point) {
      const v = this.vertices();
      return edgeNormals(v).every(
        (n, i) => (point.x - v[i].x) * n.x + (point.y - v[i].y) * n.y <= 0
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
      return this.width * this.height / 2;
    }
  };
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
  function JoyStick(radius, x, y) {
    this.radius = radius;
    this.center = { x, y };
    this.centerPoint = `(${this.center.x}, ${this.center.y})`;
    this.draw = function() {
      if (ggbApplet.exists("joystick")) {
        console.log("Joystick already exists");
        ggbApplet.deleteObject("joystick");
        ggbApplet.deleteObject("thumb");
      }
      ggbApplet.evalCommand(
        `joystick = Circle(${this.centerPoint}, ${this.radius})`
      );
      modify("joystick", { color: [0, 0, 0], labelVisible: false });
      ggbApplet.evalCommand(`Thumb = ${this.centerPoint}`);
      modify("Thumb", { color: [0, 0, 0], labelVisible: false });
      ggbApplet.evalCommand(
        `Thumb' = ${this.centerPoint} + (Min[1, ${radius} / Distance[${this.centerPoint}, Thumb]] * (Thumb - ${this.centerPoint}))`
      );
      modify("Thumb'", { labelVisible: false, visible: false });
      ggbApplet.evalCommand(
        `Vpull = (${this.center.x} - x(Thumb'))/${this.radius}`
      );
      ggbApplet.evalCommand(
        `Hpull = (${this.center.y} - y(Thumb'))/${this.radius}`
      );
    };
    this.verticalPull = function() {
      return (this.center.x - ggbApplet.getXcoord("Thumb'")) / this.radius;
    };
    this.horizontalPull = function() {
      return (this.center.y - ggbApplet.getYcoord("Thumb'")) / this.radius;
    };
  }
  function Bird(name, image, width, x, y) {
    this.image = image;
    this.height = width;
    this.width = width;
    this.center = { x, y };
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
  function Pig(name, image, width, height, health, center, falling, maxImageState = PIG_MAX_IMAGE_STATE) {
    this.image = image;
    this.height = height;
    this.width = width;
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
  function Trajectory() {
    this.lineStyle = 3;
    this.lineThickness = 10;
    this.opacity = 20;
    this.visible = true;
    this.color = [0, 0, 0];
    this.setup = () => {
      tryTo("Graph setup: t(x)", () => {
        ggbApplet.evalCommand(`t(x) = (x - LaunchX) / ((v * Vpull))`);
        modify("t", { visible: false });
      });
      ggbApplet.evalXML(`
        <element type="function" label="f">
            <lineStyle thickness="${this.lineThickness}" type="${this.lineStyle}" typeHidden="1" opacity="${this.opacity}"/>
        </element>`);
      tryTo("Graph setup: f(x)", () => {
        ggbApplet.evalCommand(
          `f(x) = If(Vpull > 0 && x >= LaunchX + 2 && LaunchY + ((v * Hpull) * t(x)) - ((0.5 * g) * (t(x))^(2)) >= LaunchY, LaunchY + ((v * Hpull) * t(x)) - ((0.5 * g) * (t(x))^(2)))`
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
        labelVisible: false
      });
    };
  }
  function Block(path, center, hitbox, id, width = 2, height = 2, health = 20, isStatic = true) {
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

  // geogebra/assets/levels/level1.json
  var level1_default = {
    name: "Level 1",
    goal: 1400,
    blocks: [
      { id: "b1", type: "wood/square", center: { x: 51, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "b2", type: "wood/square", center: { x: 51, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "b3", type: "wood/square", center: { x: 53, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "b4", type: "wood/square", center: { x: 53, y: 3 }, width: 2, height: 2, health: 30, static: false }
    ],
    pigs: [
      { name: "king", type: "king", center: { x: 52, y: 10 }, width: 3, height: 3.66, health: 100, falling: true }
    ]
  };

  // geogebra/assets/levels/level2.json
  var level2_default = {
    name: "Level 2 - Pig parade",
    goal: 14700,
    blocks: [
      { id: "tSmalla", type: "wood/square", center: { x: 16, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tSmallb", type: "wood/square", center: { x: 18, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tMediuma", type: "wood/square", center: { x: 22, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tMediumb", type: "wood/square", center: { x: 24, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tMediumc", type: "wood/square", center: { x: 22, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "tMediumd", type: "wood/square", center: { x: 24, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "tLargea", type: "wood/square", center: { x: 28, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tLargeb", type: "wood/square", center: { x: 30, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tLargec", type: "wood/square", center: { x: 32, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tLarged", type: "wood/square", center: { x: 29, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "tLargee", type: "wood/square", center: { x: 31, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "tHelmeta", type: "wood/square", center: { x: 36, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tHelmetb", type: "wood/square", center: { x: 38, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tHelmetc", type: "wood/square", center: { x: 36, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "tHelmetd", type: "wood/square", center: { x: 38, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "tHelmete", type: "wood/square", center: { x: 36, y: 5 }, width: 2, height: 2, health: 30, static: false },
      { id: "tHelmetf", type: "wood/square", center: { x: 38, y: 5 }, width: 2, height: 2, health: 30, static: false },
      { id: "tMustachea", type: "wood/square", center: { x: 42, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tMustacheb", type: "wood/square", center: { x: 44, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tMustachec", type: "wood/square", center: { x: 46, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tMustached", type: "wood/square", center: { x: 42, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "tKinga", type: "wood/square", center: { x: 51, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tKingb", type: "wood/square", center: { x: 53, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tKingc", type: "wood/square", center: { x: 55, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "tKingd", type: "wood/square", center: { x: 52, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "tKinge", type: "wood/square", center: { x: 54, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "tKingf", type: "wood/square", center: { x: 53, y: 5 }, width: 2, height: 2, health: 30, static: false }
    ],
    pigs: [
      { name: "pigSmallPre", type: "small", center: { x: 16, y: 2.51 }, width: 1, height: 1, health: 20, falling: true },
      { name: "pigSmallPost", type: "small", center: { x: 18, y: 2.51 }, width: 1, height: 1, health: 20, falling: true },
      { name: "pigMediumPre", type: "medium", center: { x: 22, y: 4.71 }, width: 1.4, height: 1.4, health: 40, falling: true },
      { name: "pigMediumPost", type: "medium", center: { x: 24, y: 4.71 }, width: 1.4, height: 1.4, health: 40, falling: true },
      { name: "pigLargePre", type: "large", center: { x: 29, y: 4.91 }, width: 1.8, height: 1.8, health: 60, falling: true },
      { name: "pigLargePost", type: "large", center: { x: 31, y: 4.91 }, width: 1.8, height: 1.8, health: 60, falling: true },
      { name: "pigHelmetPre", type: "helmet", center: { x: 36, y: 6.84 }, width: 1.8, height: 1.67, health: 90, falling: true },
      { name: "pigHelmetPost", type: "helmet", center: { x: 38, y: 6.84 }, width: 1.8, height: 1.67, health: 90, falling: true },
      { name: "pigMustachePre", type: "mustache", center: { x: 44, y: 2.85 }, width: 1.9, height: 1.69, health: 80, falling: true },
      { name: "pigMustachePost", type: "mustache", center: { x: 46, y: 2.85 }, width: 1.9, height: 1.69, health: 80, falling: true },
      { name: "pigKingPre", type: "king", center: { x: 53, y: 7.21 }, width: 2.4, height: 2.93, health: 120, falling: true },
      { name: "pigKingPost", type: "king", center: { x: 57.6, y: 1.21 }, width: 2.4, height: 2.93, health: 120, falling: true }
    ]
  };

  // geogebra/assets/levels/level3.json
  var level3_default = {
    name: "Level 3 - Timber fortress",
    goal: 7500,
    birds: 4,
    blocks: [
      { id: "hutA", type: "wood/square", center: { x: 18, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "hutB", type: "wood/square", center: { x: 22, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "hutRoof", type: "wood/plank-long", center: { x: 20, y: 2.27 }, width: 5, height: 0.54, health: 20, static: false },
      { id: "towA0", type: "wood/square", center: { x: 28, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "towB0", type: "wood/square", center: { x: 28, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "towA1", type: "wood/square", center: { x: 32, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "towB1", type: "wood/square", center: { x: 32, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "towRoof", type: "wood/plank-long", center: { x: 30, y: 4.27 }, width: 5, height: 0.54, health: 20, static: false },
      { id: "towTriL", type: "wood/triangle-flipped", center: { x: 28, y: 5.5 }, width: 1.9, height: 1.92, health: 25, static: false },
      { id: "towTriR", type: "wood/triangle", center: { x: 32, y: 5.5 }, width: 1.9, height: 1.92, health: 25, static: false },
      { id: "pyrA0", type: "wood/square", center: { x: 38, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "pyrA1", type: "wood/square", center: { x: 40, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "pyrA2", type: "wood/square", center: { x: 42, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "pyrA3", type: "wood/square", center: { x: 44, y: 1 }, width: 2, height: 2, health: 30, static: false },
      { id: "pyrB0", type: "wood/square", center: { x: 39, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "pyrB1", type: "wood/square", center: { x: 41, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "pyrB2", type: "wood/square", center: { x: 43, y: 3 }, width: 2, height: 2, health: 30, static: false },
      { id: "pyrC0", type: "wood/square", center: { x: 40, y: 5 }, width: 2, height: 2, health: 30, static: false },
      { id: "pyrC1", type: "wood/square", center: { x: 42, y: 5 }, width: 2, height: 2, health: 30, static: false },
      { id: "pyrTop", type: "wood/plank-medium", center: { x: 41, y: 6.25 }, width: 4, height: 0.5, health: 18, static: false },
      { id: "log", type: "wood/circle", center: { x: 47, y: 0.9 }, width: 1.81, height: 1.79, health: 30, static: false },
      { id: "bunA0", type: "wood/box", center: { x: 50, y: 0.51 }, width: 2, height: 1.02, health: 25, static: false },
      { id: "bunB0", type: "wood/box", center: { x: 50, y: 1.53 }, width: 2, height: 1.02, health: 25, static: false },
      { id: "bunA1", type: "wood/box", center: { x: 54, y: 0.51 }, width: 2, height: 1.02, health: 25, static: false },
      { id: "bunB1", type: "wood/box", center: { x: 54, y: 1.53 }, width: 2, height: 1.02, health: 25, static: false },
      { id: "bunRoof", type: "wood/plank-long", center: { x: 52, y: 2.31 }, width: 5, height: 0.54, health: 20, static: false },
      { id: "bunLogL", type: "wood/circle-small", center: { x: 49.9, y: 3.08 }, width: 0.95, height: 1, health: 12, static: false },
      { id: "bunLogR", type: "wood/circle-small", center: { x: 54.1, y: 3.08 }, width: 0.95, height: 1, health: 12, static: false }
    ],
    pigs: [
      { name: "pigHutIn", type: "small", center: { x: 20, y: 0.55 }, width: 1.07, height: 1.07, health: 8, falling: true },
      { name: "pigHutTop", type: "medium", center: { x: 20, y: 3.42 }, width: 1.74, height: 1.74, health: 12, falling: true },
      { name: "pigTowIn", type: "medium", center: { x: 30, y: 0.88 }, width: 1.74, height: 1.74, health: 12, falling: true },
      { name: "pigTowTop", type: "helmet", center: { x: 30, y: 5.48 }, width: 2, height: 1.86, health: 25, falling: true },
      { name: "pigGuard", type: "mustache", center: { x: 35, y: 1.08 }, width: 2.4, height: 2.14, health: 22, falling: true },
      { name: "pigKing", type: "king", center: { x: 41, y: 7.85 }, width: 2.69, height: 3.29, health: 30, falling: true },
      { name: "pigBunIn", type: "small", center: { x: 52, y: 0.55 }, width: 1.07, height: 1.07, health: 8, falling: true },
      { name: "pigBunTop", type: "large", center: { x: 52, y: 3.65 }, width: 2.12, height: 2.12, health: 18, falling: true }
    ]
  };

  // src/level.js
  var levels = { level1: level1_default, level2: level2_default, level3: level3_default };
  function blockHitbox(b) {
    const shape = b.type.split("/").pop();
    if (shape.startsWith("circle")) return new Circle(b.center, b.width / 2);
    if (shape === "triangle") return new Triangle(b.center, b.width, b.height, "left");
    if (shape === "triangle-flipped") return new Triangle(b.center, b.width, b.height, "right");
    if (shape === "triangle-frame") return new Triangle(b.center, b.width, b.height, "center");
    return null;
  }
  function levelGoal(level) {
    if (level.goal) return level.goal;
    return (level.blocks ?? []).length * DESTROY_POINTS.block + (level.pigs ?? []).length * DESTROY_POINTS.pig;
  }
  function loadLevel(level) {
    for (const b of level.blocks ?? []) {
      tryTo(`Level block ${b.id}`, () => {
        new Block(`assets/blocks/${b.type}`, { ...b.center }, blockHitbox(b), b.id, b.width, b.height, b.health, b.static).create();
      });
    }
    for (const p of level.pigs ?? []) {
      tryTo(`Level pig ${p.name}`, () => {
        new Pig(p.name, `assets/pigs/${p.type}`, p.width, p.height, p.health, { ...p.center }, p.falling, p.maxImageState).create();
      });
    }
    tryTo("Level images", flushXML);
  }

  // src/slingshot.js
  var IMAGE_RATIO = 167 / 510;
  var BAND_FRONT = { x: 0.2, y: 0.16 };
  var BAND_BACK = { x: 0.84, y: 0.19 };
  function Slingshot(image, x, height, rest, pullDistance) {
    this.image = image;
    this.x = x;
    this.height = height;
    this.width = height * IMAGE_RATIO;
    this.rest = { ...rest };
    this.pullDistance = pullDistance;
    const band = (spot) => ({
      x: this.x - this.width / 2 + spot.x * this.width,
      y: this.height * (1 - spot.y)
    });
    this.create = () => {
      const { x: rx, y: ry } = this.rest;
      const pull = this.pullDistance;
      ggbApplet.evalCommand("slingLoaded = true");
      ggbApplet.evalCommand(`LaunchX = ${rx} - ${pull} * Vpull`);
      ggbApplet.evalCommand(`LaunchY = ${ry} - ${pull} * Hpull`);
      ggbApplet.evalCommand(`Pouch = If(slingLoaded, (LaunchX, LaunchY), (${rx}, ${ry}))`);
      ggbApplet.evalCommand(`SlingL = (${this.x - this.width / 2}, 0)`);
      ggbApplet.evalCommand(`SlingR = (${this.x + this.width / 2}, 0)`);
      ggbApplet.evalXML(`
    <element type="image" label="SlingImg">
        <file name="${this.image}"/>
        <show object="true" label="false"/>
        <layer val="3"/>
        <startPoint number="0" exp="SlingL"/>
        <startPoint number="1" exp="SlingR"/>
    </element>`);
      const back = band(BAND_BACK);
      const front = band(BAND_FRONT);
      ggbApplet.evalCommand(`SlingBandBack = (${back.x}, ${back.y})`);
      ggbApplet.evalCommand(`SlingBandFront = (${front.x}, ${front.y})`);
      ggbApplet.evalCommand("ropeBack = Segment(SlingBandBack, Pouch)");
      ggbApplet.evalCommand("ropeFront = Segment(SlingBandFront, Pouch)");
      for (const [rope, layer] of [["ropeBack", 4], ["ropeFront", 6]]) {
        ggbApplet.setLineThickness(rope, 9);
        ggbApplet.setLayer(rope, layer);
        ggbApplet.setFixed(rope, true, false);
        modify(rope, { color: [58, 28, 10], labelVisible: false });
      }
      ["slingLoaded", "LaunchX", "LaunchY"].forEach((o) => ggbApplet.setVisible(o, false));
      ["Pouch", "SlingL", "SlingR", "SlingBandBack", "SlingBandFront"].forEach(
        (o) => modify(o, { visible: false })
      );
    };
    this.setLoaded = (loaded) => {
      ggbApplet.setValue("slingLoaded", loaded ? 1 : 0);
    };
    this.pouch = () => ({ x: ggbApplet.getXcoord("Pouch"), y: ggbApplet.getYcoord("Pouch") });
  }

  // src/queue.js
  var IDLE_HOP_PERIOD = 2.6;
  var IDLE_HOP_TIME = 0.35;
  var IDLE_HOP_HEIGHT = 0.5;
  var LOAD_TIME = 0.6;
  var LOAD_ARC = 3;
  var SHUFFLE_TIME = 0.45;
  var SHUFFLE_ARC = 0.8;
  function arc(u, height) {
    return 4 * height * u * (1 - u);
  }
  function BirdQueue(image, size, count, firstSpot, spacing) {
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
      const seconds = now / 1e3;
      for (const b of [...this.birds, this.leaving].filter(Boolean)) {
        let p;
        if (b.move && now >= b.move.start) {
          const u = Math.min(1, (now - b.move.start) / 1e3 / b.move.time);
          p = {
            x: b.move.from.x + (b.move.to.x - b.move.from.x) * u,
            y: b.move.from.y + (b.move.to.y - b.move.from.y) * u + arc(u, b.move.arc)
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

  // src/main.js
  var LEVEL = levels.level3;
  var BIRD_IMAGE = "assets/angry-bird.png";
  var BIRD_SIZE = 2;
  var SLING_REST = { x: 0, y: 4 };
  var FLIGHT_SETTLE_MS = 1e3;
  var MAX_FLIGHT_MS = 1e4;
  var trajectory = new Trajectory();
  var joystick = new JoyStick(3, -5, 5);
  var slingshot = new Slingshot("assets/slingshot.png", SLING_REST.x, 6, SLING_REST, 1.5);
  var bird = new Bird("birdy", BIRD_IMAGE, BIRD_SIZE, SLING_REST.x, SLING_REST.y);
  var queue = new BirdQueue(BIRD_IMAGE, BIRD_SIZE, (LEVEL.birds ?? 3) - 1, { x: -2.4, y: BIRD_SIZE / 2 }, 2.3);
  var birdState = "loaded";
  var flightStart = 0;
  var stoppedSince = 0;
  function ggbOnInit() {
    setupElements();
    setupScene(LEVEL);
    if (!ggbApplet.exists("tAnim")) {
      ggbApplet.evalCommand("tAnim = Slider(0, 1, 0.0001)");
    }
    ggbApplet.setVisible("tAnim", false);
    ggbApplet.setAnimating("tAnim", false);
    ggbApplet.registerObjectUpdateListener("tAnim", onTick);
    ggbApplet.registerObjectClickListener("launchBtn", onLaunch);
    ggbApplet.registerObjectUpdateListener("Pouch", onPouchMoved);
    ggbApplet.setValue("tAnim", 0);
    ggbApplet.setAnimationSpeed("tAnim", 2);
    ggbApplet.setAnimating("tAnim", true);
    ggbApplet.startAnimation();
  }
  function setupElements() {
    tryTo("Joystick setup", function() {
      joystick.draw();
    });
    tryTo("Slingshot setup", function() {
      slingshot.create();
    });
    tryTo("bird setup", function() {
      bird.create();
    });
    tryTo("Bird queue setup", function() {
      queue.create();
    });
    tryTo("Score setup", function() {
      score.create(levelGoal(LEVEL));
    });
    tryTo("Variable setup: g", function() {
      ggbApplet.evalCommand(`g = ${g}`);
    });
    tryTo("Variable setup: v", function() {
      ggbApplet.evalCommand(`v = ${speed}`);
    });
    trajectory.setup();
    tryTo("Button setup:", function() {
      ggbApplet.evalXML(`
            <element type="button" label="launchBtn">
                <show object="true" label="true"/>
                <objColor r="255" g="255" b="255" alpha="0"/>
                <bgColor r="101" g="87" b="210" alpha="255"/>
                <layer val="0"/>
                <labelOffset x="216" y="565"/>
                <labelMode val="0"/>
                <animation step="0.1" type="0" playing="false"/>
                <auxiliary val="true"/>
                <caption val="Launch!"/>
                <startPoint x="0" y="0" z="1"/>
            </element>
    `);
      ggbApplet.setCaption("launchBtn", "Launch!");
    });
  }
  function setupScene(level) {
    tryTo("level", function() {
      loadLevel(level);
    });
    tryTo("background", function() {
      ggbApplet.evalCommand("SetBackgroundColor(0.45, 0.75, 1)");
    });
    tryTo("axes", function() {
      ggbApplet.setAxesVisible(debugging, debugging);
    });
    tryTo("grid", function() {
      ggbApplet.setGridVisible(debugging);
    });
    tryTo("view", function() {
      ggbApplet.setCoordSystem(-12, 60, -6, 34);
      ggbApplet.evalCommand("SetAxesRatio(1, 1)");
    });
    tryTo("perspective", function() {
      if (!debugging) {
        ggbApplet.setPerspective("G");
      } else {
        ggbApplet.setPerspective("AG");
      }
    });
    tryTo("ground", function() {
      if (!ggbApplet.exists("ground")) {
        ggbApplet.evalCommand(
          "ground = Polygon((-1000,-1000), (1000,-1000), (1000,0), (-1000,0))"
        );
      }
      ggbApplet.setColor("ground", 76, 153, 0);
      ggbApplet.setFilling("ground", 1);
      ggbApplet.setLayer("ground", 0);
    });
    tryTo("hide C", function() {
      ggbApplet.setVisible("C", false);
    });
    tryTo("bird layer", function() {
      ggbApplet.setLayer("pic1", 5);
    });
    tryTo("labels", function() {
      var names = ggbApplet.getAllObjectNames();
      for (var i = 0; i < names.length; i++) {
        if (names[i] === "launchBtn" || names[i] === "scoreText" || names[i] === "endText") continue;
        ggbApplet.setLabelVisible(names[i], false);
      }
    });
  }
  function onLaunch() {
    if (birdState !== "loaded") return;
    var vPull = joystick.verticalPull();
    var hPull = joystick.horizontalPull();
    var pouch = slingshot.pouch();
    bird.center.x = pouch.x;
    bird.center.y = pouch.y;
    bird.movement.x = speed * vPull;
    bird.movement.y = speed * hPull;
    bird.falling = true;
    slingshot.setLoaded(false);
    birdState = "flying";
    flightStart = Date.now();
    stoppedSince = 0;
    trajectory.visible = false;
    trajectory.update();
  }
  function onPouchMoved() {
    if (birdState !== "loaded") return;
    var pouch = slingshot.pouch();
    bird.center.x = pouch.x;
    bird.center.y = pouch.y;
    bird.draw();
  }
  function updateBirdCycle(now) {
    queue.update(now);
    if (birdState !== "flying") return;
    var stopped = !bird.falling && bird.movement.x === 0 && bird.movement.y === 0;
    stoppedSince = stopped ? stoppedSince || now : 0;
    var gone = bird.center.x > 80 || bird.center.x < -20;
    var settled = stopped && now - stoppedSince > FLIGHT_SETTLE_MS;
    if (!gone && !settled && now - flightStart < MAX_FLIGHT_MS) return;
    ggbApplet.setVisible(`${bird.name}Img`, false);
    bird.movement.x = 0;
    bird.movement.y = 0;
    bird.falling = false;
    bird.angle = 0;
    bird.spin = 0;
    bird.center.x = SLING_REST.x;
    bird.center.y = SLING_REST.y;
    bird.draw();
    if (queue.next(SLING_REST, now, onBirdLoaded)) {
      birdState = "reloading";
    } else {
      birdState = "empty";
      score.showResult();
    }
  }
  function onBirdLoaded() {
    slingshot.setLoaded(true);
    birdState = "loaded";
    onPouchMoved();
    ggbApplet.setVisible(`${bird.name}Img`, true);
    trajectory.visible = true;
    trajectory.update();
  }
  var lastTick = 0;
  function onTick() {
    try {
      tickPhysics();
    } catch (err) {
      console.error("onTick failed:", err);
    }
  }
  function tickPhysics() {
    var now = Date.now();
    var dt;
    if (lastTick === 0) {
      dt = 0;
    } else {
      dt = (now - lastTick) / 1e3;
    }
    lastTick = now;
    updateBirdCycle(now);
    if (dt === 0) return;
    dt = Math.min(dt, 1 / 30);
    for (const e of entities) {
      if (e.isStatic || e.despawned) continue;
      if (!e.falling && e.movement.x === 0 && e.movement.y === 0) continue;
      stepMovement(e, dt, now);
      for (const other of entities) {
        if (other === e) continue;
        resolveCollision(e, other);
        if (e.despawned) break;
      }
      e.draw();
    }
  }
  globalThis.ggbOnInit = ggbOnInit;
  globalThis.onLaunch = onLaunch;
  globalThis.onTick = onTick;
  globalThis.onPouchMoved = onPouchMoved;
})();
