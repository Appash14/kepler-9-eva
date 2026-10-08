import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createWorld } from './game/world.js';
import { createController } from './game/controller.js';
import { createAvatar } from './game/avatar.js';
import { createUI } from './game/ui.js';
import { createSimulation, SAVE_KEY } from './game/simulation.js';
import { NIVEAUX } from './config.js';
import { creerPost } from './engine/post.js';
import { installerGardeFous, assainirBloom } from './engine/securite.js';

const CARGO = [
  { id: 'cargo-0', position: [-17, 8, 91], metal: 7, crystal: 2, fuel: 1, rations: 1 },
  { id: 'cargo-1', position: [37, 12, 112], metal: 8, crystal: 2, fuel: 1, rations: 2 },
  { id: 'cargo-2', position: [65, -7, 86], metal: 9, crystal: 3, fuel: 1, rations: 1 },
  { id: 'cargo-3', position: [-60, 24, 157], metal: 9, crystal: 3, fuel: 2, rations: 2 },
  { id: 'cargo-4', position: [104, 42, 177], metal: 11, crystal: 4, fuel: 1, rations: 2 },
  { id: 'cargo-5', position: [93, -56, 193], metal: 10, crystal: 5, fuel: 2, rations: 1 },
  { id: 'cargo-6', position: [-130, -30, 227], metal: 12, crystal: 5, fuel: 2, rations: 2 },
  { id: 'cargo-7', position: [166, 67, 282], metal: 14, crystal: 6, fuel: 2, rations: 2 },
  { id: 'cargo-8', position: [-188, 95, 323], metal: 14, crystal: 6, fuel: 3, rations: 3 },
  { id: 'cargo-9', position: [230, -87, 350], metal: 16, crystal: 8, fuel: 3, rations: 3 },
];
const inside = (p, h) => p.x > h.min.x && p.x < h.max.x + .2 && p.z > h.min.z - .2 && p.z < h.max.z + .2 && p.y > h.floorY - .8 && p.y < h.max.y;
function readSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } }

function createAudio() {
  let context, oscillator, gain, enabled = false;
  return {
    toggle(value) {
      enabled = typeof value === 'boolean' ? value : !enabled;
      if (enabled && !context) {
        const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return false;
        context = new Audio(); gain = context.createGain(); gain.gain.value = .025;
        oscillator = context.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = 54;
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start();
      }
      if (context) { context.resume().catch(() => {}); gain.gain.setTargetAtTime(enabled ? .025 : 0, context.currentTime, .2); }
      return enabled;
    },
    update(mode, speed, paused) { if (context) { oscillator.frequency.setTargetAtTime(mode === 'ship' ? 64 + speed * 1.3 : 45, context.currentTime, .15); gain.gain.setTargetAtTime(enabled && !paused ? (mode === 'ship' ? .024 : .01) : 0, context.currentTime, .3); } },
    ping() { if (!context || !enabled) return; const o = context.createOscillator(), g = context.createGain(); o.frequency.value = 460; g.gain.setValueAtTime(.04, context.currentTime); g.gain.exponentialRampToValueAtTime(.001, context.currentTime + .15); o.connect(g); g.connect(context.destination); o.start(); o.stop(context.currentTime + .17); },
  };
}
async function loadCargoTemplate() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  try { return (await loader.loadAsync(new URL('assets/kit/caisse-ravitaillement-bas.glb', document.baseURI).href)).scene; } catch { return null; }
}
function createCargos(scene, template) {
  const geometry = new THREE.TorusGeometry(2.2, .035, 4, 40), material = new THREE.MeshBasicMaterial({ color: 0x7bbccb, toneMapped: false });
  return CARGO.map((data, i) => {
    const group = new THREE.Group(); group.position.fromArray(data.position); const visual = new THREE.Group();
    if (template) {
      const model = template.clone(true); model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
      model.position.sub(center); visual.add(model); visual.scale.setScalar(2.6 / Math.max(size.x, size.y, size.z));
    } else visual.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2), new THREE.MeshStandardMaterial({ color: 0xb49a74, roughness: .5, metalness: .55 })));
    group.add(visual); const ring = new THREE.Mesh(geometry, material); ring.rotation.x = Math.PI / 2; group.add(ring);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc783, toneMapped: false })); beacon.position.y = 1.9; group.add(beacon);
    group.userData.cargo = data.id; scene.add(group); return { ...data, group, visual, ring, phase: i * .71 };
  });
}

