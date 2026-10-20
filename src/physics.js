import { g, RESTITUTION, DAMAGE_PER_SPEED, DESPAWN_STATE, REST_SPEED } from "./config.js";

export function makeRectangleHitbox(width, height) {
    return [
        { x: -width / 2, y: -height / 2 },
        { x:  width / 2, y: -height / 2 },
        { x:  width / 2, y:  height / 2 },
        { x: -width / 2, y:  height / 2 }
    ];
}

export function makeRightTriangleHitbox(width, height) {
    return [
        { x: -width / 2, y: -height / 2 },
        { x:  width / 2, y: -height / 2 },
        { x: -width / 2, y:  height / 2 }
    ];
}

export function getWorldVertices(entity) {
    const angle = entity.angle ?? 0;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);

    return entity.hitbox.map(localVertex => ({
        x: entity.center.x + localVertex.x * cosAngle - localVertex.y * sinAngle,
        y: entity.center.y + localVertex.x * sinAngle + localVertex.y * cosAngle
    }));
}

/* Move e by one time step of dt seconds, applying gravity and landing on the ground. */
export function stepMovement(e, dt, now) {
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
            e.movement.x = e.movement.x * RESTITUTION*(3/4);
        } else {
            e.movement.x = 0;
            e.movement.y = 0;
            e.falling = false;
        }
    }
}

/* Push e out of block b and bounce it. Returns the damage b should take (0 if no contact). */
export function collideWithBlock(e, b) {
    if (b.state === DESPAWN_STATE) return 0;

    const eh = (e.height ?? e.width) / 2;
    const ew = e.width / 2;

    const dx = e.center.x - b.center.x;
    const dy = e.center.y - b.center.y;

    const overlapX = ew + b.width / 2 - Math.abs(dx);
    const overlapY = eh + b.height / 2 - Math.abs(dy);

    if (overlapX <= 0 || overlapY <= 0) return 0;   // no contact

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
        // hit the top or bottom
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
