import * as THREE from 'three';
import { NIVEAUX } from '../config.js';
import { creerGeometrie } from '../world/geometrie.js';
import { profilAnneaux, creerAnneaux } from '../world/anneaux.js';
import { creerPlanete } from '../world/planete.js';
import { creerCiel } from '../world/ciel.js';
import { creerEnvironnement } from '../world/environnement.js';
import { creerKit } from '../world/kit.js';
import { enrichir, U_LUMIERE } from '../world/materiaux.js';
import { chargerGlb, creerStation } from './world-helpers/station-static.js';
import { creerReflets } from './world-helpers/reflections.js';
import { createHabitat } from './world-helpers/habitat.js';

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const isWithin = (object, root) => {
  for (let ancestor = object; ancestor; ancestor = ancestor.parent) if (ancestor === root) return true;
  return false;
};
function isSolid(mesh) {
  if (!mesh.isMesh) return false;
  for (let ancestor = mesh; ancestor; ancestor = ancestor.parent) {
    if (/^(verre_|emissif_|effets_station|navette|ciel)/.test(ancestor.name || '')) return false;
    if (/kit_(astronaute|drone-maintenance|robot-jardinier)/.test(ancestor.name || '')) return false;
  }
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.every((material) => material && !material.transparent && !/verre|halo|signal/i.test(material.name));
}

async function loadAtlas(size, anisotropy) {
  const base = new URL('assets/', document.baseURI);
  const infoResponse = await fetch(new URL('lumiere.json', base));
  if (!infoResponse.ok) throw new Error('Atlas Kepler : lumiere.json manquant');
  const info = await infoResponse.json();
  async function texture(name) {
    const response = await fetch(new URL(name, base));
    if (!response.ok || (response.headers.get('content-type') || '').includes('text/html')) {
      throw new Error(`Atlas Kepler manquant : ${name}`);
    }
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    const map = new THREE.Texture(bitmap);
    map.flipY = false;
    map.colorSpace = THREE.NoColorSpace;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.anisotropy = anisotropy;
    map.needsUpdate = true;
    return map;
  }
  const [ao, gi] = await Promise.all([texture(`lumiere-ao-${size}.webp`), texture(`lumiere-gi-${size / 2}.webp`)]);
  return { ao, gi, size, info };
}

function prepareKitModel(model, anisotropy) {
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      material.envMap = null;
      material.envMapIntensity = 0.8;
      enrichir(material, { genre: 'texture' });
      for (const key of ['map', 'normalMap', 'emissiveMap', 'metalnessMap', 'roughnessMap']) {
        if (material[key]) material[key].anisotropy = anisotropy;
      }
    }
  });
  return model;
}