export async function startGame() {
  installerGardeFous();
  const params = new URLSearchParams(location.search), testing = params.has('test'), touch = matchMedia('(pointer: coarse)').matches;
  const qualityName = params.get('quality') || (touch ? 'low' : 'high'), quality = { ...NIVEAUX[qualityName in NIVEAUX ? qualityName : 'mid'], name: qualityName };
  if (testing) { Object.assign(quality, { cube: 512, ciel: 128, msaa: 0, smaa: false, dpr: 1, grain: false }); }
  const simulation = createSimulation(readSave()), audio = createAudio();
  let world, controller, avatar, post, playing = false, paused = true, ready = false, focus = null, cargos = [];
  let time = 0, lastSave = 0, lastHud = 0, lastWarning = 0, lastImpact = -5, introAngle = 0;
  const shipPosition = new THREE.Vector3(), shipQuaternion = new THREE.Quaternion();
  const runtime = { ready: false, playing: false, paused: true, mode: 'human', zone: 'Habitat', quality: qualityName, frames: 0, calls: 0, triangles: 0, cargo: [], error: null };
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(simulation.serialize())); return true; } catch { if (ready) ui.toast('La sauvegarde locale est indisponible dans ce navigateur.'); return false; } }
  function announce(result) { if (result?.message) ui.toast(result.message); if (result?.ok) audio.ping(); save(); updateHud(); return result; }
  function refreshColliders(mode = runtime.mode) { controller.setColliders(mode === 'ship' ? world.colliders : [...world.colliders, ...world.shipColliders]); }
  function setMode(mode) { controller.setMode(mode); refreshColliders(mode); avatar.setMode(mode); ui.setMode(mode); runtime.mode = mode; }
  function start() {
    if (!ready) return; playing = true; paused = false; runtime.playing = true; runtime.paused = false;
    controller.setPosition(world.baseSpawn.position); setMode('human'); controller.setActive(true);
    ui.setPlaying(true); ui.setPaused(false); ui.toast('Tu es au sas. Rejoins la navette, puis récupère les cargos lumineux.'); updateHud();
  }
  function pause() { if (!playing || paused) return; paused = true; runtime.paused = true; controller?.setActive(false); ui.setPaused(true); save(); }
  function resume() { if (!playing) return start(); paused = false; runtime.paused = false; controller.setActive(true); ui.setPaused(false); }
  function returnToBase(message = 'Retour au sas.') {
    if (!world || !controller) return; controller.setPosition(world.baseSpawn.position); shipPosition.copy(world.originalShipPose.position); shipQuaternion.copy(world.originalShipPose.quaternion);
    world.setShipPose(shipPosition, shipQuaternion); setMode('human'); ui.toast(message); updateHud(); save();
  }
  function newGame() { simulation.reset(); world.setStationLevel(1); returnToBase('Nouvelle partie. La station attend ses premières ressources.'); resume(); save(); }
  function emergencyReturn() { if (inside(controller.state.position, world.habitat)) return returnToBase(); const result = simulation.emergency('Balise de secours activée.'); returnToBase(result.message); }
  function build() { const result = simulation.build(world && inside(controller.state.position, world.habitat)); if (result.ok) { world.setStationLevel(simulation.state.level); refreshColliders(); } announce(result); if (result.ok && simulation.state.level === 5) ui.showComplete(); }
  function chooseFocus() {
    if (!world || !controller) return null; const position = controller.state.position;
    const nearest = cargos.filter(c => simulation.state.looted[c.id] == null).map(c => ({ cargo: c, distance: position.distanceTo(c.group.position) })).sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance <= (runtime.mode === 'ship' ? 12 : 4.5)) return { type: 'cargo', label: 'Récupérer le cargo', target: nearest.cargo, distance: nearest.distance };
    const baseDistance = position.distanceTo(world.airlockPosition);
    if (runtime.mode === 'ship') return { type: 'exit', label: baseDistance < 24 ? 'Amarrer et entrer au sas' : 'Sortir en combinaison', distance: baseDistance };
    if (position.distanceTo(shipPosition) < 10) return { type: 'ship', label: 'Piloter la navette', distance: position.distanceTo(shipPosition) };
    if (inside(position, world.habitat)) return { type: 'base', label: simulation.canBuild() ? 'Construire le prochain module' : 'Réserves et construction', distance: 0 };
    return null;
  }
  function interact() {
    if (!playing || paused) return; focus = chooseFocus(); if (!focus) return ui.toast('Approche de la navette, du sas ou d’un cargo lumineux.');
    if (focus.type === 'cargo') return announce(simulation.loot(focus.target.id, focus.target));
    if (focus.type === 'ship') { controller.setPosition(shipPosition); setMode('ship'); ui.toast('Navette en ligne. Espace monte, C descend, Maj accélère.'); audio.ping(); return; }
    if (focus.type === 'exit') {
      if (focus.distance < 24) return returnToBase('Navette amarrée. Oxygène et batterie en recharge.');
      controller.setPosition(shipPosition.clone().add(new THREE.Vector3(4.5, 0, 0).applyQuaternion(shipQuaternion))); setMode('eva'); ui.toast('Sortie extravéhiculaire. Surveille ton oxygène.'); return;
    }
    if (focus.type === 'base') { if (simulation.canBuild()) build(); else ui.toast('Ouvre les réserves avec Tab ou I pour voir le prochain module.'); }
  }
  const ui = createUI({ onStart: start, onPause: pause, onResume: resume, onReset: emergencyReturn, onInteract: interact, onSound: value => audio.toggle(value), onBuild: build,
    onEat: () => announce(simulation.eat()), onRefuel: () => announce(simulation.refuel()), onNewGame: newGame,
    onTouchMove: (x, y) => controller?.setTouchMove(x, y), onTouchLook: (x, y) => controller?.setTouchLook(x, y), onTouchVertical: value => controller?.setTouchVertical(value), onBoost: value => controller?.setBoost(value) });
  ui.setLoading(.02, 'Préparation de la sortie');
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = !touch && qualityName !== 'low'; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.info.autoReset = false; renderer.setClearColor(0x030810, 1); renderer.setPixelRatio(Math.min(devicePixelRatio, quality.dpr));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(touch ? 62 : 58, innerWidth / innerHeight, .1, 30000);
  const navigation = document.createElement('div'); navigation.className = 'eva-waypoints'; navigation.setAttribute('aria-hidden', 'true'); document.body.append(navigation);
  const markers = ['SAS', 'CARGO'].map(label => { const element = document.createElement('div'); element.className = 'eva-waypoint'; element.dataset.label = label; navigation.append(element); return element; });
  const projected = new THREE.Vector3(), relative = new THREE.Vector3(), inverseView = new THREE.Quaternion();
  function updateNavigation() {
    navigation.hidden = !playing || paused;
    if (navigation.hidden) return;
    const position = controller.state.position;
    const nearest = cargos.filter(c => simulation.state.looted[c.id] == null).sort((a, b) => position.distanceToSquared(a.group.position) - position.distanceToSquared(b.group.position))[0];
    [world.airlockPosition, nearest?.group.position].forEach((target, index) => {
      const marker = markers[index]; marker.hidden = !target || (index === 0 && inside(position, world.habitat)); if (marker.hidden) return;
      projected.copy(target).project(camera);
      relative.copy(target).sub(camera.position).applyQuaternion(inverseView.copy(camera.quaternion).invert());
      let x = projected.x, y = -projected.y;
      const outside = relative.z > 0 || Math.abs(x) > .83 || Math.abs(y) > .65;
      if (outside) { x = relative.x; y = -relative.y; if (Math.abs(x) + Math.abs(y) < .01) x = 1; const factor = Math.max(Math.abs(x) / .83, Math.abs(y) / .65); x /= factor; y /= factor; }
      marker.style.left = `${(x * .5 + .5) * innerWidth}px`; marker.style.top = `${(y * .5 + .5) * innerHeight}px`;
      marker.textContent = `${outside ? '› ' : '◇ '}${marker.dataset.label} ${Math.round(position.distanceTo(target))} m`;
    });
  }
  world = await createWorld({ renderer, scene, camera, quality, onProgress: (p, label) => ui.setLoading(.03 + p * .82, label) });
  world.setStationLevel(simulation.state.level); shipPosition.copy(world.originalShipPose.position); shipQuaternion.copy(world.originalShipPose.quaternion);
  controller = createController({ camera, domElement: renderer.domElement, colliders: world.colliders, spawn: world.baseSpawn, onState: state => { if (state.reason === 'pause' && playing && !paused) pause(); } });
  controller.setHabitat(world.habitat); controller.setMode('human'); controller.setPosition(world.baseSpawn.position);
  avatar = createAvatar({ astronaut: world.astronautTemplate }); scene.add(avatar.group); avatar.setMode('human'); cargos = createCargos(scene, await loadCargoTemplate());
  const baseBeacon = new THREE.Mesh(new THREE.TorusGeometry(1, .05, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffbf72 })); baseBeacon.position.copy(world.airlockPosition).add(new THREE.Vector3(0, 3, 0)); scene.add(baseBeacon);
  post = creerPost(renderer, scene, camera, quality); assainirBloom(post.bloom); post.regler({ exposition: 1, saturation: 1.04, teinte: [1, .99, .97], bloom: .65 });
  function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); post.composer.setSize(innerWidth, innerHeight); }
  resize(); window.addEventListener('resize', resize, { passive: true }); ui.setLoading(.95, 'Combinaison et navette prêtes');
  camera.position.set(91, 42, 138); camera.lookAt(5, -5, 5); await renderer.compileAsync(scene, camera); post.composer.render(0);
  ready = runtime.ready = true; ui.ready(); updateHud();
  function updateHud() {
    if (!world || !controller) return; const state = simulation.state, position = controller.state.position, atBase = inside(position, world.habitat), next = simulation.nextUpgrade(); focus = chooseFocus();
    ui.setSurvival({ oxygen: state.oxygen, energy: state.energy, food: state.food, hull: state.hull }); ui.setInventory(state.inventory);
    ui.setBase({ level: state.level, nextName: next?.name ?? 'Station complète', description: next?.description ?? 'Les sorties restent libres.', cost: next?.cost ?? {}, canBuild: simulation.canBuild(), atBase, energy: state.baseEnergy });
    const nearest = cargos.filter(c => state.looted[c.id] == null).sort((a, b) => position.distanceToSquared(a.group.position) - position.distanceToSquared(b.group.position))[0];
    runtime.zone = atBase ? 'Habitat pressurisé' : runtime.mode === 'ship' ? 'Navette' : 'Sortie spatiale';
    ui.setTelemetry({ speed: controller.state.speed ?? 0, distance: position.distanceTo(world.airlockPosition), zone: runtime.zone, target: focus?.type === 'cargo' ? 'Cargo' : 'Sas', cargoDistance: nearest ? position.distanceTo(nearest.group.position) : null });
    ui.setInteraction({ label: focus?.label ?? 'Approche d’un cargo ou de la navette', available: !!focus });
    ui.setObjectives([{ id: 'salvage', label: 'Récupérer un cargo spatial', done: state.collected > 0 }, { id: 'reactor', label: 'Construire le réacteur', done: state.level >= 2 }, { id: 'greenhouse', label: 'Produire des rations dans la serre', done: state.level >= 3 }, { id: 'station', label: 'Achever la station', done: state.level >= 5 }]);
    runtime.cargo = cargos.map(c => ({ id: c.id, position: c.group.position.toArray(), available: state.looted[c.id] == null }));
  }
  function advance(dt) {
    const impactSpeed = controller.state.speed;
    controller.update(dt); const atBase = inside(controller.state.position, world.habitat);
    if (runtime.mode === 'ship' && controller.state.collided && impactSpeed > 8 && time - lastImpact > 1.5) { simulation.damage(Math.min(22, impactSpeed * .45)); ui.toast('Impact : coque endommagée.'); lastImpact = time; }
    if (runtime.mode !== 'ship') { const mode = atBase ? 'human' : 'eva'; if (runtime.mode !== mode) setMode(mode); }
    else { shipPosition.copy(controller.state.position); shipQuaternion.copy(controller.state.quaternion); world.setShipPose(shipPosition, shipQuaternion); }
    const result = simulation.tick(dt, { atBase, mode: runtime.mode, moving: controller.state.speed > .5, boost: !!controller.state.boost }); if (result?.rescue) returnToBase(result.message);
    if (time - lastWarning > 12 && (simulation.state.oxygen < 25 || simulation.state.energy < 20 || simulation.state.food < 25)) { ui.toast(simulation.state.food < 25 ? 'Tu as faim. Consomme une ration depuis les réserves.' : 'Réserves basses : rejoins le sas ou utilise du carburant.'); lastWarning = time; }
    if (time - lastSave > 5) { save(); lastSave = time; }
  }
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min((now - last) / 1000, .05); last = now; if (document.hidden) return; time += dt;
    if (playing && !paused) { advance(dt);
    } else if (!playing) { introAngle += dt * .012; camera.position.set(91 + Math.sin(introAngle) * 8, 42, 138); camera.lookAt(5, -5, 5); }
    avatar.update(dt, controller.state); world.update(dt, time, camera);
    for (const cargo of cargos) { cargo.group.visible = simulation.state.looted[cargo.id] == null; cargo.visual.rotation.y = time * .08 + cargo.phase; cargo.ring.rotation.z = time * .1; }
    baseBeacon.rotation.y = time * .15; audio.update(runtime.mode, controller.state.speed, paused); updateNavigation();
    if (time - lastHud > .12) { updateHud(); lastHud = time; }
    renderer.info.reset(); post.composer.render(dt); runtime.frames++; runtime.calls = renderer.info.render.calls; runtime.triangles = renderer.info.render.triangles;
  }
  requestAnimationFrame(frame);
  window.addEventListener('keydown', event => { if (!playing || paused || event.repeat || event.target.matches('input,textarea')) return;
    if (event.code === 'KeyE') { event.preventDefault(); interact(); } if (event.code === 'KeyF') { event.preventDefault(); announce(simulation.refuel()); } if (event.code === 'KeyR') { event.preventDefault(); emergencyReturn(); } });
  window.addEventListener('pagehide', save); document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); pause(); ui.toast('Le rendu graphique a été interrompu. Ta progression est sauvegardée. Recharge la page.'); });
  window.__eva = { state: runtime, simulation, controller, world, avatar, start, pause, resume, reset: returnToBase, interact, build, eat: () => announce(simulation.eat()), refuel: () => announce(simulation.refuel()), save,
    ...(testing ? { debugTeleport: (position, mode = 'eva') => { controller.setPosition(new THREE.Vector3(...position)); setMode(mode); updateHud(); }, debugTick: (dt, options) => simulation.tick(dt, options), debugStep: (dt) => { if (playing && !paused) { time += dt; advance(dt); updateHud(); } } } : {}) };
  return window.__eva;
}
