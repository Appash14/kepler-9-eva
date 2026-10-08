import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const UP = new THREE.Vector3(0, 1, 0);
const LIMIT = 550;
const MODES = {
  human: { speed: 3.6, boost: 5.8, radius: 0.32, camera: 6 },
  eva: { speed: 5.2, boost: 12, radius: 0.38, camera: 8 },
  ship: { speed: 22, boost: 45, radius: 1.65, camera: 18 },
};

/** Player position is at the feet; the camera always remains independent. */
export function createController({ camera, domElement, colliders = [], spawn, onState = () => {} }) {
  if (!camera || !domElement) throw new TypeError('A camera and canvas are required.');
  const win = domElement.ownerDocument?.defaultView || globalThis.window;
  const doc = domElement.ownerDocument || globalThis.document;
  const initialPosition = new THREE.Vector3().copy(spawn?.position || new THREE.Vector3());
  const initialLook = new THREE.Vector3().copy(spawn?.lookAt || initialPosition.clone().add(new THREE.Vector3(0, 0, -1)));
  const direction = initialLook.clone().sub(initialPosition).normalize();
  const initialYaw = Math.atan2(-direction.x, -direction.z);
  const initialPitch = Math.asin(clamp(direction.y, -0.95, 0.95));
  const state = {
    position: initialPosition.clone(), velocity: new THREE.Vector3(),
    direction: direction.clone(), quaternion: new THREE.Quaternion(),
    yaw: initialYaw, pitch: initialPitch, speed: 0, active: false,
    boost: false, mode: 'eva', grounded: false, collided: false,
  };
  let habitat = null;
  let avatar = null;
  let disposed = false;
  let dragPointer = null;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let jumpQueued = false;
  let touchBoost = false;
  let cameraInitialized = false;
  const keys = new Set();
  const touchMove = new THREE.Vector2();
  let touchVertical = 0;
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const targetVelocity = new THREE.Vector3();
  const displacement = new THREE.Vector3();
  const step = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const hitOrigin = new THREE.Vector3();
  const hitDirection = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const normalMatrix = new THREE.Matrix3();
  const anchor = new THREE.Vector3();
  const cameraWanted = new THREE.Vector3();
  const cameraSafe = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const collisionRecords = [];
  const offsets = [];
  const cameraOffsets = [
    new THREE.Vector3(), new THREE.Vector3(0.18, 0, 0),
    new THREE.Vector3(-0.18, 0, 0), new THREE.Vector3(0, 0.18, 0),
    new THREE.Vector3(0, -0.18, 0),
  ];
  const sides = new Map();

  function snapshot(reason, detail) {
    onState({
      reason, detail, mode: state.mode, active: state.active,
      position: state.position.clone(), direction: state.direction.clone(),
      quaternion: state.quaternion.clone(), yaw: state.yaw, pitch: state.pitch,
      speed: state.speed, grounded: state.grounded, boost: state.boost,
    });
  }

  function isVisible(object) {
    for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
      if (!ancestor.visible) return false;
    }
    return true;
  }

  function setColliders(list = []) {
    collisionRecords.length = 0;
    const seen = new Set();
    for (const entry of list) {
      const object = entry?.mesh || entry;
      if (!object) continue;
      object.updateWorldMatrix?.(true, true);
      object.traverse?.((mesh) => {
        if (!mesh.isMesh || !mesh.geometry || seen.has(mesh)) return;
        seen.add(mesh);
        collisionRecords.push({ mesh, box: new THREE.Box3().setFromObject(mesh, true) });
      });
    }
  }

  // Front and back faces both obstruct a body. Material sides are restored before rendering.
  function cast(origin, dir, length, pad = 0) {
    ray.set(origin, dir);
    ray.near = 0;
    ray.far = length;
    const nearby = [];
    for (const record of collisionRecords) {
      if (!isVisible(record.mesh)) continue;
      if (record.box.distanceToPoint(origin) > length + pad) continue;
      if (!ray.ray.intersectsBox(record.box)) continue;
      nearby.push(record.mesh);
    }
    if (!nearby.length) return null;
    sides.clear();
    try {
      for (const mesh of nearby) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material && !sides.has(material)) {
            sides.set(material, material.side);
            material.side = THREE.DoubleSide;
          }
        }
      }
      return ray.intersectObjects(nearby, false)[0] || null;
    } finally {
      for (const [material, side] of sides) material.side = side;
    }
  }

  function configureOffsets() {
    offsets.length = 0;
    const radius = MODES[state.mode].radius;
    const heights = state.mode === 'ship' ? [-1.2, 0, 1.2] : [0.35, 0.9, 1.45];
    for (const height of heights) {
      offsets.push(new THREE.Vector3(0, height, 0));
      offsets.push(new THREE.Vector3(radius, height, 0), new THREE.Vector3(-radius, height, 0));
      offsets.push(new THREE.Vector3(0, height, radius), new THREE.Vector3(0, height, -radius));
    }
  }

  function sweepMove(move) {
    const distance = move.length();
    if (distance < 1e-7) return;
    const substeps = Math.max(1, Math.ceil(distance / (state.mode === 'ship' ? 0.8 : 0.18)));
    step.copy(move).multiplyScalar(1 / substeps);
    for (let i = 0; i < substeps; i++) {
      displacement.copy(step);
      // Up to three contact planes allow corners to stop while a single wall slides.
      for (let contact = 0; contact < 3; contact++) {
        const length = displacement.length();
        if (length < 1e-6) break;
        hitDirection.copy(displacement).divideScalar(length);
        let closest = null;
        for (const offset of offsets) {
          hitOrigin.copy(state.position).add(offset);
          const hit = cast(hitOrigin, hitDirection, length + 0.04);
          if (hit && (!closest || hit.distance < closest.distance)) closest = hit;
        }
        if (!closest) {
          state.position.add(displacement);
          break;
        }
        state.collided = true;
        const safeDistance = Math.max(0, closest.distance - 0.045);
        state.position.addScaledVector(hitDirection, Math.min(length, safeDistance));
        displacement.addScaledVector(hitDirection, -Math.min(length, safeDistance));
        if (!closest.face) break;
        normalMatrix.getNormalMatrix(closest.object.matrixWorld);
        normal.copy(closest.face.normal).applyMatrix3(normalMatrix).normalize();
        if (normal.dot(hitDirection) > 0) normal.negate();
        const intoWall = displacement.dot(normal);
        if (intoWall < 0) displacement.addScaledVector(normal, -intoWall);
        const velocityIntoWall = state.velocity.dot(normal);
        if (velocityIntoWall < 0) state.velocity.addScaledVector(normal, -velocityIntoWall);
        if (normal.y > 0.6 && state.mode === 'human') state.grounded = true;
      }
    }
  }

  function refreshOrientation() {
    const cp = Math.cos(state.pitch);
    state.direction.set(-Math.sin(state.yaw) * cp, Math.sin(state.pitch), -Math.cos(state.yaw) * cp);
    forward.copy(state.direction);
    if (state.mode === 'human') {
      forward.y = 0;
      forward.normalize();
    }
    right.crossVectors(forward, UP).normalize();
    euler.set(state.mode === 'human' ? 0 : state.pitch, state.yaw, 0, 'YXZ');
    state.quaternion.setFromEuler(euler);
  }

  function updateCamera(dt, immediate = false) {
    const height = state.mode === 'ship' ? 2.2 : 1.25;
    anchor.copy(state.position).addScaledVector(UP, height);
    const cameraPitch = state.mode === 'human' ? Math.max(-0.12, state.pitch) : state.pitch;
    const cp = Math.cos(cameraPitch);
    const lookDirection = hitDirection.set(-Math.sin(state.yaw) * cp, Math.sin(cameraPitch), -Math.cos(state.yaw) * cp);
    cameraWanted.copy(anchor).addScaledVector(lookDirection, -MODES[state.mode].camera);
    // A small shoulder offset leaves the astronaut and distant loot visible together.
    cameraWanted.addScaledVector(right, state.mode === 'ship' ? 0 : 0.5);
    cameraWanted.y += state.mode === 'human' ? 0.65 : 0.4;
    displacement.subVectors(cameraWanted, anchor);
    const distance = displacement.length();
    hitDirection.copy(displacement).normalize();
    let safeDistance = distance;
    for (const offset of cameraOffsets) {
      hitOrigin.copy(anchor).add(offset);
      const hit = cast(hitOrigin, hitDirection, distance);
      if (hit) safeDistance = Math.min(safeDistance, Math.max(0.25, hit.distance - 0.3));
    }
    cameraSafe.copy(anchor).addScaledVector(hitDirection, safeDistance);
    if (habitat && state.mode === 'human') cameraSafe.y = Math.max(habitat.floorY + 0.35, cameraSafe.y);
    const alpha = immediate || !cameraInitialized ? 1 : 1 - Math.exp(-dt * 12);
    camera.position.lerp(cameraSafe, alpha);
    // Never let smoothing carry the camera through a wall after an abrupt orbit.
    displacement.subVectors(camera.position, anchor);
    const smoothedDistance = displacement.length();
    if (smoothedDistance > 0.25) {
      hitDirection.copy(displacement).divideScalar(smoothedDistance);
      const hit = cast(anchor, hitDirection, smoothedDistance);
      if (hit) camera.position.copy(anchor).addScaledVector(hitDirection, Math.max(0.25, hit.distance - 0.3));
    }
    camera.lookAt(anchor.clone().addScaledVector(state.direction, state.mode === 'ship' ? 8 : 2));
    cameraInitialized = true;
  }

  function clearInput() {
    keys.clear();
    touchMove.set(0, 0);
    touchVertical = 0;
    touchBoost = false;
    state.boost = false;
    state.velocity.set(0, 0, 0);
    state.speed = 0;
    jumpQueued = false;
    if (dragPointer !== null) {
      try { domElement.releasePointerCapture?.(dragPointer); } catch { /* already released */ }
    }
    dragPointer = null;
  }

  function setActive(active) {
    const next = Boolean(active) && !disposed;
    if (state.active === next) return;
    state.active = next;
    clearInput();
    snapshot(next ? 'active' : 'pause', next ? 'resume' : 'requested');
  }

  function pause(reason) {
    if (!state.active) return;
    state.active = false;
    clearInput();
    snapshot('pause', reason);
  }

  function textInput(event) {
    const target = event.target;
    return target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '');
  }

  const controlCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyC', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight']);
  function keyDown(event) {
    if (!state.active || textInput(event)) return;
    if (event.code === 'Escape') { pause('escape'); return; }
    if (!controlCodes.has(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
    if (event.code === 'Space' && !event.repeat && state.mode === 'human') jumpQueued = true;
  }
  function keyUp(event) { keys.delete(event.code); }
  function pointerDown(event) {
    if (!state.active || event.pointerType === 'touch' || event.button !== 0) return;
    dragPointer = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    domElement.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event) {
    if (!state.active) return;
    const locked = doc?.pointerLockElement === domElement;
    if (!locked && event.pointerId !== dragPointer) return;
    const dx = locked ? event.movementX : event.clientX - lastPointerX;
    const dy = locked ? event.movementY : event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    setTouchLook(dx, dy);
  }
  function pointerUp(event) {
    if (event.pointerId !== dragPointer) return;
    try { domElement.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
    dragPointer = null;
  }
  function setTouchLook(dx, dy) {
    if (!state.active || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    state.yaw -= clamp(dx, -200, 200) * 0.004;
    state.pitch = clamp(state.pitch - clamp(dy, -200, 200) * 0.003, -1.22, 1.12);
    refreshOrientation();
  }
  function setTouchMove(x, y) {
    if (!state.active) return;
    touchMove.set(clamp(Number(x) || 0, -1, 1), clamp(Number(y) || 0, -1, 1));
  }
  function setTouchVertical(value) {
    const next = clamp(Number(value) || 0, -1, 1);
    if (state.active && next > 0 && touchVertical <= 0 && state.mode === 'human') jumpQueued = true;
    touchVertical = state.active ? next : 0;
  }

  function setMode(mode) {
    if (!MODES[mode]) throw new RangeError(`Unknown locomotion mode: ${mode}`);
    if (state.mode === mode) return;
    state.mode = mode;
    state.velocity.set(0, 0, 0);
    state.speed = 0;
    state.grounded = false;
    jumpQueued = false;
    configureOffsets();
    refreshOrientation();
    cameraInitialized = false;
    updateCamera(0, true);
    snapshot('mode', mode);
  }
  function setPosition(position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) return;
    state.position.copy(position).clampScalar(-LIMIT, LIMIT);
    state.velocity.set(0, 0, 0);
    state.speed = 0;
    state.grounded = false;
    cameraInitialized = false;
    updateCamera(0, true);
  }
  function setHabitat(value) {
    habitat = value ? {
      min: new THREE.Vector3().copy(value.min), max: new THREE.Vector3().copy(value.max),
      floorY: Number.isFinite(value.floorY) ? value.floorY : value.min.y,
      door: value.door ? { ...value.door } : null,
    } : null;
  }

  function update(dt) {
    if (disposed) return state;
    dt = clamp(Number(dt) || 0, 0, 0.05);
    refreshOrientation();
    state.collided = false;
    if (state.active && dt > 0) {
      const pressed = (...codes) => codes.some((code) => keys.has(code)) ? 1 : 0;
      const x = pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'KeyQ', 'ArrowLeft') + touchMove.x;
      const z = pressed('KeyW', 'KeyZ', 'ArrowUp') - pressed('KeyS', 'ArrowDown') - touchMove.y;
      const vertical = state.mode === 'human' ? 0 : pressed('Space') - pressed('KeyC', 'ControlLeft', 'ControlRight') + touchVertical;
      state.boost = touchBoost || pressed('ShiftLeft', 'ShiftRight') > 0;
      targetVelocity.copy(forward).multiplyScalar(z).addScaledVector(right, x);
      if (state.mode !== 'human') targetVelocity.addScaledVector(UP, vertical);
      if (targetVelocity.lengthSq() > 1) targetVelocity.normalize();
      targetVelocity.multiplyScalar(state.boost ? MODES[state.mode].boost : MODES[state.mode].speed);
      const acceleration = state.mode === 'ship' ? 5 : state.mode === 'human' ? 14 : 9;
      const blend = 1 - Math.exp(-dt * acceleration);
      if (state.mode === 'human') {
        state.velocity.x += (targetVelocity.x - state.velocity.x) * blend;
        state.velocity.z += (targetVelocity.z - state.velocity.z) * blend;
        if (jumpQueued && state.grounded) { state.velocity.y = 4.4; state.grounded = false; }
        jumpQueued = false;
        state.velocity.y -= 10.5 * dt;
      } else state.velocity.lerp(targetVelocity, blend);
      displacement.copy(state.velocity).multiplyScalar(dt);
      sweepMove(displacement);
      if (state.mode === 'human' && habitat) {
        const margin = MODES.human.radius;
        const door = habitat.door;
        const feetY = Math.max(habitat.floorY, state.position.y);
        const throughDoor = door && state.position.z >= door.minZ && state.position.z <= door.maxZ && feetY >= door.minY && feetY <= door.maxY;
        state.position.x = clamp(state.position.x, throughDoor ? door.minX : habitat.min.x + margin, habitat.max.x - margin);
        state.position.z = clamp(state.position.z, habitat.min.z + margin, habitat.max.z - margin);
        if (state.position.y <= habitat.floorY + 0.02) {
          state.position.y = habitat.floorY;
          state.velocity.y = 0;
          state.grounded = true;
        }
        if (state.position.y > habitat.max.y - 1.8) {
          state.position.y = habitat.max.y - 1.8;
          state.velocity.y = Math.min(0, state.velocity.y);
        }
      }
      for (const axis of ['x', 'y', 'z']) {
        if (Math.abs(state.position[axis]) > LIMIT) {
          state.position[axis] = clamp(state.position[axis], -LIMIT, LIMIT);
          state.velocity[axis] = 0;
        }
      }
      state.speed = state.velocity.length();
    }
    updateCamera(dt);
    if (avatar) { avatar.position.copy(state.position); avatar.quaternion.copy(state.quaternion); }
    return state;
  }

  function reset() {
    clearInput();
    state.yaw = initialYaw;
    state.pitch = initialPitch;
    refreshOrientation();
    setPosition(initialPosition);
    snapshot('reset', 'spawn');
  }
  const blur = () => pause('blur');
  const visibility = () => { if (doc?.hidden) pause('hidden'); };
  const lockChange = () => { if (!doc?.pointerLockElement && dragPointer === null) clearInput(); };
  win?.addEventListener('keydown', keyDown);
  win?.addEventListener('keyup', keyUp);
  win?.addEventListener('blur', blur);
  doc?.addEventListener('visibilitychange', visibility);
  doc?.addEventListener('pointerlockchange', lockChange);
  domElement.addEventListener('pointerdown', pointerDown);
  domElement.addEventListener('pointermove', pointerMove);
  domElement.addEventListener('pointerup', pointerUp);
  domElement.addEventListener('pointercancel', pointerUp);
  camera.near = 0.1;
  camera.updateProjectionMatrix();
  setColliders(colliders);
  configureOffsets();
  refreshOrientation();
  updateCamera(0, true);

  function dispose() {
    if (disposed) return;
    disposed = true;
    state.active = false;
    clearInput();
    win?.removeEventListener('keydown', keyDown);
    win?.removeEventListener('keyup', keyUp);
    win?.removeEventListener('blur', blur);
    doc?.removeEventListener('visibilitychange', visibility);
    doc?.removeEventListener('pointerlockchange', lockChange);
    domElement.removeEventListener('pointerdown', pointerDown);
    domElement.removeEventListener('pointermove', pointerMove);
    domElement.removeEventListener('pointerup', pointerUp);
    domElement.removeEventListener('pointercancel', pointerUp);
    collisionRecords.length = 0;
  }
  return {
    update, setActive, reset, setTouchMove, setTouchLook, setTouchVertical,
    setBoost(value) { touchBoost = state.active && Boolean(value); },
    setMode, setViewMode: setMode, setColliders, setPosition, teleport: setPosition,
    setHabitat, setAvatar(object) { avatar = object || null; }, dispose, state,
  };
}
