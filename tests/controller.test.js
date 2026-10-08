import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createController } from '../src/game/controller.js';

function fixture({ position = new THREE.Vector3(17, 0.05, 49), lookAt = new THREE.Vector3(10.7, 1.2, 47) } = {}) {
  const win = new EventTarget();
  const doc = new EventTarget();
  const canvas = new EventTarget();
  doc.defaultView = win;
  canvas.ownerDocument = doc;
  const habitat = {
    min: new THREE.Vector3(10.4, 0, 40.4),
    max: new THREE.Vector3(23.6, 6.1, 53.6), floorY: 0,
    door: { minZ: 45.5, maxZ: 48.5, minY: 0, maxY: 2.5, minX: 9.4 },
  };
  const solidMaterial = new THREE.MeshBasicMaterial();
  const solids = [
    { size: [14, 0.42, 14], center: [17, -0.21, 47] },
    { size: [0.4, 6.4, 5.1], center: [10, 3.2, 42.55] },
    { size: [0.4, 6.4, 5.1], center: [10, 3.2, 51.45] },
    { size: [0.4, 2.2, 3.8], center: [10, 5.3, 47] },
  ].map(({ size, center }) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), solidMaterial);
    mesh.position.set(...center);
    mesh.updateMatrixWorld(true);
    return mesh;
  });
  const controller = createController({
    camera: new THREE.PerspectiveCamera(), domElement: canvas, colliders: solids,
    spawn: { position, lookAt },
  });
  controller.setHabitat(habitat);
  controller.setMode('human');
  controller.setActive(true);
  function keyboard(type, code) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'code', { value: code });
    win.dispatchEvent(event);
  }
  // This trajectory stays within the room's Z/Y extents. The core reclassifies
  // locomotion after every physics tick, rather than after an entire walk.
  function advance(dt = 0.05) {
    controller.update(dt);
    const insideX = controller.state.position.x > habitat.min.x;
    if (controller.state.mode === 'human' && !insideX) controller.setMode('eva');
  }
  function dispose() {
    controller.dispose();
    solids.forEach(mesh => mesh.geometry.dispose());
    solidMaterial.dispose();
  }
  return { controller, habitat, win, keyboard, advance, dispose };
}

test('walks from the real spawn through the open airlock and becomes EVA', () => {
  const game = fixture();
  try {
    game.keyboard('keydown', 'KeyW');
    let ticks = 0;
    while (game.controller.state.mode === 'human' && ticks++ < 100) game.advance();
    game.keyboard('keyup', 'KeyW');
    const state = game.controller.state;
    assert.equal(state.mode, 'eva', 'The airlock must be reachable by walking, without teleporting.');
    assert.ok(state.position.x < 10.4, `Airlock remained blocked at X=${state.position.x}`);
    assert.ok(state.position.z >= 45.5 && state.position.z <= 48.5, 'Exit must go through the doorway.');
    assert.equal(state.position.y, 0, 'Gravity must not invalidate the ground-level doorway.');
    console.log('airlock exit', JSON.stringify({ ticks, position: state.position.toArray(), mode: state.mode }));
  } finally { game.dispose(); }
});

test('closed west wall keeps the player human and inside the room', () => {
  const game = fixture({ position: new THREE.Vector3(17, 0.05, 43), lookAt: new THREE.Vector3(0, 0.05, 43) });
  try {
    game.keyboard('keydown', 'ArrowUp');
    for (let i = 0; i < 100; i++) game.advance();
    game.keyboard('keyup', 'ArrowUp');
    const state = game.controller.state;
    assert.equal(state.mode, 'human', 'A closed wall must not switch the suit to EVA.');
    assert.ok(state.position.x >= 10.72 - 1e-9, `Passed the closed-wall boundary at X=${state.position.x}`);
    assert.ok(state.position.x < 11, 'Player should have reached the wall, not stayed at spawn.');
    assert.equal(state.position.z, 43);
    assert.equal(state.position.y, 0);
    console.log('closed wall', JSON.stringify({ position: state.position.toArray(), mode: state.mode }));
  } finally { game.dispose(); }
});

test('releasing the joystick settles movement and pausing cancels held input', () => {
  const game = fixture({ position: new THREE.Vector3(17, 0.05, 47), lookAt: new THREE.Vector3(17, 0.05, 40) });
  try {
    game.controller.setTouchMove(0, -1);
    for (let i = 0; i < 8; i++) game.advance();
    assert.ok(game.controller.state.position.z < 46.5, 'The joystick must actually move the player.');
    game.controller.setTouchMove(0, 0);
    for (let i = 0; i < 30; i++) game.advance();
    const settled = game.controller.state.position.clone();
    for (let i = 0; i < 20; i++) game.advance();
    assert.ok(settled.distanceTo(game.controller.state.position) < 1e-6, 'Released joystick must settle without continuing drift.');
    game.controller.setTouchMove(1, -1);
    game.controller.setBoost(true);
    game.controller.setActive(false);
    const paused = game.controller.state.position.clone();
    for (let i = 0; i < 20; i++) game.advance();
    assert.deepEqual(game.controller.state.position.toArray(), paused.toArray(), 'Pause must stop held input immediately.');
    game.controller.setActive(true);
    for (let i = 0; i < 10; i++) game.advance();
    assert.deepEqual(game.controller.state.position.toArray(), paused.toArray(), 'Resume must not restore a stale joystick input.');
    assert.equal(game.controller.state.boost, false);
    console.log('released and paused', JSON.stringify({ position: paused.toArray(), staleInput: false }));
  } finally { game.dispose(); }
});
