import { DESTROY_POINTS } from "./config.js";
import { Block, Circle, Pig, Triangle } from "./entities.js";
import { flushXML, tryTo } from "./util.js";

import level1 from "../geogebra/assets/levels/level1.json";
import level2 from "../geogebra/assets/levels/level2.json";
import level3 from "../geogebra/assets/levels/level3.json";

export const levels = { level1, level2, level3 };

function blockHitbox(b) {
    const shape = b.type.split("/").pop();
    if (shape.startsWith("circle")) return new Circle(b.center, b.width / 2);
    if (shape === "triangle") return new Triangle(b.center, b.width, b.height, "left");
    if (shape === "triangle-flipped") return new Triangle(b.center, b.width, b.height, "right");
    if (shape === "triangle-frame") return new Triangle(b.center, b.width, b.height, "center");
    return null;
}

export function levelGoal(level) {
    if (level.goal) return level.goal;
    return (level.blocks ?? []).length * DESTROY_POINTS.block + (level.pigs ?? []).length * DESTROY_POINTS.pig;
}

export function loadLevel(level) {
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
