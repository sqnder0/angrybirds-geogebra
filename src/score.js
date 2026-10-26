import { HIT_POINTS, DESTROY_POINTS } from "./config.js";

// The end panel, x and y are its spot on the screen in pixels
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

// Score of the running level. The points live in the GeoGebra number "score",
// the stars and texts showing them are GeoGebra objects that follow it on their own.
// 1 star at a third of the goal, 2 at two thirds, 3 at the full goal.
export const score = {
  points: 0,

  create(goal) {
    ggbApplet.evalCommand("score = 0");
    ggbApplet.evalCommand(`scoreGoal = ${goal}`);
    ggbApplet.evalCommand("stars = If(score >= scoreGoal, 3, If(3 score >= 2 scoreGoal, 2, If(3 score >= scoreGoal, 1, 0)))");
    ggbApplet.evalCommand('starText = If(stars == 3, "★★★", If(stars == 2, "★★☆", If(stars == 1, "★☆☆", "☆☆☆")))');
    ["score", "scoreGoal", "stars", "starText"].forEach((o) => ggbApplet.setVisible(o, false));

    // Top left corner of the screen during the level
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

    // Shown once the last bird is done
    ggbApplet.evalCommand(
      'endText = "Level over!" + UnicodeToLetter(10) + starText + UnicodeToLetter(10) + "Score: " + score + " / " + scoreGoal',
    );
    ggbApplet.evalXML(endTextXML(false, 40, 120));
  },

  // Something got hit, kind is "block" or "pig"
  hit(kind, destroyed) {
    this.points += HIT_POINTS[kind] + (destroyed ? DESTROY_POINTS[kind] : 0);
    ggbApplet.setValue("score", this.points);
  },

  showResult() {
    // Roughly in the middle of the screen, the panel is about 580 x 290 pixels
    const view = JSON.parse(ggbApplet.getViewProperties());
    const x = Math.max(20, Math.round(view.width / 2 - 290));
    const y = Math.max(60, Math.round(view.height / 2 - 145));
    ggbApplet.evalXML(endTextXML(true, x, y));
  },
};
