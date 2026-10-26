import { g, RESTITUTION_Y, DAMAGE_PER_SPEED, REST_SPEED, RESTITUTION_X, MIN_SUPPORT_NORMAL_Y, MIN_PUSH_DOWN_NORMAL_Y, ROLL_FRICTION, ROLL_STOP_SPEED } from "./config.js";

function rollFriction(e, dt) {
    const slow = ROLL_FRICTION * dt;
    e.movement.x = Math.abs(e.movement.x) <= slow ? 0 : e.movement.x - Math.sign(e.movement.x) * slow;
}

export function stepMovement(e, dt, now) {
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

export function resolveCollision(e, other) {
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
