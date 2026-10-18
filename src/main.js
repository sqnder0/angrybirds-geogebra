/* ===========================================================

   ANGRY BIRDS IN GEOGEBRA

   ===========================================================
*/

import { debugging, g, speed, DESPAWN_STATE } from "./config.js";
import { entities } from "./state.js";
import { tryTo } from "./util.js";
import { collideWithBlock, stepMovement } from "./physics.js";
import { JoyStick, Bird, Trajectory, Block } from "./entities.js";

var trajectory = new Trajectory();
var joystick = new JoyStick(3, -5, 5);
var bird = new Bird("birdy", "assets/angry-bird.png", 2, 0, 4)

/* ---------- Runs once when the file opens ---------- */
function ggbOnInit() {

    setupElements();

    // TEST
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


    // Start physics loop
    ggbApplet.setValue("tAnim", 0);
    ggbApplet.setAnimationSpeed("tAnim", 2);
    ggbApplet.setAnimating("tAnim", true);
    ggbApplet.startAnimation();
}




function setupElements() {
    tryTo("Joystick setup", function () {
        joystick.draw();
    });

    tryTo("bird setup", function () {
        bird.create();
    });

    tryTo("Variable setup: g", function () {
        ggbApplet.evalCommand(`g = ${g}`);
    });

    tryTo("Variable setup: v", function () {
        ggbApplet.evalCommand(`v = ${speed}`);
    });

    trajectory.setup();

    tryTo("Button setup:", function () {
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


/* ---------- Visual setup of the scene ---------- */
function setupScene() {
    tryTo("background", function () {
        ggbApplet.evalCommand("SetBackgroundColor(0.45, 0.75, 1)");
    });

    tryTo("axes", function () { ggbApplet.setAxesVisible(debugging, debugging); });
    tryTo("grid", function () { ggbApplet.setGridVisible(debugging); });
    tryTo("view", function () {
        ggbApplet.setCoordSystem(-12, 65, -6, 34);
        ggbApplet.evalCommand("SetAxesRatio(1, 1)");
     });

    tryTo("perspective", function () {
        if (!debugging) { ggbApplet.setPerspective("G"); }
        else { ggbApplet.setPerspective("AG"); }

    });

    tryTo("ground", function () {
        if (!ggbApplet.exists("ground")) {
            ggbApplet.evalCommand(
                "ground = Polygon((-1000,-1000), (1000,-1000), (1000,0), (-1000,0))");
        }
        ggbApplet.setColor("ground", 76, 153, 0);
        ggbApplet.setFilling("ground", 1);
        ggbApplet.setLayer("ground", 0);
    });

    tryTo("hide C", function () { ggbApplet.setVisible("C", false); });
    tryTo("bird layer", function () { ggbApplet.setLayer("pic1", 5); });

    tryTo("labels", function () {
        var names = ggbApplet.getAllObjectNames();
        for (var i = 0; i < names.length; i++) {
            ggbApplet.setLabelVisible(names[i], false);
        }
    });

};

/* ---------- Runs when the Shoot! button is clicked ---------- */
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


/* ---------- Runs on EVERY update of tAnim (many times per second) ---------- */

var lastTick = 0;

function onTick() {
    try {
        tickPhysics();
    } catch (err) {
        console.error("onTick failed:", err);
    }
}

function tickPhysics() {
    // Run some basic physics
    var now = Date.now();
    var dt;

    if (lastTick === 0) {
        dt = 0;
    } else {
        dt = (now - lastTick) / 1000;
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

// GeoGebra looks these up as globals
globalThis.ggbOnInit = ggbOnInit;
globalThis.onLaunch = onLaunch;
globalThis.onTick = onTick;
