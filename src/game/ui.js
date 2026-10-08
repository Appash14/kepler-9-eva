/** Kepler-9 EVA interface. Importing this module never touches the DOM. */
export function createUI(callbacks = {}) {
  const root = document.getElementById('game-ui') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'game-ui' }));
  const icon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const bag = icon('<path d="M5 7h14v14H5zM9 7V3h6v4M5 12h14"/>');
  const pause = icon('<path d="M8 5v14M16 5v14"/>');
  const close = icon('<path d="m6 6 12 12M18 6 6 18"/>');
  const arrow = icon('<path d="M4 12h15m-5-5 5 5-5 5"/>');
  const up = icon('<path d="M12 19V5m-6 6 6-6 6 6"/>');
  const down = icon('<path d="M12 5v14m-6-6 6 6 6-6"/>');
  const resources = [['oxygen', 'O₂'], ['energy', 'Énergie'], ['food', 'Nourriture'], ['hull', 'Coque']];
  const stockLabels = { metal: 'Métaux', crystal: 'Cristaux', fuel: 'Carburant', rations: 'Rations' };
  root.innerHTML = `
    <section class="eva-intro" data-ui="intro" aria-labelledby="eva-title">
      <div class="eva-intro-content">
        <h1 id="eva-title">Kepler-9 <span>EVA</span></h1>
        <p class="eva-intro-pitch">Une station inachevée et quelques réserves. Pars chercher les métaux et les cristaux qui feront vivre ta station.</p>
        <div class="eva-intro-actions">
          <button class="eva-button" data-action="start" disabled>Jouer ${arrow}</button>
          <button class="eva-button secondary" data-action="intro-help">Commandes</button>
        </div>
        <div class="eva-loading" data-ui="loading" role="status" aria-live="polite">
          <div class="eva-loading-track" role="progressbar" aria-label="Chargement de la station" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-ui="progress">
            <span class="eva-loading-fill" data-ui="loading-fill"></span>
          </div>
          <p class="eva-loading-label"><span data-ui="loading-label">Préparation de la station</span><span data-ui="loading-percent">0 %</span></p>
        </div>
        <label class="eva-sound eva-intro-sound"><input type="checkbox" data-sound> Ambiance sonore</label>
      </div>
      <div class="eva-intro-bottom">
        <p class="eva-caption">Survie orbitale.<br>Vue à la troisième personne.</p>
        <div class="eva-intro-controls">
          <div class="eva-desktop-help"><p><span class="eva-key">ZQSD</span> / <span class="eva-key">WASD</span> se déplacer</p><p>Glisser pour regarder. <span class="eva-key">E</span> interagir.</p></div>
          <p class="eva-mobile-help">Joystick à gauche.<br>Glisse à droite pour regarder.</p>
        </div>
      </div>
    </section>
    <div class="eva-look-pad" data-ui="look-pad" aria-hidden="true" hidden></div>
    <section class="eva-hud" data-ui="hud" aria-label="État de la partie" hidden>
      <div class="eva-hud-top">
        <div>
          <div class="eva-location"><span class="eva-mode" data-ui="mode">Habitat</span><span class="eva-zone" data-ui="zone">Sas</span></div>
          <div class="eva-reserves" aria-label="Réserves vitales">
            ${resources.map(([key, label]) => `<div class="eva-gauge" data-resource="${key}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><div class="eva-gauge-top"><span>${label}</span><span class="eva-gauge-value" data-value="${key}">100</span></div><div class="eva-gauge-track"><span class="eva-gauge-fill" data-fill="${key}"></span></div></div>`).join('')}
          </div>
          <div class="eva-stock-strip" aria-label="Stock">${Object.entries(stockLabels).map(([key, label]) => `<span>${label}<b data-stock="${key}">0</b></span>`).join('')}</div>
        </div>
        <div class="eva-hud-tools-group"><div class="eva-hud-tools">
          <button class="eva-icon-button" data-action="inventory" aria-label="Inventaire et construction" title="Inventaire et construction (Tab ou I)">${bag}</button>
          <button class="eva-icon-button" data-action="pause" aria-label="Pause" title="Pause (Échap)">${pause}</button>
        </div><div class="eva-navigation"><span data-ui="nav-home">Sas : 0 m</span><span data-ui="nav-cargo" hidden></span></div></div>
      </div>
      <div class="eva-reticle" aria-hidden="true"></div>
      <div class="eva-focus" data-ui="focus" hidden><div data-ui="focus-label"></div><span data-ui="distance"></span></div>
      <div class="eva-bottom">
        <ul class="eva-objectives" data-ui="objectives" aria-label="Objectifs"></ul>
        <div class="eva-flight"><p><b data-ui="speed">0,0</b> m/s</p><p>Cap sas : <span data-ui="home-distance">0 m</span></p></div>
      </div>
      <button class="eva-interact" data-action="interact" hidden><span class="eva-key eva-desktop-help">E</span><span data-ui="interact-label">Interagir</span></button>
      <div class="eva-toast" data-ui="toast" role="status" aria-live="polite" hidden></div>
    </section>
    <div class="eva-touch" data-ui="touch" hidden>
      <div class="eva-stick" data-ui="stick" role="application" aria-label="Joystick de déplacement">
        <span class="eva-touch-label">Déplacement</span><span class="eva-stick-knob" data-ui="stick-knob"></span>
      </div>
      <div class="eva-touch-look-caption">Glisser pour regarder</div>
      <div class="eva-touch-buttons">
        <button class="eva-touch-button" data-hold="up" aria-label="Sauter ou monter">${up}<span data-ui="up-label">Haut</span></button>
        <button class="eva-touch-button" data-hold="down" aria-label="Descendre">${down}</button>
        <button class="eva-touch-button eva-touch-boost" data-hold="boost" aria-label="Accélérer" aria-pressed="false">Accélérer</button>
      </div>
    </div>
    <section class="eva-menu" data-ui="menu" role="dialog" aria-modal="true" aria-label="Menu de jeu" hidden>
      <div class="eva-menu-sheet">
        <button class="eva-icon-button eva-menu-close" data-action="close-menu" aria-label="Fermer le menu">${close}</button>
        <div data-panel="pause" hidden>
          <h2>En pause</h2>
          <div class="eva-menu-actions">
            <button class="eva-button" data-action="resume">Reprendre ${arrow}</button>
            <button class="eva-button secondary" data-action="inventory">Inventaire et station</button>
            <button class="eva-button secondary" data-action="help">Commandes</button>
            <button class="eva-button secondary" data-action="reset">Secours : retour au sas</button>
            <p class="eva-menu-hint">Hors de la station, le secours coûte 30 % de ton métal et de tes cristaux.</p>
          </div>
          <div class="eva-menu-rule"></div>
          <label class="eva-sound"><input type="checkbox" data-sound> Ambiance sonore</label><br>
          <button class="eva-quiet-button" data-action="new-game">Nouvelle partie</button>
          <div class="eva-confirm" data-ui="confirm" hidden>
            <p>Repartir de zéro ? Ta station et tes réserves seront remplacées.</p>
            <div class="eva-confirm-actions"><button class="eva-button" data-action="confirm-new">Recommencer</button><button class="eva-button secondary" data-action="cancel-new">Garder ma partie</button></div>
          </div>
        </div>
        <div data-panel="inventory" hidden>
          <h2>Réserves & station</h2>
          <dl class="eva-inventory-list">${Object.entries(stockLabels).map(([key, label]) => `<div><dt>${label}</dt><dd data-inventory="${key}">0</dd></div>`).join('')}</dl>
          <div class="eva-eat-row"><p>Une ration remplit ta réserve de nourriture.</p><button class="eva-button secondary" data-action="eat" disabled>Manger</button></div>
          <div class="eva-eat-row"><p>Un carburant redonne 55 points d’énergie à la navette.</p><button class="eva-button secondary" data-action="refuel" disabled>Recharger</button></div>
          <h3>Construire</h3>
          <p class="eva-base-line">Station <span data-ui="base-level">1</span><span class="eva-base-energy" data-ui="base-energy" hidden></span></p>
          <p class="eva-base-name" data-ui="base-name">Forge et panneaux solaires</p>
          <p class="eva-base-description" data-ui="base-description" hidden></p>
          <div class="eva-base-cost" data-ui="base-cost"></div>
          <p class="eva-base-hint" data-ui="base-hint">Reviens au sas pour agrandir la station.</p>
          <button class="eva-button eva-build-button" data-action="build" disabled>Construire</button>
          <button class="eva-button secondary eva-return-button" data-action="close-menu">Retour au jeu</button>
        </div>
        <div data-panel="help" hidden>
          <h2>Commandes</h2>
          <dl class="eva-help-list">
            <div><dt>ZQSD / WASD<br>ou flèches</dt><dd>Marcher, voler ou piloter la navette.</dd></div>
            <div><dt>Cliquer et glisser</dt><dd>Tourner la caméra autour de toi.</dd></div>
            <div><dt>Espace / C</dt><dd>Sauter dans l’habitat. Monter ou descendre dans l’espace.</dd></div>
            <div><dt>Maj</dt><dd>Accélérer.</dd></div>
            <div><dt>E</dt><dd>Sas, navette et cargaisons, selon ce que tu regardes.</dd></div>
            <div><dt>Tab / I<br>Échap</dt><dd>Ouvrir tes réserves. Mettre en pause.</dd></div>
          </dl>
          <p>Sur téléphone, avance avec le joystick et glisse sur la droite de l’écran pour regarder.</p>
          <button class="eva-button secondary" data-action="close-menu">Retour</button>
        </div>
        <div data-panel="complete" hidden>
          <h2>La station vit</h2><p>Tu peux continuer à explorer et à remplir les réserves.</p>
          <button class="eva-button" data-action="resume">Continuer ${arrow}</button>
        </div>
      </div>
    </section>`;

  const $ = (name) => root.querySelector(`[data-ui="${name}"]`);
  const state = { playing: false, paused: false, panel: null, loaded: false, sound: false, mode: 'human', telemetry: { target: 'Sas', distance: 0, cargoDistance: null }, survival: { oxygen: 100, energy: 100, food: 100, hull: 100 }, interaction: { label: '', available: false }, inventory: { metal: 0, crystal: 0, fuel: 0, rations: 0 }, base: { level: 1, nextName: 'Forge et panneaux solaires', cost: {}, canBuild: false, atBase: false }, disposed: false };
  const listeners = [];
  const holds = new Map();
  let stickPointer = null;
  let lookPointer = null;
  let lookLast = null;
  let toastTimer;
  let lastFocus = null;
  const emit = (name, ...args) => { if (!state.disposed) callbacks[name]?.(...args); };
  const listen = (target, event, handler, options) => { target.addEventListener(event, handler, options); listeners.push(() => target.removeEventListener(event, handler, options)); };
  const playing = () => state.playing && !state.paused && !state.panel;
  const isInput = (target) => target instanceof Element && Boolean(target.closest('textarea, select, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"])'));

  function savedGame() {
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!/kepler.*(save|surviv|eva)/i.test(key || '')) continue;
        const value = JSON.parse(localStorage.getItem(key));
        if (value && typeof value === 'object' && ('inventory' in value || 'stationLevel' in value || 'baseLevel' in value || 'survival' in value)) return true;
      }
    } catch { /* Private browsing can deny storage; playing remains available. */ }
    return false;
  }

  function setSaveAvailable(available) {
    const button = root.querySelector('[data-action="start"]');
    button.innerHTML = `${available ? 'Continuer' : 'Jouer'} ${arrow}`;
  }
  setSaveAvailable(savedGame());

  function releasePointer(element, pointer) {
    if (pointer === null || pointer === undefined) return;
    try { if (element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer); } catch { /* Already cancelled by the browser. */ }
  }

  function clearInputs() {
    releasePointer($('stick'), stickPointer);
    releasePointer($('look-pad'), lookPointer);
    stickPointer = null;
    lookPointer = null;
    lookLast = null;
    holds.forEach(({ element, pointer }) => { element.setAttribute('aria-pressed', 'false'); releasePointer(element, pointer); });
    holds.clear();
    $('stick-knob').style.setProperty('--jx', '0px');
    $('stick-knob').style.setProperty('--jy', '0px');
    emit('onTouchMove', 0, 0);
    emit('onTouchLook', 0, 0);
    emit('onTouchVertical', 0);
    emit('onBoost', false);
  }

  function refresh() {
    $('intro').hidden = state.playing;
    $('hud').hidden = !state.playing;
    $('touch').hidden = !playing();
    $('look-pad').hidden = !playing();
    const menu = Boolean(state.panel);
    $('menu').hidden = !menu;
    root.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== state.panel; });
    $('menu').setAttribute('aria-label', state.panel === 'inventory' ? 'Inventaire et construction' : state.panel === 'help' ? 'Commandes' : state.panel === 'complete' ? 'Station achevée' : 'Jeu en pause');
    $('confirm').hidden = true;
    if (menu) {
      const activePanel = root.querySelector(`[data-panel="${state.panel}"]`);
      queueMicrotask(() => { if (!state.disposed && state.panel) activePanel?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true }); });
    }
  }

  function openPanel(panel) {
    lastFocus = document.activeElement;
    clearInputs();
    state.panel = panel;
    if (state.playing && !state.paused) {
      state.paused = true;
      emit('onPause');
    }
    refresh();
  }

  function closePanel() {
    const wasPlaying = state.playing;
    state.panel = null;
    state.paused = false;
    clearInputs();
    refresh();
    if (wasPlaying) {
      emit('onResume');
      document.getElementById('scene')?.focus({ preventScroll: true });
    } else lastFocus?.focus?.({ preventScroll: true });
  }

  function setPlaying(value) {
    if (state.playing === Boolean(value)) return;
    state.playing = Boolean(value);
    state.paused = false;
    state.panel = null;
    clearInputs();
    refresh();
    if (state.playing) document.getElementById('scene')?.focus({ preventScroll: true });
  }

  function setPaused(value) {
    if (state.paused === Boolean(value)) return;
    state.paused = Boolean(value);
    if (state.paused) {
      clearInputs();
      if (!state.panel && state.playing) state.panel = 'pause';
    } else state.panel = null;
    refresh();
  }

  function setBase(base = {}) {
    Object.assign(state.base, base);
    const { level, nextName, cost, canBuild, atBase, description, energy } = state.base;
    const complete = Number(level) >= 5 || !nextName;
    $('base-level').textContent = String(Math.max(1, Math.floor(Number(level) || 1)));
    $('base-name').textContent = complete ? 'Station achevée' : nextName;
    $('base-description').hidden = !description;
    $('base-description').textContent = description || '';
    $('base-energy').hidden = energy === undefined;
    $('base-energy').textContent = energy === undefined ? '' : `Générateur ${Math.round(Number(energy) || 0)} %`;
    $('base-cost').replaceChildren();
    for (const [key, amount] of Object.entries(cost || {})) {
      if (!stockLabels[key] || !(Number(amount) > 0)) continue;
      const item = document.createElement('span');
      const number = document.createElement('b');
      number.textContent = `${amount} `;
      item.append(number, document.createTextNode(stockLabels[key].toLowerCase()));
      $('base-cost').append(item);
    }
    const build = root.querySelector('[data-action="build"]');
    build.disabled = complete || !canBuild || !atBase;
    build.textContent = complete ? 'Station achevée' : 'Construire';
    $('base-hint').textContent = complete ? 'Toutes les installations sont en service.' : !atBase ? 'Reviens au sas pour construire.' : !canBuild ? 'Il manque des ressources dans tes réserves.' : 'Les ressources seront prises dans ton stock.';
  }

  function setInventory(inventory = {}) {
    for (const key of Object.keys(stockLabels)) {
      if (inventory[key] !== undefined) state.inventory[key] = Math.max(0, Number(inventory[key]) || 0);
      const value = String(Math.floor(state.inventory[key]));
      root.querySelector(`[data-stock="${key}"]`).textContent = value;
      root.querySelector(`[data-inventory="${key}"]`).textContent = value;
    }
    root.querySelector('[data-action="eat"]').disabled = state.inventory.rations < 1;
    root.querySelector('[data-action="refuel"]').disabled = state.inventory.fuel < 1 || state.survival.energy >= 90;
  }

  function setSurvival(survival = {}) {
    for (const [key] of resources) {
      if (survival[key] === undefined) continue;
      const value = Math.max(0, Math.min(100, Number(survival[key]) || 0));
      state.survival[key] = value;
      const gauge = root.querySelector(`[data-resource="${key}"]`);
      gauge.setAttribute('aria-valuenow', String(Math.round(value)));
      gauge.classList.toggle('low', value <= 20);
      root.querySelector(`[data-value="${key}"]`).textContent = String(Math.ceil(value));
      root.querySelector(`[data-fill="${key}"]`).style.width = `${value}%`;
    }
    root.querySelector('[data-action="refuel"]').disabled = state.inventory.fuel < 1 || state.survival.energy >= 90;
  }

  function setMode(mode) {
    const changed = state.mode !== mode;
    state.mode = mode;
    const names = { human: 'Habitat', eva: 'EVA', ship: 'Pilotage' };
    $('mode').textContent = names[mode] || String(mode || 'EVA');
    $('up-label').textContent = mode === 'human' ? 'Saut' : 'Haut';
    root.querySelector('[data-hold="up"]').setAttribute('aria-label', mode === 'human' ? 'Sauter' : 'Monter');
    root.querySelector('[data-hold="down"]').disabled = mode === 'human';
    if (changed) clearInputs();
  }

  function setTelemetry(telemetry = {}) {
    Object.assign(state.telemetry, telemetry);
    const { speed, distance, zone, target, cargoDistance } = state.telemetry;
    const meters = (value) => value !== null && Number.isFinite(Number(value)) ? `${Math.max(0, Math.round(Number(value)))} m` : '';
    if (speed !== undefined) $('speed').textContent = Math.max(0, Number(speed) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    $('home-distance').textContent = meters(distance);
    $('nav-home').textContent = `Sas : ${meters(distance)}`;
    $('nav-cargo').hidden = !meters(cargoDistance);
    $('nav-cargo').textContent = `Cargo : ${meters(cargoDistance)}`;
    $('distance').textContent = target === 'Cargo' ? `Cargo : ${meters(cargoDistance)}` : `Sas : ${meters(distance)}`;
    if (zone !== undefined) $('zone').textContent = String(zone || 'Espace');
  }

  function setInteraction(interaction = {}) {
    Object.assign(state.interaction, interaction);
    const label = String(state.interaction.label || '');
    $('focus-label').textContent = label;
    $('focus').hidden = !label || !state.interaction.available;
    root.querySelector('[data-action="interact"]').hidden = !state.interaction.available;
    $('interact-label').textContent = label.replace(/^E\\s*[:·]\\s*/i, '') || 'Interagir';
  }

  function setObjectives(objectives = []) {
    $('objectives').replaceChildren();
    let current = false;
    for (const objective of objectives) {
      const li = document.createElement('li');
      li.textContent = String(objective.label || '');
      li.classList.toggle('done', Boolean(objective.done));
      if (!objective.done && !current) { li.classList.add('current'); current = true; }
      if (objective.id !== undefined) li.dataset.objective = String(objective.id);
      $('objectives').append(li);
    }
  }

  function setLoading(progress, label = 'Chargement de la station') {
    const raw = Number(progress) || 0;
    const percent = Math.max(0, Math.min(100, raw <= 1 ? raw * 100 : raw));
    $('progress').setAttribute('aria-valuenow', String(Math.round(percent)));
    $('loading-fill').style.width = `${percent}%`;
    $('loading-percent').textContent = `${Math.round(percent)} %`;
    $('loading-label').textContent = String(label);
  }

  function ready() {
    state.loaded = true;
    setLoading(1, 'Station prête');
    root.querySelector('[data-action="start"]').disabled = false;
  }

  function toast(text, duration = 4200) {
    clearTimeout(toastTimer);
    $('toast').textContent = String(text || '');
    $('toast').hidden = !text;
    toastTimer = setTimeout(() => { if (!state.disposed) $('toast').hidden = true; }, duration);
  }

  const actions = {
    start: () => { if (state.loaded) emit('onStart'); },
    'intro-help': () => openPanel('help'),
    pause: () => openPanel('pause'),
    resume: closePanel,
    inventory: () => state.panel === 'inventory' ? closePanel() : openPanel('inventory'),
    help: () => openPanel('help'),
    'close-menu': closePanel,
    interact: () => { if (playing() && state.interaction.available) emit('onInteract'); },
    reset: () => { clearInputs(); emit('onReset'); closePanel(); },
    eat: () => { if (state.inventory.rations >= 1) emit('onEat'); },
    refuel: () => { if (state.inventory.fuel >= 1 && state.survival.energy < 90) emit('onRefuel'); },
    build: () => { if (state.base.canBuild && state.base.atBase && state.base.nextName) emit('onBuild'); },
    'new-game': () => { $('confirm').hidden = false; root.querySelector('[data-action="confirm-new"]').focus(); },
    'cancel-new': () => { $('confirm').hidden = true; root.querySelector('[data-action="new-game"]').focus(); },
    'confirm-new': () => { $('confirm').hidden = true; clearInputs(); emit('onNewGame'); closePanel(); },
  };
  root.querySelectorAll('[data-action]').forEach((button) => {
    listen(button, 'click', (event) => { event.stopPropagation(); actions[button.dataset.action]?.(); });
    listen(button, 'pointerdown', (event) => event.stopPropagation());
  });
  root.querySelectorAll('[data-sound]').forEach((input) => listen(input, 'change', () => {
    state.sound = input.checked;
    root.querySelectorAll('[data-sound]').forEach((element) => { element.checked = state.sound; });
    emit('onSound', state.sound);
  }));
  listen($('menu'), 'pointerdown', (event) => event.stopPropagation());
  listen($('intro'), 'pointerdown', (event) => event.stopPropagation());

  function stickMove(event) {
    if (!playing() || event.pointerId !== stickPointer) return;
    const rect = $('stick').getBoundingClientRect();
    const radius = Math.max(1, rect.width / 2 - 21);
    let x = (event.clientX - rect.left - rect.width / 2) / radius;
    let y = (event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    $('stick-knob').style.setProperty('--jx', `${x * radius}px`);
    $('stick-knob').style.setProperty('--jy', `${y * radius}px`);
    emit('onTouchMove', x, y);
    event.preventDefault();
    event.stopPropagation();
  }
  listen($('stick'), 'pointerdown', (event) => {
    if (!playing() || stickPointer !== null) return;
    stickPointer = event.pointerId;
    $('stick').setPointerCapture(event.pointerId);
    stickMove(event);
  });
  listen($('stick'), 'pointermove', stickMove);
  const stopStick = (event) => {
    if (event.pointerId !== stickPointer) return;
    releasePointer($('stick'), stickPointer);
    stickPointer = null;
    $('stick-knob').style.setProperty('--jx', '0px');
    $('stick-knob').style.setProperty('--jy', '0px');
    emit('onTouchMove', 0, 0);
    event.stopPropagation();
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => listen($('stick'), name, stopStick));

  listen($('look-pad'), 'pointerdown', (event) => {
    if (!playing() || lookPointer !== null) return;
    lookPointer = event.pointerId;
    lookLast = [event.clientX, event.clientY];
    $('look-pad').setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });
  listen($('look-pad'), 'pointermove', (event) => {
    if (!playing() || event.pointerId !== lookPointer || !lookLast) return;
    const dx = Math.max(-90, Math.min(90, event.clientX - lookLast[0]));
    const dy = Math.max(-90, Math.min(90, event.clientY - lookLast[1]));
    lookLast = [event.clientX, event.clientY];
    emit('onTouchLook', dx, dy);
    event.preventDefault();
    event.stopPropagation();
  });
  const stopLook = (event) => {
    if (event.pointerId !== lookPointer) return;
    releasePointer($('look-pad'), lookPointer);
    lookPointer = null;
    lookLast = null;
    emit('onTouchLook', 0, 0);
    event.stopPropagation();
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => listen($('look-pad'), name, stopLook));

  const updateHeld = () => {
    const values = new Set([...holds.values()].map((hold) => hold.type));
    emit('onTouchVertical', (values.has('up') ? 1 : 0) - (values.has('down') ? 1 : 0));
    emit('onBoost', values.has('boost'));
  };
  root.querySelectorAll('[data-hold]').forEach((button) => {
    listen(button, 'pointerdown', (event) => {
      if (!playing() || button.disabled || holds.has(event.pointerId)) return;
      holds.set(event.pointerId, { type: button.dataset.hold, element: button, pointer: event.pointerId });
      button.setAttribute('aria-pressed', 'true');
      button.setPointerCapture(event.pointerId);
      updateHeld();
      event.preventDefault();
      event.stopPropagation();
    });
    const stop = (event) => {
      if (!holds.has(event.pointerId)) return;
      holds.delete(event.pointerId);
      button.setAttribute('aria-pressed', 'false');
      releasePointer(button, event.pointerId);
      updateHeld();
      event.preventDefault();
      event.stopPropagation();
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => listen(button, name, stop));
  });

  listen(window, 'keydown', (event) => {
    if (event.repeat || isInput(event.target)) return;
    if (event.code === 'Escape' && (state.playing || state.panel)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (state.panel) closePanel(); else openPanel('pause');
    } else if (event.code === 'Tab' && state.panel) {
      // Dans un menu, Tab sert à atteindre les boutons, Échap referme le carnet.
      const focusable = [...$('menu').querySelectorAll('button:not(:disabled), input:not(:disabled)')]
        .filter((element) => !element.closest('[hidden]'));
      if (focusable.length) {
        const current = focusable.indexOf(document.activeElement);
        const next = (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
        focusable[next].focus();
      }
      event.preventDefault(); event.stopImmediatePropagation();
    } else if (state.playing && (event.code === 'Tab' || event.code === 'KeyI')) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (state.panel === 'inventory') closePanel(); else openPanel('inventory');
    }
  }, true);
  listen(window, 'blur', () => { clearInputs(); if (state.playing && !state.paused) openPanel('pause'); });
  listen(document, 'visibilitychange', () => { if (document.hidden) { clearInputs(); if (state.playing && !state.paused) openPanel('pause'); } });

  setBase(state.base);
  setInventory(state.inventory);
  setMode('human');
  refresh();

  function dispose() {
    clearInputs();
    clearTimeout(toastTimer);
    listeners.splice(0).forEach((remove) => remove());
    state.disposed = true;
    root.replaceChildren();
  }

  return {
    setLoading, ready, setPlaying, setPaused, setTelemetry, setInteraction,
    setObjectives, toast, setSurvival, setInventory, setMode, setBase, setSaveAvailable,
    showComplete: () => openPanel('complete'),
    dispose,
  };
}
