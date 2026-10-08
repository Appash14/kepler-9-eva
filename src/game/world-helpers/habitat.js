import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Le module neuf reste à taille humaine ; les structures principales viennent du GLB Kepler.
export function createHabitat({ consoleModel, benchModel, shadows = true }) {
  const group = new THREE.Group();
  group.name = 'habitat_starter';
  group.position.set(17, 0, 47);
  const colliders = [];
  const details = new THREE.Group();
  details.name = 'effets_station_habitat_details';
  group.add(details);
  const materials = {
    shell: new THREE.MeshStandardMaterial({ color: '#d4c9b8', roughness: 0.72, metalness: 0.18 }),
    floor: new THREE.MeshStandardMaterial({ color: '#263b48', roughness: 0.74, metalness: 0.3 }),
    trim: new THREE.MeshStandardMaterial({ color: '#b87742', roughness: 0.3, metalness: 0.87 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1b2d3a', roughness: 0.5, metalness: 0.55 }),
    textile: new THREE.MeshStandardMaterial({ color: '#40566a', roughness: 0.92, metalness: 0 }),
    ivory: new THREE.MeshStandardMaterial({ color: '#f0dcc1', roughness: 0.88 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#ffda91', emissive: '#ffbc66', emissiveIntensity: 2.1 }),
    blue: new THREE.MeshStandardMaterial({ color: '#83b9c7', emissive: '#528ba2', emissiveIntensity: 0.65 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#b6d2d1', transparent: true, opacity: 0.1,
      roughness: 0.08, metalness: 0, transmission: 0, depthWrite: false, side: THREE.DoubleSide }),
  };
  function box(name, size, position, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), materials[material]);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.receiveShadow = true;
    mesh.castShadow = solid;
    mesh.userData.solid = solid;
    (solid ? group : details).add(mesh);
    if (solid) { mesh.userData.solid = true; colliders.push(mesh); }
    return mesh;
  }
  // Sol, plafond et panneaux de façade avec une baie sur les anneaux de la géante.
  box('habitat_sol', [14, 0.42, 14], [0, -0.21, 0], 'floor');
  box('habitat_plafond', [14.1, 0.35, 14.1], [0, 6.55, 0], 'shell');
  box('habitat_mur_est', [0.36, 6.4, 14], [7, 3.2, 0], 'shell');
  box('habitat_mur_nord', [14, 6.4, 0.36], [0, 3.2, 7], 'shell');
  // Porte de 3.8 m vers le quai, dégagée jusqu'à 4 m de haut.
  box('sas_pilier_avant', [0.4, 6.4, 5.1], [-7, 3.2, -4.45], 'shell');
  box('sas_pilier_arriere', [0.4, 6.4, 5.1], [-7, 3.2, 4.45], 'shell');
  box('sas_linteau', [0.4, 2.2, 3.8], [-7, 5.3, 0], 'shell');
  box('sas_montant_01', [0.22, 4.2, 0.22], [-7.12, 2.1, -2], 'trim');
  box('sas_montant_02', [0.22, 4.2, 0.22], [-7.12, 2.1, 2], 'trim');
  box('sas_eclairage', [0.1, 0.09, 3.7], [-7.22, 4.12, 0], 'lamp', false);
  box('sas_rail_gauche', [3.5, 0.06, 0.08], [-5.4, 0.03, -1.87], 'lamp', false);
  box('sas_rail_droit', [3.5, 0.06, 0.08], [-5.4, 0.03, 1.87], 'lamp', false);
  box('baie_soubassement', [14, 0.8, 0.36], [0, 0.4, -7], 'shell');
  box('baie_linteau', [14, 1.1, 0.36], [0, 5.85, -7], 'shell');
  box('baie_extremite_01', [1.4, 4.5, 0.36], [-6.3, 3.05, -7], 'shell');
  box('baie_extremite_02', [1.4, 4.5, 0.36], [6.3, 3.05, -7], 'shell');
  box('baie_verre', [11.2, 4.5, 0.04], [0, 3.05, -7], 'glass', false);
  box('baie_joint_vertical', [0.14, 4.5, 0.18], [0, 3.05, -7.05], 'trim');
  for (const x of [-5.7, -3.8, -1.9, 1.9, 3.8, 5.7]) {
    box(`baie_cadre_${x}`, [0.09, 4.5, 0.11], [x, 3.05, -7.05], 'dark');
  }
  // Rythme des panneaux, poutres de cuivre, éclairage chaud local.
  for (const z of [-5.4, -1.8, 1.8, 5.4]) {
    box(`plafond_traverse_${z}`, [13.4, 0.18, 0.14], [0, 6.27, z], 'trim');
    box(`lumiere_plafond_${z}`, [4.2, 0.05, 0.12], [1.1, 6.14, z], 'lamp', false);
    box(`mur_est_joint_${z}`, [0.1, 5.3, 0.08], [6.79, 3.1, z], 'dark', false);
  }
  for (let z = -6; z <= 6; z += 1.5) {
    box(`sol_joint_${z}`, [13.3, 0.015, 0.02], [0, 0.009, z], 'dark', false);
  }
  box('plinthe_nord', [13.5, 0.15, 0.14], [0, 0.12, 6.78], 'trim');
  box('plinthe_est', [0.14, 0.15, 13.5], [6.78, 0.12, 0], 'trim');
  // Cadre extérieur : les panneaux restent sur le volume actuel, le passage du sas reste libre.
  for (const x of [-7.08, 7.08]) for (const z of [-7.08, 7.08]) {
    box(`coque_angle_x_${x}_${z}`, [0.35, 6.45, 0.12], [x, 3.22, z], 'dark', false);
    box(`coque_angle_z_${x}_${z}`, [0.12, 6.45, 0.35], [x, 3.22, z], 'trim', false);
    box(`coque_pied_${x}_${z}`, [0.55, 0.38, 0.55], [x, -0.36, z], 'dark', false);
  }
  for (const y of [0.18, 6.42]) {
    for (const z of [-7.2, 7.2]) box(`coque_cadre_x_${y}_${z}`, [14.3, 0.2, 0.18], [0, y, z], 'trim', false);
    for (const x of [-7.2, 7.2]) {
      if (x < 0 && y < 1) {
        for (const z of [-4.5, 4.5]) box(`coque_cadre_sas_${z}`, [0.18, 0.2, 5.1], [x, y, z], 'dark', false);
      } else box(`coque_cadre_z_${y}_${x}`, [0.18, 0.2, 14.3], [x, y, 0], 'dark', false);
    }
  }
  for (const offset of [-4.6, 0, 4.6]) {
    box(`coque_panneau_est_${offset}`, [0.09, 4.9, 4.32], [7.25, 3.1, offset], 'shell', false);
    box(`coque_panneau_nord_${offset}`, [4.32, 4.9, 0.09], [offset, 3.1, 7.25], 'shell', false);
    box(`coque_nervure_est_${offset}`, [0.2, 0.11, 3.55], [7.34, 4.7, offset], 'trim', false);
    box(`coque_nervure_nord_${offset}`, [3.55, 0.11, 0.2], [offset, 4.7, 7.34], 'trim', false);
  }
  box('radiateur_module_base', [3.8, 2.5, 0.16], [-3.7, 2.65, 7.4], 'dark', false);
  for (let i = 0; i < 7; i++) {
    box(`radiateur_module_ailette_${i}`, [3.45, 0.14, 0.3], [-3.7, 1.7 + i * 0.3, 7.53], 'trim', false);
  }
  for (const x of [-4.2, 0, 4.2]) {
    box(`toit_service_socle_${x}`, [2.4, 0.1, 1.7], [x, 6.79, 1.4], 'dark', false);
    box(`toit_service_capot_${x}`, [2.05, 0.16, 1.35], [x, 6.9, 1.4], 'shell', false);
  }
  // Soubassements marine et rails de plafond : un contraste de matériaux sans changer les murs.
  box('habitat_panneau_marine_est', [0.06, 1.22, 12.8], [6.78, 0.68, 0], 'dark', false);
  box('habitat_panneau_marine_nord', [12.8, 1.22, 0.06], [0, 0.68, 6.78], 'dark', false);
  box('habitat_rail_est', [0.08, 0.08, 12.8], [6.74, 1.33, 0], 'trim', false);
  box('habitat_rail_nord', [12.8, 0.08, 0.08], [0, 1.33, 6.74], 'trim', false);
  box('sas_temoin_pression', [0.06, 0.2, 0.45], [-7.28, 4.46, 0], 'blue', false);

  // Couchette et caisse : objets posés au sol, proportions humaines.
  box('couchette_socle', [2.2, 0.43, 3.9], [4.5, 0.215, 3.9], 'dark');
  box('couchette_matelas', [2.1, 0.25, 3.65], [4.5, 0.58, 3.88], 'textile');
  box('couchette_oreiller', [1.35, 0.16, 0.64], [4.5, 0.81, 5.12], 'ivory');
  box('couchette_drap', [2.13, 0.055, 2.3], [4.5, 0.735, 3.1], 'ivory', false);
  box('vestiaire', [1.3, 3.1, 0.8], [-4.2, 1.55, 6.3], 'dark');
  box('vestiaire_facade', [1.1, 2.85, 0.055], [-4.2, 1.55, 5.87], 'shell');
  box('vestiaire_poignee', [0.07, 0.45, 0.08], [-3.82, 1.5, 5.79], 'trim', false);
  box('table_rations', [2.4, 0.12, 1.1], [-1.4, 1.3, 5.9], 'shell');
  for (const x of [-2.35, -0.45]) box(`table_pied_${x}`, [0.13, 1.3, 0.65], [x, 0.65, 5.9], 'dark');
  for (let i = 0; i < 3; i++) box(`ration_${i}`, [0.22, 0.12, 0.36], [-1.95 + i * 0.5, 1.42, 5.9], i === 1 ? 'trim' : 'ivory', false);
  const lamp = new THREE.PointLight('#ffd3a0', 44, 18, 2);
  lamp.position.set(0, 4.6, -0.3);
  group.add(lamp);
  const secondLamp = new THREE.PointLight('#ffcb92', 22, 12, 2);
  secondLamp.position.set(4.2, 2.6, 4.8);
  group.add(secondLamp);
  const spot = new THREE.SpotLight('#ffdfb3', 105, 17, 0.98, 0.45, 2);
  spot.name = 'habitat_spot';
  spot.position.set(-2.4, 5.9, 1.6);
  spot.target.name = 'habitat_spot_target';
  spot.target.position.set(0.2, 0.1, -0.2);
  spot.castShadow = shadows;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.4;
  spot.shadow.camera.far = 17;
  spot.shadow.bias = -0.0002;
  spot.shadow.normalBias = 0.025;
  group.add(spot, spot.target);

  function placeKit(source, name, height, position, rotation = 0) {
    if (!source) return;
    const object = source.clone(true);
    object.name = name;
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    object.scale.multiplyScalar(height / Math.max(size.y, 0.01));
    object.rotation.y += rotation;
    const bounds = new THREE.Box3().setFromObject(object);
    const center = bounds.getCenter(new THREE.Vector3());
    object.position.x -= center.x;
    object.position.y -= bounds.min.y;
    object.position.z -= center.z;
    const wrapper = new THREE.Group();
    wrapper.position.set(...position);
    wrapper.add(object);
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.userData.solid = true;
      mesh.castShadow = mesh.receiveShadow = true;
      colliders.push(mesh);
    });
    group.add(wrapper);
  }
  placeKit(consoleModel, 'console_habitat', 1.8, [4.4, 0, -4.5], -0.3);
  placeKit(benchModel, 'banc_habitat', 2.5, [-3.1, 0, -4.1], 0.32);
  // Un lot par matériau pour les détails, aucun nouveau mesh dans les colliders.
  const detailBatches = new Map();
  for (const mesh of details.children) {
    if (!mesh.isMesh || mesh.material.transparent) continue;
    mesh.updateMatrix();
    const transformed = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    if (!detailBatches.has(mesh.material)) detailBatches.set(mesh.material, []);
    detailBatches.get(mesh.material).push(transformed);
  }
  for (const [material, geometries] of detailBatches) {
    const geometry = mergeGeometries(geometries, false);
    for (const part of geometries) part.dispose();
    if (!geometry) continue;
    const originals = details.children.filter((mesh) => mesh.isMesh && mesh.material === material);
    for (const mesh of originals) { details.remove(mesh); mesh.geometry.dispose(); }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `habitat_details_${material.color.getHexString()}`;
    mesh.receiveShadow = true;
    mesh.userData.solid = false;
    details.add(mesh);
  }
  group.updateMatrixWorld(true);
  return {
    group, colliders, shadowLight: spot,
    habitat: {
      min: new THREE.Vector3(10.4, 0, 40.4),
      max: new THREE.Vector3(23.6, 6.1, 53.6),
      floorY: 0,
      door: { minZ: 45.5, maxZ: 48.5, minY: 0, maxY: 2.5, minX: 9.4 },
      center: new THREE.Vector3(17, 3.05, 47),
    },
    airlockPosition: new THREE.Vector3(10.7, 0.05, 47),
    baseSpawn: { position: new THREE.Vector3(17, 0.05, 49), lookAt: new THREE.Vector3(10.7, 1.2, 47) },
  };
}
