/* ===========================================================

   ANGRY BIRDS LAUNCHER
   ===========================================================

   WHY THE STRANGE STRUCTURE?
   Your GeoGebra scripts run in a sandbox where setInterval,
   setTimeout and requestAnimationFrame do not exist, so a normal
   JS loop is impossible. Instead we borrow GeoGebra's own animation
   clock:

     1. A hidden slider "tAnim" runs from 0 to 1 over the flight time.
     2. GeoGebra updates tAnim many times per second by itself.
     3. Every update calls onTick(), which moves the bird.

   So GeoGebra does the timing and our code only reacts to it.
*/

/* ---------- State shared between onLaunch() and onTick() ----------
   Plain global variables are the only way to pass data between the
   two functions, because they are called separately by GeoGebra. */
var N = 0;          // number of 0.2 s steps in the current flight (0 = no flight running)
var xEnd = 0;       // x where the bird lands, so f(xEnd) = 0
var s = 0;          // slope term b/a of the trajectory
var k = 0;          // gravity term g/(2 v^2 a^2) of the trajectory
var lastStep = -1;  // last step number we drew, to avoid redrawing between steps

var debugging = false;

var g = 9.81;
var speed = 7.5*g**(1/2) // 15 * sqrt(g)

var entities = []

/* Call stuff in tryto to not block the game when errors appear. */  
function tryTo(label, fn) {
    try { fn(); } catch (e) { console.log("Step failed:", label, String(e)); }
}

/*Capitalization of point names*/
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}


function modify(label, {color, labelVisible, visible} = {}){
    if (!ggbApplet.exists(label)) {
        console.log("Item for", label, "doesn't exist yet.");
        return 1;
    }

    if (color !== undefined) {
        tryTo("Set color for " + label, function () {
            ggbApplet.setColor(label, color[0], color[1], color[2]);
        });
    }

    if (labelVisible !== undefined) {
        tryTo("Set label visibility for " + label, function () {
            ggbApplet.setLabelVisible(label, labelVisible);
        });
    }

    if (visible !== undefined) {
        tryTo("Set visibility for " + label, function () {
            ggbApplet.setVisible(label, visible);
        });
    }

}

function JoyStick(radius, x, y) {
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

function Bird (name, image, width, x, y) {
    // Register as entity
    entities.push(this);

    this.image = image
    this.width = width
    this.center = { x: x, y: y };
    this.left = { x: x - width/2, y: y-width/2 };
    this.right = { x: x + width/2, y: y-width/2};
    this.movement = {x: 0, y: 0};
    this.name = capitalize(name);
    this.falling = false;
    this.lastMove;

    this.create = () => {
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

function Trajectory(){
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

var trajectory = new Trajectory();
var joystick = new JoyStick(3, -5, 5);
var bird = new Bird("birdy", "assets/angry-bird.png", 2, 0, 4)

/* ---------- Runs once when the file opens ---------- */
function ggbOnInit() {
    
    setupElements();

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
        else { ggbApplet.setPerspective("A"); }
        
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


    for (const e of entities) {

        if (e.lastMove && now - e.lastMove >= 3000) {
            e.center.x = 0;
            e.center.y = 4;
            e.lastMove = undefined;
            
            e.draw();

            trajectory.visible = true;
            trajectory.update();
            
            continue;
        }

        if (!e.falling && e.movement.x === 0 && e.movement.y === 0) continue;


        if (e.falling) {
            e.center.y += e.movement.y * dt - 0.5 * g * dt * dt;
            e.movement.y -= g * dt;
        } else {
            e.center.y += e.movement.y * dt;
        }
        
        e.center.x += e.movement.x * dt;

        if (e.falling && e.center.y - e.width / 2 <= 0) {
            e.center.y = e.width / 2;
            e.movement.x = 0;
            e.movement.y = 0;
            e.falling = false;
            e.lastMove = now;
        }

        e.draw();

    }
}