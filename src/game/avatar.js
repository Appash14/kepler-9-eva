import * as THREE from 'three';

/** Small, readable explorer, with an authored human silhouette and an EVA asset wrapper. */
export function createAvatar({ astronaut } = {}) {
  const group = new THREE.Group();
  group.name = 'joueur';
  const human = new THREE.Group();
  human.name = 'tenue_station';
  const eva = new THREE.Group();
  eva.name = 'combinaison_sortie';
  group.add(human, eva);
  let mode = 'human';
  let phase = 0;
  let walking = 0;
  let time = 0;
  const geometries = new Set();
  const materials = new Set();
  const navy = material(0x162a39, 0.82);
  const ivory = material(0xe4dfcb, 0.75);
  const skin = material(0xbf886b, 0.78);
  const dark = material(0x33251f, 0.82);
  const copper = material(0xb9763e, 0.38, 0.55);
  const sole = material(0x15202b, 0.78);
  const visor = material(0x183b4b, 0.16, 0.7);
  const light = material(0xf2c694, 0.35, 0.2);
  light.emissive.setHex(0xb96b27);
  light.emissiveIntensity = 0.55;

  function material(color, roughness, metalness = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(m);
    return m;
  }
  function mesh(geometry, mat, parent, position = [0, 0, 0]) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(...position);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function capsule(radius, length, mat, parent, position) {
    return mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), mat, parent, position);
  }
  function box(x, y, z, mat, parent, position) {
    return mesh(new THREE.BoxGeometry(x, y, z), mat, parent, position);
  }
  function limb(parent, x, y, radius, length, mat) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    parent.add(pivot);
    capsule(radius, length - radius * 2, mat, pivot, [0, -length / 2, 0]);
    return pivot;
  }

  const body = new THREE.Group();
  body.position.y = 0.92;
  human.add(body);
  capsule(0.24, 0.30, navy, body, [0, 0.25, 0]);
  // Ivory yoke and copper zipper distinguish this from a generic capsule player.
  box(0.43, 0.12, 0.34, ivory, body, [0, 0.45, -0.01]);
  box(0.016, 0.34, 0.018, copper, body, [0, 0.24, -0.232]);
  box(0.08, 0.052, 0.02, copper, body, [0.115, 0.33, -0.215]);
  const head = new THREE.Group();
  head.position.set(0, 0.68, 0);
  body.add(head);
  capsule(0.15, 0.04, skin, head, [0, 0, 0]);
  const hair = mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.54), dark, head, [0, 0.025, 0]);
  hair.scale.set(1, 0.8, 1.03);
  // The face looks toward local -Z, matching controller.direction.
  capsule(0.025, 0.005, skin, head, [0, -0.008, -0.153]);
  for (const x of [-0.05, 0.05]) {
    mesh(new THREE.SphereGeometry(0.013, 6, 4), dark, head, [x, 0.012, -0.144]);
    mesh(new THREE.SphereGeometry(0.038, 6, 5), skin, head, [Math.sign(x) * 0.15, -0.003, 0]);
  }
  const leftArm = limb(body, -0.29, 0.45, 0.083, 0.58, navy);
  const rightArm = limb(body, 0.29, 0.45, 0.083, 0.58, navy);
  capsule(0.07, 0.04, skin, leftArm, [0, -0.59, 0]);
  capsule(0.07, 0.04, skin, rightArm, [0, -0.59, 0]);
  box(0.12, 0.07, 0.15, ivory, leftArm, [0, -0.45, 0]);
  box(0.12, 0.07, 0.15, ivory, rightArm, [0, -0.45, 0]);
  const leftLeg = limb(human, -0.12, 0.9, 0.102, 0.76, navy);
  const rightLeg = limb(human, 0.12, 0.9, 0.102, 0.76, navy);
  box(0.19, 0.12, 0.30, sole, leftLeg, [0, -0.81, -0.07]);
  box(0.19, 0.12, 0.30, sole, rightLeg, [0, -0.81, -0.07]);

  let hasAstronautMesh = false;
  astronaut?.traverse?.((object) => { if (object.isMesh && object.geometry) hasAstronautMesh = true; });
  if (astronaut?.isObject3D && hasAstronautMesh) {
    // Transform a new wrapper, never the quantized source mesh or its authored transforms.
    const model = astronaut.clone(true);
    model.visible = true;
    const wrapper = new THREE.Group();
    wrapper.name = 'astronaute_normalise';
    wrapper.add(model);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model, true);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = size.y > 0.01 && Number.isFinite(size.y) ? 1.75 / size.y : 1;
    wrapper.scale.setScalar(scale);
    wrapper.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    eva.add(wrapper);
    model.traverse((object) => {
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
  } else {
    capsule(0.28, 0.45, ivory, eva, [0, 1.05, 0]);
    box(0.38, 0.4, 0.20, navy, eva, [0, 1.04, 0.28]);
    for (const x of [-0.16, 0.16]) capsule(0.07, 0.31, copper, eva, [x, 1.05, 0.35]);
    mesh(new THREE.SphereGeometry(0.235, 16, 12), ivory, eva, [0, 1.55, 0]);
    const glass = mesh(new THREE.SphereGeometry(0.215, 16, 12), visor, eva, [0, 1.56, -0.06]);
    glass.scale.set(0.91, 0.75, 1);
    box(0.06, 0.09, 0.06, light, eva, [0.19, 1.59, -0.13]);
    for (const x of [-0.31, 0.31]) {
      const arm = capsule(0.1, 0.40, ivory, eva, [x, 1.05, -0.02]);
      arm.rotation.z = -Math.sign(x) * 0.2;
      capsule(0.082, 0.03, navy, eva, [x * 1.15, 0.74, -0.02]);
    }
    for (const x of [-0.14, 0.14]) {
      capsule(0.12, 0.47, ivory, eva, [x, 0.48, 0]);
      box(0.22, 0.16, 0.34, navy, eva, [x, 0.09, -0.06]);
      box(0.22, 0.10, 0.23, copper, eva, [x, 0.25, 0]);
    }
    box(0.2, 0.18, 0.05, navy, eva, [0, 1.11, -0.27]);
    box(0.13, 0.025, 0.055, light, eva, [0, 1.13, -0.30]);
  }

  function setMode(next) {
    mode = next;
    human.visible = next === 'human';
    eva.visible = next === 'eva';
    group.visible = next !== 'ship';
  }
  function update(dt, state) {
    dt = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.05);
    time += dt;
    if (!state) return;
    if (mode !== state.mode) setMode(state.mode);
    group.position.copy(state.position);
    const moving = Math.min(1, (state.speed || 0) / 3.5);
    walking += (moving - walking) * (1 - Math.exp(-dt * 12));
    phase += dt * (3 + Math.min(6, (state.speed || 0) * 1.8));
    if (mode === 'human') {
      // Feet lead movement, while the camera can orbit around a resting character.
      const velocity = state.velocity;
      const yaw = velocity && Math.hypot(velocity.x, velocity.z) > 0.25
        ? Math.atan2(-velocity.x, -velocity.z) : state.yaw;
      const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      group.quaternion.slerp(target, 1 - Math.exp(-dt * 12));
      const stride = Math.sin(phase) * walking * 0.48;
      leftLeg.rotation.x = stride;
      rightLeg.rotation.x = -stride;
      leftArm.rotation.x = -stride * 0.8;
      rightArm.rotation.x = stride * 0.8;
      leftArm.rotation.z = 0.05;
      rightArm.rotation.z = -0.05;
      body.position.y = 0.92 + Math.abs(Math.cos(phase)) * 0.025 * walking;
      body.rotation.z = Math.sin(phase) * walking * 0.025;
      head.rotation.y = Math.sin(time * 0.5) * 0.018 * (1 - walking);
    } else if (state.quaternion) {
      group.quaternion.slerp(state.quaternion, 1 - Math.exp(-dt * 9));
      eva.position.y = Math.sin(time * 1.7) * 0.025;
    }
  }
  function dispose() {
    group.removeFromParent();
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
    // The borrowed astronaut geometries/materials remain owned by the world loader.
  }
  setMode('human');
  return { group, setMode, update, dispose };
}
