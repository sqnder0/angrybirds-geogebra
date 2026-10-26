export const debugging = false;

export const g = 9.81;
export const speed = 7.5 * Math.sqrt(g);

// Collisions
export const CONTACT_TOLERANCE = 0.05;
export const MIN_SUPPORT_NORMAL_Y = 0.7;
export const MIN_SUPPORT_CONTACT_WIDTH = 0.1;

export const RESTITUTION = 0.5;
export const RESTITUTION_Y = RESTITUTION;
export const RESTITUTION_X = RESTITUTION*(3/4);

export const DAMAGE_PER_SPEED = 0.5;
export const REST_SPEED = 2; 

export const BLOCK_MAX_IMAGE_STATE = 3;
export const PIG_MAX_IMAGE_STATE = 2;

export const MIN_PUSH_DOWN_NORMAL_Y = 0.9;

export const ROLL_FRICTION = 3;
export const ROLL_STOP_SPEED = 0.2;

export const HIT_POINTS = { block: 10, pig: 50 };
export const DESTROY_POINTS = { block: 100, pig: 1000 };
