import { debugging, g, speed } from "./config.js";
import { entities } from "./state.js";
import { tryTo } from "./util.js";
import { resolveCollision, stepMovement } from "./physics.js";
import { JoyStick, Bird, Trajectory } from "./entities.js";
import { levels, levelGoal, loadLevel } from "./level.js";
import { score } from "./score.js";
import { Slingshot } from "./slingshot.js";
import { BirdQueue } from "./queue.js";

const LEVEL = levels.level3;
const BIRD_IMAGE = "assets/angry-bird.png";
const BIRD_SIZE = 2;
const SLING_REST = { x: 0, y: 4 };

const FLIGHT_SETTLE_MS = 1000;
const MAX_FLIGHT_MS = 10000;

var trajectory = new Trajectory();
var joystick = new JoyStick(3, -5, 5);
var slingshot = new Slingshot("assets/slingshot.png", SLING_REST.x, 6, SLING_REST, 1.5);
var bird = new Bird("birdy", BIRD_IMAGE, BIRD_SIZE, SLING_REST.x, SLING_REST.y);
var queue = new BirdQueue(BIRD_IMAGE, BIRD_SIZE, (LEVEL.birds ?? 3) - 1, { x: -2.4, y: BIRD_SIZE / 2 }, 2.3);

var birdState = "loaded";
var flightStart = 0;
var stoppedSince = 0;

// Runs once when the file opens
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


    // Start the physics loop
    ggbApplet.setValue("tAnim", 0);
    ggbApplet.setAnimationSpeed("tAnim", 2);
    ggbApplet.setAnimating("tAnim", true);
    ggbApplet.startAnimation();
}




function setupElements() {
    tryTo("Joystick setup", function () {
        joystick.draw();
    });

    tryTo("Slingshot setup", function () {
        slingshot.create();
    });

    tryTo("bird setup", function () {
        bird.create();
    });

    tryTo("Bird queue setup", function () {
        queue.create();
    });

    tryTo("Score setup", function () {
        score.create(levelGoal(LEVEL));
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


// Visual setup of the scene
function setupScene(level) {
    tryTo("level", function () {
        loadLevel(level);
    });

    tryTo("background", function () {
        ggbApplet.evalCommand("SetBackgroundColor(0.45, 0.75, 1)");
    });

    tryTo("axes", function () { ggbApplet.setAxesVisible(debugging, debugging); });
    tryTo("grid", function () { ggbApplet.setGridVisible(debugging); });
    tryTo("view", function () {
        ggbApplet.setCoordSystem(-12, 60, -6, 34);
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
            if (names[i] === "launchBtn" || names[i] === "scoreText" || names[i] === "endText") continue;
            ggbApplet.setLabelVisible(names[i], false);
        }
    });

};

// Runs when the Launch! button is clicked
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

// The bird on the slingshot follows the pouch while aiming
function onPouchMoved() {
    if (birdState !== "loaded") return;
    var pouch = slingshot.pouch();
    bird.center.x = pouch.x;
    bird.center.y = pouch.y;
    bird.draw();
}

// Ends a flight and brings the next bird from the queue
function updateBirdCycle(now) {
    queue.update(now);
    if (birdState !== "flying") return;

    var stopped = !bird.falling && bird.movement.x === 0 && bird.movement.y === 0;
    stoppedSince = stopped ? (stoppedSince || now) : 0;
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

// The next bird landed on the slingshot
function onBirdLoaded() {
    slingshot.setLoaded(true);
    birdState = "loaded";
    onPouchMoved();
    ggbApplet.setVisible(`${bird.name}Img`, true);

    trajectory.visible = true;
    trajectory.update();
}


// Runs on every update of tAnim, dt is measured with Date.now() because tick length isn't fixed
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
        dt = (now - lastTick) / 1000;
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
