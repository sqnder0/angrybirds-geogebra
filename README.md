# Geogebra in Angrybirds
*No you didn't read that wrong I was just testing if you where awake enough to read my readme XD*

But, yes, Angry Birds. In GeoGebra. The graphing calculator. Not a game engine, not even a full html/css/js setup, just a calculator that happens to let you run some javascript. And it works (mostly).

## How to play

1. Open `angrybirds.ggb` in GeoGebra (or run `npm run serve` and open `preview.html`).
2. Drag the joystick point (the little black dot in the circle) to aim. The slingshot pouch gets pulled back with it and you'll see the trajectory preview.
3. Press **Launch!**
4. Destroy blocks, smack pigs, get stars. You get a few birds per level and they wait in line next to the slingshot doing little hops.

## Building it yourself

```bash
npm install
npm run build   # bundles src/ into geogebra/geogebra_javascript.js and zips geogebra/ into angrybirds.ggb
npm run watch   # rebundles on every save, you still need to zip
npm run serve   # local server for preview.html
```

### Wait how does that work

A `.ggb` file is just a zip. If you unzip one you get:

- `geogebra.xml`: all your variables, objects and stuff
- `geogebra_javascript.js`: the global javascript of the file

So the whole game is written in normal js modules in `src/`, esbuild smashes them into one file, and then it gets zipped back together with the assets into a `.ggb`.

The javascript GeoGebra runs is sandboxed, so no `setInterval`, no `requestAnimationFrame`, none of that. Everything gets created from js with `ggbApplet.evalCommand` and `ggbApplet.evalXML` when the file opens.

## The project

```
src/
  main.js       game loop, launching, bird cycle
  physics.js    movement, gravity, bouncing, collision response
  entities.js   hitboxes, bird, pigs, blocks, joystick, trajectory
  level.js      loads levels from json
  slingshot.js  slingshot with rubber bands
  queue.js      the birds waiting in line
  score.js      score, stars and the end screen
  config.js     all the tuning numbers
  util.js       small helpers
geogebra/
  assets/       images (birds, pigs, blocks with damage states) and levels
```

## The technical stuff

### The game loop

There is no timer in the sandbox, so the "loop" is a hidden slider `tAnim`, yes indeed a slider 😭😭😭. GeoGebra animates this and it makes those things called frames. Every time it updates, `onTick` runs. God knows how long a tick takes though, so I measure the time between ticks with `Date.now()` and use that as `dt`. It's capped at 1/30 of a second so if GeoGebra hangs for a bit things don't teleport through walls.

### Movement

Every entity has a `center` and a `movement` (velocity). Every tick:

```
y += vy * dt - ½ * g * dt²
vy -= g * dt
x += vx * dt
```

So it's just the parabola from school, but done step by step so other stuff can mess with it in between.

### Aiming

The joystick is a circle with a point (`Thumb`) in it. `Thumb'` is that point clamped to the circle, and how far it's pulled gives `Vpull` and `Hpull` (between -1 and 1). The launch speed is `speed * pull`. The trajectory preview is an actual GeoGebra function `f(x)` built from the same formula, so it updates live while you drag without any js.

### Hitboxes

There are 3 kinds: `Circle`, `Rectangle` and `Triangle` (apex left, right or center). Every collision returns a contact: a **normal** (the direction to push apart) and a **depth** (how far they overlap).

- circle vs circle: distance between centers vs the sum of radii
- circle vs rectangle: clamp the circle center to the rectangle to find the closest point
- rectangle vs rectangle: overlap on x and y, separate on the smallest one
- anything with a triangle: the Separating Axis Theorem. Project both shapes on every edge normal, if there is a gap on any axis they don't touch, otherwise the smallest overlap is the contact

### Collisions

When 2 things overlap:

1. They get pushed apart along the normal, split by mass (mass = area of the hitbox). Heavy stuff moves less.
2. If they're moving into each other, an impulse bounces them off. How bouncy depends on the restitution of both entities, and it's different for x and y.
3. Slow hits from above count as "resting" so stuff can actually stand on stuff instead of jittering forever.
4. Both entities take damage based on the impact speed.

Blocks standing on something solid (the ground or a static block, checked down the stack) can't be pushed down. That's what keeps towers from sinking into each other.

### Rolling

The bird, pigs and wooden balls roll. When they touch something from above their spin gets set from their speed (`spin = -v / r`) so the image rotates the right way. On the ground they get rolling friction until they stop. Everything else just slides.

### Damage

Blocks and pigs have hp. Each one has a few images (`damage_0.png`, `damage_1.png`, ...) and the more hp they lose the more broken the image gets. At 0 hp they despawn and you get points. Hit = small points, destroy = big points, pigs are worth more.

### Score and stars

The score is a GeoGebra number, and the stars and texts are GeoGebra objects depending on it, so js only sets one value and the rest updates on its own. 1 star at a third of the goal, 2 at two thirds, 3 at the full goal.

### Levels

Levels are json files in `geogebra/assets/levels/`. Each block has a type (which is also its image folder), a center, a size, hp and if it's static. Pigs have a type, size, hp and if they fall.

```json
{ "id": "b1", "type": "wood/square", "center": { "x": 51, "y": 1 }, "width": 2, "height": 2, "health": 30, "static": false }
```

To switch level, change `LEVEL` in `src/main.js`.

### Performance

`evalXML` rebuilds the WHOLE construction every call. With every block having 4 images that got slow real fast. So all images get queued and added in one big `evalXML` call at the end.

## Debugging

Set `debugging = true` in `src/config.js` to see the axes, grid, algebra view and the helper points of the blocks.
