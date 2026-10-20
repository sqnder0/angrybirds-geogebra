(() => {
  // src/config.js
  var debugging = true;
  var g = 9.81;
  var speed = 7.5 * Math.sqrt(g);
  var RESTITUTION = 0.5;
  var DAMAGE_PER_SPEED = 0.5;
  var REST_SPEED = 2;
  var MAX_IMAGE_STATE = 3;
  var DESPAWN_STATE = 4;

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

  // src/physics.js
  function stepMovement(e, dt, now) {
    const halfH = (e.height ?? e.width) / 2;
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
        e.movement.y = -e.movement.y * RESTITUTION;
        e.movement.x = e.movement.x * RESTITUTION * (3 / 4);
      } else {
        e.movement.x = 0;
        e.movement.y = 0;
        e.falling = false;
      }
    }
  }
  function collideWithBlock(e, b) {
    if (b.state === DESPAWN_STATE) return 0;
    const eh = (e.height ?? e.width) / 2;
    const ew = e.width / 2;
    const dx = e.center.x - b.center.x;
    const dy = e.center.y - b.center.y;
    const overlapX = ew + b.width / 2 - Math.abs(dx);
    const overlapY = eh + b.height / 2 - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) return 0;
    const impactSpeed = Math.hypot(e.movement.x, e.movement.y);
    if (overlapX < overlapY) {
      const dir = Math.sign(dx) || 1;
      const hitSpeedX = e.movement.x;
      e.center.x += dir * overlapX;
      if (e.movement.x * dir < 0) e.movement.x = -e.movement.x * RESTITUTION;
      if (!b.isStatic) {
        b.movement.x += hitSpeedX * 0.5;
        b.falling = true;
      }
    } else {
      const dir = Math.sign(dy) || 1;
      e.center.y += dir * overlapY;
      if (e.movement.y * dir < 0) {
        e.movement.y = impactSpeed < REST_SPEED ? 0 : -e.movement.y * RESTITUTION;
      }
      if (dir > 0 && Math.abs(e.movement.y) < REST_SPEED) {
        e.movement.y = 0;
        e.center.y = b.center.y + b.height / 2 + eh;
      }
    }
    return Math.round(impactSpeed * DAMAGE_PER_SPEED);
  }

  // src/entities.js
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
      ggbApplet.evalCommand(`joystick = Circle(${this.centerPoint}, ${this.radius})`);
      modify("joystick", { color: [0, 0, 0], labelVisible: false });
      ggbApplet.evalCommand(`Thumb = ${this.centerPoint}`);
      modify("Thumb", { color: [0, 0, 0], labelVisible: false });
      ggbApplet.evalCommand(`Thumb' = ${this.centerPoint} + (Min[1, ${radius} / Distance[${this.centerPoint}, Thumb]] * (Thumb - ${this.centerPoint}))`);
      modify("Thumb'", { labelVisible: false, visible: false });
      ggbApplet.evalCommand(`Vpull = (${this.center.x} - x(Thumb'))/${this.radius}`);
      ggbApplet.evalCommand(`Hpull = (${this.center.y} - y(Thumb'))/${this.radius}`);
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
    this.create = () => {
      entities.push(this);
      const n = this.name;
      ggbApplet.evalCommand(`${n}Center = (${this.center.x}, ${this.center.y})`);
      ggbApplet.evalCommand(`${n}Left = (x(${n}Center) - ${this.width}/2, y(${n}Center) - ${this.width}/2)`);
      ggbApplet.evalCommand(`${n}Right = (x(${n}Center) + ${this.width}/2, y(${n}Center) - ${this.width}/2)`);
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
    };
  }
  function Trajectory() {
    this.lineStyle = 3;
    this.lineThickness = 10;
    this.opacity = 20;
    this.visible = true;
    this.color = [0, 0, 0];
    this.setup = () => {
      tryTo("Graph setup: t(x)", () => {
        ggbApplet.evalCommand(`t(x) = x / ((v * Vpull))`);
        modify("t", { visible: false });
      });
      ggbApplet.evalXML(`
        <element type="function" label="f">
            <lineStyle thickness="${this.lineThickness}" type="${this.lineStyle}" typeHidden="1" opacity="${this.opacity}"/>
        </element>`);
      tryTo("Graph setup: f(x)", () => {
        ggbApplet.evalCommand(
          `f(x) = If(Vpull > 0 && x >= 2 && 4 + ((v * Hpull) * t(x)) - ((0.5 * g) * (t(x))^(2)) >= 4, 4 + ((v * Hpull) * t(x)) - ((0.5 * g) * (t(x))^(2)))`
        );
        this.update();
      });
    };
    this.update = () => {
      ggbApplet.setLineStyle("f", this.lineStyle);
      ggbApplet.setLineThickness("f", this.lineThickness);
      modify("f", { color: this.color, visible: this.visible, labelVisible: false });
    };
  }
  function Block(path, center, hitbox, id, width = 2, height = 2, health = 20, isStatic = true) {
    this.id = capitalize(id);
    this.path = path;
    this.center = center;
    this.hitbox = hitbox;
    this.width = width;
    this.height = height;
    this.originalHp = health;
    this.hp = health;
    this.state = 0;
    this.isStatic = isStatic;
    this.movement = { x: 0, y: 0 };
    this.falling = !isStatic;
    this.imgName = (s) => `${this.id}Img${s}`;
    this.imgFile = (s) => `${this.path}/damage_${s}.png`;
    this.create = () => {
      entities.push(this);
      const n = this.id;
      ggbApplet.evalCommand(`${n}C = (${this.center.x}, ${this.center.y})`);
      ggbApplet.evalCommand(`${n}L = (x(${n}C) - ${this.width}/2, y(${n}C) - ${this.height}/2)`);
      ggbApplet.evalCommand(`${n}R = (x(${n}C) + ${this.width}/2, y(${n}C) - ${this.height}/2)`);
      for (let s = 0; s <= MAX_IMAGE_STATE; s++) {
        ggbApplet.evalXML(`
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
    this.calcState = () => {
      if (this.hp <= 0) return DESPAWN_STATE;
      const damaged = 1 - this.hp / this.originalHp;
      return Math.min(MAX_IMAGE_STATE, Math.floor(damaged * (MAX_IMAGE_STATE + 1)));
    };
    this.draw = () => {
      ggbApplet.setCoords(`${this.id}C`, this.center.x, this.center.y);
      const newState = this.calcState();
      if (newState === this.state) return;
      if (newState === DESPAWN_STATE) {
        this.despawn();
      } else {
        ggbApplet.setVisible(this.imgName(this.state), false);
        ggbApplet.setVisible(this.imgName(newState), true);
      }
      this.state = newState;
    };
    this.despawn = () => {
      const n = this.id;
      for (let s = 0; s <= MAX_IMAGE_STATE; s++) {
        if (ggbApplet.exists(this.imgName(s))) ggbApplet.deleteObject(this.imgName(s));
      }
      [`${n}L`, `${n}R`, `${n}C`].forEach((o) => {
        if (ggbApplet.exists(o)) ggbApplet.deleteObject(o);
      });
    };
    this.damage = (amount) => {
      this.hp = Math.max(0, this.hp - amount);
      this.draw();
    };
  }

  // src/main.js
  var trajectory = new Trajectory();
  var joystick = new JoyStick(3, -5, 5);
  var bird = new Bird("birdy", "assets/angry-bird.png", 2, 0, 4);
  function ggbOnInit() {
    setupElements();
    const b = new Block("assets/blocks/wood/square", { x: 51, y: 1 }, null, "b1", 2, 2, 30, true);
    b.create();
    const b2 = new Block("assets/blocks/wood/square", { x: 51, y: 20 }, null, "b2", 2, 2, 30, false);
    b2.create();
    setupScene();
    if (!ggbApplet.exists("tAnim")) {
      ggbApplet.evalCommand("tAnim = Slider(0, 1, 0.0001)");
    }
    ggbApplet.setVisible("tAnim", false);
    ggbApplet.setAnimating("tAnim", false);
    ggbApplet.registerObjectUpdateListener("tAnim", onTick);
    ggbApplet.registerObjectClickListener("launchBtn", onLaunch);
    ggbApplet.setValue("tAnim", 0);
    ggbApplet.setAnimationSpeed("tAnim", 2);
    ggbApplet.setAnimating("tAnim", true);
    ggbApplet.startAnimation();
  }
  function setupElements() {
    tryTo("Joystick setup", function() {
      joystick.draw();
    });
    tryTo("bird setup", function() {
      bird.create();
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
  function setupScene() {
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
      ggbApplet.setCoordSystem(-12, 65, -6, 34);
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
        ggbApplet.setLabelVisible(names[i], false);
      }
    });
  }
  function onLaunch() {
    var vPull = joystick.verticalPull();
    var hPull = joystick.horizontalPull();
    bird.center.x = 0;
    bird.center.y = 4;
    bird.movement.x = speed * vPull;
    bird.movement.y = speed * hPull;
    bird.falling = true;
    trajectory.visible = false;
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
    if (dt === 0) return;
    dt = Math.min(dt, 1 / 30);
    for (const e of entities) {
      if (e.isStatic) continue;
      if (!e.falling && e.movement.x === 0 && e.movement.y === 0) continue;
      stepMovement(e, dt, now);
      for (const other of entities) {
        if (other === e) continue;
        const damage = collideWithBlock(e, other);
        if (damage > 0 && other.damage) other.damage(damage);
      }
      e.draw();
    }
  }
  globalThis.ggbOnInit = ggbOnInit;
  globalThis.onLaunch = onLaunch;
  globalThis.onTick = onTick;
})();
