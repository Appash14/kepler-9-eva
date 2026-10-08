export const SAVE_KEY = 'kepler-eva-save-v1';
export const UPGRADES = [
  { level: 2, name: 'Réacteur et panneaux solaires', description: 'Une réserve électrique autonome et une recharge plus rapide.', cost: { metal: 10, crystal: 2 } },
  { level: 3, name: 'Serre', description: 'Cultive des rations pour les prochaines sorties.', cost: { metal: 16, crystal: 4 } },
  { level: 4, name: 'Anneau habité', description: 'Agrandit la station et ses réserves de survie.', cost: { metal: 24, crystal: 6, fuel: 2 } },
  { level: 5, name: 'Observatoire et relais', description: 'Achève la station et ouvre les sorties lointaines.', cost: { metal: 30, crystal: 10, fuel: 3 } },
];

const clamp = (n, a, b) => Math.min(b, Math.max(a, Number.isFinite(n) ? n : a));
const initial = () => ({
  version: 1, level: 1, oxygen: 100, energy: 100, food: 100, hull: 100,
  baseEnergy: 80, inventory: { metal: 4, crystal: 0, fuel: 2, rations: 3 },
  looted: {}, elapsed: 0, rescues: 0, collected: 0, harvest: 0, savedAt: 0,
});

export function restoreSave(value) {
  const state = initial();
  if (!value || value.version !== 1) return state;
  state.level = Math.floor(clamp(value.level, 1, 5));
  for (const key of ['oxygen', 'energy', 'food', 'hull', 'baseEnergy']) {
    if (Number.isFinite(value[key])) state[key] = clamp(value[key], 0, 100);
  }
  for (const key of Object.keys(state.inventory)) state.inventory[key] = Math.floor(clamp(value.inventory?.[key] ?? state.inventory[key], 0, 9999));
  for (const key of ['elapsed', 'rescues', 'collected', 'harvest', 'savedAt']) state[key] = clamp(value[key] ?? 0, 0, 1e12);
  if (value.looted && typeof value.looted === 'object' && !Array.isArray(value.looted)) {
    for (const [id, at] of Object.entries(value.looted).slice(0, 64)) {
      if (/^cargo-\d{1,2}$/.test(id) && Number.isFinite(at)) state.looted[id] = clamp(at, 0, 1e12);
    }
  }
  return state;
}

export function createSimulation(saved) {
  let state = restoreSave(saved);
  const nextUpgrade = () => UPGRADES.find(u => u.level === state.level + 1) ?? null;
  const canBuild = () => {
    const upgrade = nextUpgrade();
    return !!upgrade && Object.entries(upgrade.cost).every(([key, n]) => state.inventory[key] >= n);
  };
  function build(atBase) {
    if (!atBase) return { ok: false, message: 'La construction se lance depuis la station.' };
    const upgrade = nextUpgrade();
    if (!upgrade) return { ok: false, message: 'La station est complète. Tu peux continuer les sorties.' };
    if (!canBuild()) return { ok: false, message: 'Il manque des ressources. Les cargos en contiennent.' };
    for (const [key, n] of Object.entries(upgrade.cost)) state.inventory[key] -= n;
    state.level = upgrade.level;
    state.baseEnergy = Math.min(100, state.baseEnergy + 20);
    return { ok: true, upgrade, message: upgrade.name + ' construit.' };
  }
  function loot(id, contents) {
    if (state.looted[id] != null) return { ok: false, message: 'Ce cargo est déjà vide.' };
    for (const key of Object.keys(state.inventory)) state.inventory[key] = Math.min(9999, state.inventory[key] + Math.max(0, Math.floor(contents[key] || 0)));
    state.looted[id] = state.elapsed;
    state.collected++;
    return { ok: true, message: 'Cargo récupéré.', contents };
  }
  function eat() {
    if (state.inventory.rations < 1) return { ok: false, message: 'Plus de ration. Cherche un cargo ou construis la serre.' };
    if (state.food > 95) return { ok: false, message: 'Garde cette ration pour plus tard.' };
    state.inventory.rations--;
    state.food = Math.min(100, state.food + 35);
    return { ok: true, message: 'Ration consommée. Faim apaisée.' };
  }
  function refuel() {
    if (state.inventory.fuel < 1) return { ok: false, message: 'Aucun carburant dans les réserves.' };
    if (state.energy > 90) return { ok: false, message: 'La batterie est presque pleine.' };
    state.inventory.fuel--;
    state.energy = Math.min(100, state.energy + 55);
    return { ok: true, message: 'Carburant converti en énergie.' };
  }
  function rescue(reason) {
    state.inventory.metal = Math.floor(state.inventory.metal * 0.7);
    state.inventory.crystal = Math.floor(state.inventory.crystal * 0.7);
    state.oxygen = 60; state.energy = 40; state.hull = 65; state.food = Math.max(30, state.food);
    state.rescues++;
    return { rescue: true, message: reason + ' Retour de secours au sas ; une partie du métal et des cristaux est perdue.' };
  }
  function tick(dt, { atBase = false, mode = 'eva', moving = false, boost = false } = {}) {
    dt = clamp(dt, 0, 1);
    state.elapsed += dt;
    state.food = Math.max(0, state.food - dt * (moving ? 0.035 : 0.018));
    const solar = state.level >= 2 ? 0.32 : 0;
    state.baseEnergy = clamp(state.baseEnergy + dt * (solar - 0.006), 0, 100);
    if (atBase) {
      const recharge = state.level >= 2 ? 3.8 : 1.5;
      const o2 = Math.min(100 - state.oxygen, recharge * dt, state.baseEnergy * 3);
      state.oxygen += o2; state.baseEnergy = Math.max(0, state.baseEnergy - o2 / 3);
      const battery = Math.min(100 - state.energy, recharge * dt, state.baseEnergy * 4);
      state.energy += battery; state.baseEnergy = Math.max(0, state.baseEnergy - battery / 4);
      state.hull = Math.min(100, state.hull + dt * 0.5);
    } else {
      state.oxygen = Math.max(0, state.oxygen - dt * (mode === 'ship' ? 0.025 : 0.1) * (boost ? 1.5 : 1));
      state.energy = Math.max(0, state.energy - dt * (moving ? (mode === 'ship' ? 0.14 : 0.05) : 0.008) * (boost ? 3 : 1));
    }
    if (state.level >= 3) {
      state.harvest += dt;
      if (state.harvest >= 75) { state.harvest -= 75; state.inventory.rations = Math.min(9999, state.inventory.rations + 1); }
    }
    for (const [id, at] of Object.entries(state.looted)) if (state.elapsed - at >= 240) delete state.looted[id];
    if (state.food <= 0) state.hull = Math.max(0, state.hull - dt * 0.3);
    if (state.oxygen <= 0) return rescue('Oxygène épuisé.');
    if (state.energy <= 0 && !atBase) return rescue('Propulseurs à sec.');
    if (state.hull <= 0) return rescue('État critique.');
    return null;
  }
  function damage(amount) { state.hull = Math.max(0, state.hull - Math.max(0, amount)); }
  function serialize() { state.savedAt = Date.now(); return JSON.parse(JSON.stringify(state)); }
  function reset() { state = initial(); return state; }
  return { get state() { return state; }, nextUpgrade, canBuild, build, loot, eat, refuel, tick, damage, serialize, reset, emergency: rescue };
}