export async function createWorld({ renderer, scene, camera, quality = 'mid', onProgress = () => {} }) {
  const requested = typeof quality === 'string' ? quality : quality.name;
  const qualityName = NIVEAUX[requested] ? requested : 'mid';
  const level = { ...NIVEAUX[qualityName], ...(typeof quality === 'object' ? quality : {}) };
  const reduced = qualityName === 'low';
  const anisotropy = Math.min(reduced ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  const stats = { quality: qualityName, glb: false, stationLevel: 1, missingAssets: [], atlas: false, colliders: 0 };
  const worldGroup = new THREE.Group();
  worldGroup.name = 'kepler_eva_world';
  scene.add(worldGroup);
  onProgress(0.03, 'Assemblage de Kepler-9');

  const getModel = async (path, progress = () => {}) => {
    let model;
    try { model = await chargerGlb(new URL(`assets/${path}`, document.baseURI).href, progress); }
    catch (error) { throw new Error(`Modèle Kepler illisible : ${path}. ${error.message}`); }
    if (!model) { stats.missingAssets.push(path); throw new Error(`Modèle Kepler manquant : ${path}`); }
    return model;
  };
  const stationPromise = getModel('station.glb', (progress) => onProgress(0.05 + progress * 0.34, 'Structure de la station'));
  const astronautPromise = getModel(`kit/astronaute${reduced ? '-bas' : ''}.glb`);
  const consolePromise = getModel(`kit/console-controle${reduced ? '-bas' : ''}.glb`);
  const benchPromise = getModel(`kit/banc-lampadaire${reduced ? '-bas' : ''}.glb`);
  // Attacher immédiatement les rejets, même pendant les cuissons GPU du fond.
  const modelResultsPromise = Promise.allSettled([stationPromise, astronautPromise, consolePromise, benchPromise]);
  const atlasPromise = loadAtlas(reduced ? 1024 : 2048, anisotropy).catch((error) => {
    stats.missingAssets.push(error.message);
    console.warn('[Kepler EVA]', error.message);
    return null;
  });

  const geo = creerGeometrie();
  const sunDirection = geo.soleil(126 * Math.PI / 180);
  const profile = profilAnneaux();
  const sky = creerCiel(renderer, level, geo.rayonSoleil);
  const localDirection = geo.d.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), geo.normale).invert());
  const planet = creerPlanete(renderer, geo, level, profile, level.cube, {
    lonFace: Math.atan2(localDirection.z, localDirection.x) * 180 / Math.PI - 12,
  });
  const rings = creerAnneaux(geo, profile);
  onProgress(0.1, 'Nuages et anneaux de la géante');
  await frame();
  sky.cuire();
  await frame();
  planet.cuire();
  worldGroup.add(sky.groupe, planet.sphere, planet.atmo, rings.mesh);
  // Le disque solaire vient du shader du ciel ; l'effet plein écran n'est pas nécessaire en TPS.
  sky.eclat.visible = false;
  planet.uniforms.uSoleil.value.copy(sunDirection);
  rings.uniforms.uSoleil.value.copy(sunDirection);
  sky.uniformsFond.uSoleil.value.copy(sunDirection);
  sky.uniformsFond.uFond.value = 0.6;
  planet.uniforms.uEclat.value = 1.05;
  planet.atmoUniforms.uEclat.value = 1.05;

  const modelResults = await modelResultsPromise;
  const failedModel = modelResults.find((result) => result.status === 'rejected');
  if (failedModel) throw failedModel.reason;
  const [root, astronaut, consoleModel, benchModel] = modelResults.map((result) => result.value);
  stats.glb = true;
  root.updateMatrixWorld(true);
  const requireZone = (name) => {
    const object = root.getObjectByName(name);
    if (!object) throw new Error(`Zone Kepler absente : ${name}`);
    return object;
  };
  const zones = Object.fromEntries(['moyeu', 'quai', 'forge', 'panneaux_solaires', 'serre', 'anneau_rotatif', 'observatoire', 'antennes'].map((name) => [name, requireZone(name)]));
  // Les liaisons restent solidaires de la zone construite, avant toute fusion des maillages.
  for (const [part, zone] of [
    ['observatoire_liaison', 'observatoire'], ['serre_liaison', 'serre'],
    ['moyeu_conduit', 'forge'], ['emissif_conduit', 'forge'], ['moyeu_modules', 'forge'],
  ]) {
    const object = root.getObjectByName(part);
    if (object) zones[zone].attach(object);
  }
  const fallbackEnvironment = creerEnvironnement(renderer, geo, sunDirection);
  scene.environment = fallbackEnvironment;
  const station = creerStation(root, geo, fallbackEnvironment, { estGlb: true, tempsReduit: false, anisotropie: anisotropy });
  worldGroup.add(station.groupe);
  station.fixerAngle(0);

  // Wrapper à avant local -Z. Le GLB intérieur conserve son retournement Y original.
  const shipModel = requireZone('navette');
  const ship = new THREE.Group();
  ship.name = 'ship_player';
  ship.position.copy(shipModel.getWorldPosition(new THREE.Vector3()));
  worldGroup.add(ship);
  ship.attach(shipModel);
  const originalShipPose = { position: ship.position.clone(), quaternion: ship.quaternion.clone() };
  stats.shipBounds = new THREE.Box3().setFromObject(ship).getSize(new THREE.Vector3()).toArray();

  const atlas = await atlasPromise;
  prepareKitModel(astronaut, anisotropy);
  prepareKitModel(consoleModel, anisotropy);
  prepareKitModel(benchModel, anisotropy);
  const habitatRoom = createHabitat({ consoleModel, benchModel, shadows: !reduced });
  station.groupe.add(habitatRoom.group);
  const { habitat, airlockPosition, baseSpawn } = habitatRoom;
  const dockPosition = new THREE.Vector3(7.8, 1.1, 47);
  const shipAnchor = new THREE.Vector3(5.8, 1.1, 46.5);

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.42, 3.8), new THREE.MeshStandardMaterial({
    color: '#26333b', roughness: 0.53, metalness: 0.6,
  }));
  bridge.name = 'passerelle_sas';
  bridge.position.set(7.6, -0.21, 47);
  bridge.userData.solid = true;
  station.groupe.add(bridge);
  const dockLamp = new THREE.PointLight('#ffbc75', 85, 38, 2);
  dockLamp.position.set(7.5, 5.2, 46);
  station.groupe.add(dockLamp);

  const kit = creerKit(root, { env: null, bas: reduced, anisotropie: anisotropy });
  onProgress(0.7, 'Équipement, jardin et ateliers');
  await kit.charger(null, baseSpawn.position, { parallele: true });
  kit.animer(0, 0, null);
  stats.kit = kit.etat;
  if (kit.etat.erreurs) stats.missingAssets.push(`${kit.etat.erreurs} modèle(s) du kit non chargé(s)`);
  if (atlas) {
    let fingerprint;
    try { fingerprint = JSON.parse(root.userData.lumiere_uv || 'null')?.empreinte; } catch { fingerprint = null; }
    if (!fingerprint || fingerprint === atlas.info.empreinte_uv) {
      U_LUMIERE.tLumiere.value = atlas.ao;
      U_LUMIERE.tLumiereGI.value = atlas.gi;
      U_LUMIERE.uGIMax.value = atlas.info.gi_max;
      U_LUMIERE.uForceAO.value = 1;
      U_LUMIERE.uForceGI.value = 1;
      U_LUMIERE.uTailleLum.value = atlas.size;
      stats.atlas = { size: atlas.size, fingerprint: atlas.info.empreinte_uv };
    } else {
      stats.missingAssets.push('Atlas incompatible avec les UV du modèle');
      console.warn('[Kepler EVA] Atlas incompatible avec les UV du modèle');
    }
  }

  const lightTarget = new THREE.Object3D();
  lightTarget.position.set(0, 0, 25);
  worldGroup.add(lightTarget);
  const sunlight = new THREE.DirectionalLight('#fff0d7', 3.1);
  sunlight.position.copy(sunDirection).multiplyScalar(400);
  sunlight.target = lightTarget;
  const planetLight = new THREE.DirectionalLight('#e2a54f', 0.9);
  planetLight.position.copy(geo.d).multiplyScalar(-400);
  planetLight.target = lightTarget;
  const ambient = new THREE.HemisphereLight('#7a93b0', '#765032', 0.6);
  const rim = new THREE.DirectionalLight('#ffd6a6', 1.4);
  rim.position.set(-140, 125, -180);
  rim.target = lightTarget;
  worldGroup.add(sunlight, planetLight, ambient, rim);

  const reflections = creerReflets(renderer, scene, { taille: reduced ? 128 : 256, cacher: [station.groupe, ship] });
  reflections.appliquer(reflections.calculer('eva'));
  fallbackEnvironment.dispose();
  stats.reflections = reflections.etat;

  const colliders = [];
  station.groupe.updateMatrixWorld(true);
  station.groupe.traverse((mesh) => {
    if (isSolid(mesh)) { mesh.userData.solid = true; colliders.push(mesh); }
  });
  stats.colliders = colliders.length;
  const shipColliders = [];
  ship.traverse(mesh => { if (mesh.isMesh && !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(material => material.transparent)) shipColliders.push(mesh); });
  const anchors = [
    { id: 'dock', label: 'Quai de la station', position: dockPosition.clone(), minLevel: 1 },
    ...[['forge', 'Forge et générateur', 2], ['serre', 'Serre de subsistance', 3], ['anneau', 'Anneau habité', 4], ['antennes', 'Pont radio', 5]]
      .map(([id, label, minLevel]) => ({ id, label, minLevel, position: requireZone(`ancre_${id}`).getWorldPosition(new THREE.Vector3()) })),
  ];
  function setStationLevel(nextLevel) {
    const number = Math.max(1, Math.min(5, Math.floor(Number(nextLevel) || 1)));
    stats.stationLevel = number;
    zones.forge.visible = number >= 2;
    zones.panneaux_solaires.visible = number >= 2;
    zones.serre.visible = number >= 3;
    if (station.pivotAnneau) station.pivotAnneau.visible = number >= 4;
    zones.anneau_rotatif.visible = number >= 4;
    zones.observatoire.visible = number >= 5;
    zones.antennes.visible = number >= 5;
    const effects = station.groupe.getObjectByName('effets_station');
    if (effects) {
      for (const effect of effects.children) {
        effect.visible = effect.isSprite ? number >= 2 : effect.isPoints ? number >= 3 : number >= 5;
      }
    }
    for (const anchor of anchors) anchor.available = number >= anchor.minLevel;
    stats.visibleZones = ['moyeu', 'quai', 'habitat_starter', ...Object.entries(zones).filter(([name, object]) => !['moyeu', 'quai'].includes(name) && object.visible).map(([name]) => name)];
    station.groupe.updateMatrixWorld(true);
    return number;
  }
  setStationLevel(1);
  const shaderInfo = { camera: camera.position, signal: 0.6, pixel: renderer.getPixelRatio() };
  onProgress(1, 'Sas opérationnel');
  let disposed = false;
  return {
    station, colliders, shipColliders, habitat, airlockPosition, baseSpawn,
    spawn: baseSpawn,
    introPose: { position: new THREE.Vector3(91, 42, 138), lookAt: new THREE.Vector3(5, -5, 5) },
    anchors, dockPosition, shipAnchor, ship, originalShipPose,
    astronautTemplate: astronaut,
    setStationLevel,
    setShipPose(position, quaternion) {
      if (position?.isVector3) ship.position.copy(position);
      else if (Array.isArray(position)) ship.position.fromArray(position);
      if (quaternion?.isQuaternion) ship.quaternion.copy(quaternion);
      else if (Array.isArray(quaternion)) ship.quaternion.fromArray(quaternion);
      ship.updateMatrixWorld(true);
    },
    setShipVisible(visible) { ship.visible = Boolean(visible); },
    update(dt, time, currentCamera = camera) {
      if (disposed) return;
      planet.uniforms.uTemps.value = time;
      rings.uniforms.uTemps.value = time;
      sky.uniformsEtoiles.uTemps.value = time;
      sky.uniformsEtoiles.uPixel.value = renderer.getPixelRatio();
      shaderInfo.camera = currentCamera.position;
      shaderInfo.pixel = renderer.getPixelRatio();
      shaderInfo.signal = stats.stationLevel >= 5 ? 0.6 : 0;
      station.animer(time, dt, shaderInfo);
      kit.animer(time, dt, currentCamera.position);
      const effects = station.groupe.getObjectByName('effets_station');
      if (effects) for (const effect of effects.children) {
        if (effect.isSprite && stats.stationLevel < 2) effect.visible = false;
        if (effect.isPoints && stats.stationLevel < 3) effect.visible = false;
        if (!effect.isSprite && !effect.isPoints && stats.stationLevel < 5) effect.visible = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set(), materials = new Set(), textures = new Set();
      for (const object of [worldGroup, astronaut, consoleModel, benchModel]) object.traverse((mesh) => {
        if (mesh.geometry) geometries.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
          materials.add(material);
          for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        }
      });
      worldGroup.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      atlas?.ao.dispose();
      atlas?.gi.dispose();
      planet.rt.dispose();
      profile.dispose();
      reflections.dispose();
      scene.environment = null;
    },
    stats,
  };
}
