import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, restoreSave } from '../src/game/simulation.js';

test('sortie, loot, retour puis construction consomment le vrai inventaire', () => {
  const sim = createSimulation();
  assert.equal(sim.build(true).ok, false);
  sim.loot('cargo-0', { metal: 6, crystal: 2 });
  assert.equal(sim.build(false).ok, false);
  assert.equal(sim.build(true).ok, true);
  assert.equal(sim.state.level, 2);
  assert.equal(sim.state.inventory.metal, 0);
  assert.equal(sim.state.inventory.crystal, 0);
  assert.equal(sim.loot('cargo-0', { metal: 100 }).ok, false);
});

test('la survie consomme, la station recharge avec une réserve finie, une ration nourrit', () => {
  const sim = createSimulation();
  for (let i = 0; i < 200; i++) sim.tick(1, { mode: 'ship', moving: true, boost: true });
  assert.ok(sim.state.oxygen < 100 && sim.state.energy < 100 && sim.state.food < 100);
  const reserve = sim.state.baseEnergy;
  sim.tick(1, { atBase: true });
  assert.ok(sim.state.baseEnergy < reserve);
  sim.state.food = 50;
  const rations = sim.state.inventory.rations;
  assert.equal(sim.eat().ok, true);
  assert.equal(sim.state.food, 85);
  assert.equal(sim.state.inventory.rations, rations - 1);
});

test('sauvegarde restaure progression, loot et ressources ; entrée invalide bornée', () => {
  const sim = createSimulation();
  sim.loot('cargo-2', { metal: 40, crystal: 12, fuel: 3 });
  sim.build(true); sim.build(true);
  const restored = createSimulation(sim.serialize());
  assert.equal(restored.state.level, 3);
  assert.deepEqual(restored.state.inventory, sim.state.inventory);
  assert.equal(restored.loot('cargo-2', { metal: 30 }).ok, false);
  const safe = restoreSave({ version: 1, level: 999, oxygen: -100, inventory: { metal: Infinity }, looted: { invalid: -4 } });
  assert.equal(safe.level, 5); assert.equal(safe.oxygen, 0); assert.equal(safe.inventory.metal, 0);
  assert.deepEqual(safe.looted, {});
});

test('la serre produit, les cargos reviennent, les secours pénalisent le stock', () => {
  const sim = createSimulation();
  sim.state.level = 3;
  sim.loot('cargo-0', { metal: 20, crystal: 10 });
  const food = sim.state.inventory.rations;
  for (let i = 0; i < 241; i++) sim.tick(1, { atBase: true });
  assert.equal(sim.state.inventory.rations, food + 3);
  assert.equal(sim.loot('cargo-0', { metal: 4 }).ok, true);
  sim.state.oxygen = 0;
  const metals = sim.state.inventory.metal;
  assert.equal(sim.tick(1, { atBase: false }).rescue, true);
  assert.ok(sim.state.inventory.metal < metals);
  assert.ok(sim.state.oxygen > 0);
});
