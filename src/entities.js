import { debugging, MAX_IMAGE_STATE, DESPAWN_STATE } from "./config.js";
import { entities } from "./state.js";
import { capitalize, modify, tryTo } from "./util.js";

export function JoyStick(radius, x, y) {
    this.radius = radius;
    this.center = { x: x, y: y };
    this.centerPoint = `(${this.center.x}, ${this.center.y})`

    this.draw = function () {
        if (ggbApplet.exists("joystick")) {
            console.log("Joystick already exists");
            ggbApplet.deleteObject("joystick");
            ggbApplet.deleteObject("thumb");
        }

        ggbApplet.evalCommand(`joystick = Circle(${this.centerPoint}, ${this.radius})`);
        modify("joystick", {color: [0, 0, 0], labelVisible: false});

        ggbApplet.evalCommand(`Thumb = ${this.centerPoint}`);
        modify("Thumb", {color: [0, 0, 0], labelVisible: false});

        ggbApplet.evalCommand(`Thumb' = ${this.centerPoint} + (Min[1, ${radius} / Distance[${this.centerPoint}, Thumb]] * (Thumb - ${this.centerPoint}))`);
        modify("Thumb'", {labelVisible: false, visible: false});

        ggbApplet.evalCommand(`Vpull = (${this.center.x} - x(Thumb'))/${this.radius}`);
        ggbApplet.evalCommand(`Hpull = (${this.center.y} - y(Thumb'))/${this.radius}`);

    };

    this.verticalPull = function () {
        return (this.center.x - ggbApplet.getXcoord("Thumb'")) / this.radius;
    }
    this.horizontalPull = function () {
        return (this.center.y - ggbApplet.getYcoord("Thumb'")) / this.radius;
    }
}

export function Bird (name, image, width, x, y) {
    this.image = image;
    this.height = width;
    this.width = width;
    this.center = { x: x, y: y };
    this.left = { x: x - width/2, y: y-width/2 };
    this.right = { x: x + width/2, y: y-width/2};
    this.movement = {x: 0, y: 0};
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

export function Trajectory(){
    this.lineStyle = 3;
    this.lineThickness = 10;
    this.opacity = 20;
    this.visible = true;
    this.color = [0, 0, 0];

    this.setup = () => {
        tryTo("Graph setup: t(x)", () => {
            ggbApplet.evalCommand(`t(x) = x / ((v * Vpull))`);
            modify("t", {visible: false});
        });

        ggbApplet.evalXML(`
        <element type="function" label="f">
            <lineStyle thickness="${this.lineThickness}" type="${this.lineStyle}" typeHidden="1" opacity="${this.opacity}"/>
        </element>`);

        tryTo("Graph setup: f(x)", () => {
            ggbApplet.evalCommand(
                `f(x) = If(Vpull > 0 && x >= 2 && 4 + ((v * Hpull) * t(x)) - ((0.5 * g) * (t(x))^(2)) >= 4, ` +
                `4 + ((v * Hpull) * t(x)) - ((0.5 * g) * (t(x))^(2)))`
            );

            this.update();


        });
    }

    this.update = () => {
        ggbApplet.setLineStyle("f", this.lineStyle);
        ggbApplet.setLineThickness("f", this.lineThickness);
        modify("f", {color: this.color, visible: this.visible, labelVisible: false});
    }

}

export function Block(path, center, hitbox, id, width=2, height=2, health=20, isStatic=true) {
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
