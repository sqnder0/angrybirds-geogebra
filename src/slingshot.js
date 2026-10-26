import { modify } from "./util.js";

// slingshot.png is 167 x 510, the rubber bands are tied at these spots (fractions of the image, from the top left)
const IMAGE_RATIO = 167 / 510;
const BAND_FRONT = { x: 0.2, y: 0.16 };
const BAND_BACK = { x: 0.84, y: 0.19 };

// Slingshot standing on the ground at x, with rubber bands from both forks to the pouch.
// While loaded the pouch is pulled back along with the joystick (Vpull, Hpull), the bands follow it on their own.
export function Slingshot(image, x, height, rest, pullDistance) {
  this.image = image;
  this.x = x;
  this.height = height;
  this.width = height * IMAGE_RATIO;
  this.rest = { ...rest };
  this.pullDistance = pullDistance;

  const band = (spot) => ({
    x: this.x - this.width / 2 + spot.x * this.width,
    y: this.height * (1 - spot.y),
  });

  // Needs Vpull and Hpull from the joystick to exist
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

    // The back band runs behind the bird (layer 5), the front band in front of it
    ggbApplet.evalCommand("ropeBack = Segment(SlingBandBack, Pouch)");
    ggbApplet.evalCommand("ropeFront = Segment(SlingBandFront, Pouch)");
    for (const [rope, layer] of [["ropeBack", 4], ["ropeFront", 6]]) {
      ggbApplet.setLineThickness(rope, 9);
      ggbApplet.setLayer(rope, layer);
      ggbApplet.setFixed(rope, true, false);
      modify(rope, { color: [58, 28, 10], labelVisible: false });
    }

    ["slingLoaded", "LaunchX", "LaunchY"].forEach((o) => ggbApplet.setVisible(o, false));
    ["Pouch", "SlingL", "SlingR", "SlingBandBack", "SlingBandFront"].forEach((o) =>
      modify(o, { visible: false }),
    );
  };

  // Loaded: the pouch follows the joystick. Not loaded: it snaps back to rest.
  this.setLoaded = (loaded) => {
    ggbApplet.setValue("slingLoaded", loaded ? 1 : 0);
  };

  this.pouch = () => ({ x: ggbApplet.getXcoord("Pouch"), y: ggbApplet.getYcoord("Pouch") });
}
