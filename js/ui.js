/* =====================================================================
   EduCraft — UI: title, world map, HUD, pause, shop, math modal,
   stage-clear / fainted / victory screens, and save/load.
   All DOM; the canvas underneath is owned by engine.js.
   ===================================================================== */
(function () {
  'use strict';
  const D = window.GameData, M = window.MathGen;
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

  // ---------- save ----------
  const SAVE_KEY = 'educraft.save.v1';
  function defaultSave() {
    return { credits: 0, weapon: 'w_wood', armor: 'a_none', owned: ['w_wood', 'a_none'], apples: 0, progress: { 1: 0, 2: 0, 3: 0, 4: 0 }, skill: null, stats: { answered: 0, correct: 0, streakBest: 0 }, won: false };
  }
  function loadSave() {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const s = Object.assign(defaultSave(), JSON.parse(raw)); s.progress = Object.assign({ 1: 0, 2: 0, 3: 0, 4: 0 }, s.progress); return s; } } catch (e) { /* ignore */ }
    return defaultSave();
  }
  function persist() { save.skill = M.getSkill(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

  let save = loadSave(); M.setSkill(save.skill);
  let game = null;
  let current = { w: 0, s: 0 };
  let streak = 0;

  // ---------- screens ----------
  const screens = {};
  function show(name) {
    for (const k of Object.keys(screens)) screens[k].classList.toggle('hidden', k !== name);
    $('#hud').classList.toggle('hidden', name !== 'game');
  }
  function modal(id, open) { $(id).classList.toggle('hidden', !open); }

  function fmtCredits(n) { return `${n} ⛃`; }
  function updateCredits() { document.querySelectorAll('.credits').forEach((e) => (e.textContent = fmtCredits(save.credits))); persist(); }

  // ---------- Title ----------
  function buildTitle() {
    const s = screens.title;
    s.querySelector('#btn-play').onclick = () => { showMap(); };
    s.querySelector('#btn-reset').onclick = () => {
      if (confirm('Start a brand new adventure? This erases all progress.')) { save = defaultSave(); M.setSkill(null); persist(); showMap(); }
    };
  }

  // ---------- World map ----------
  function unlocked(w, s) { // w,s zero-based
    if (w === 0) return s <= save.progress[1];
    return save.progress[w] >= 4 && s <= save.progress[w + 1];
  }
  function showMap() {
    show('map'); game && game.stop();
    const list = $('#world-list'); list.innerHTML = '';
    D.WORLDS.forEach((world, wi) => {
      const card = el('div', 'world-card' + (unlocked(wi, 0) ? '' : ' locked'));
      card.style.setProperty('--sky', world.sky);
      card.appendChild(el('div', 'world-title', `<span class="world-num">World ${world.id}</span> ${world.name}`));
      card.appendChild(el('div', 'world-sub', unlocked(wi, 0) ? world.subtitle : '🔒 Beat the previous boss to unlock'));
      card.appendChild(el('div', 'world-math', `📚 ${world.mathNote}`));
      const row = el('div', 'stage-row');
      world.stages.forEach((st, si) => {
        const done = save.progress[world.id] > si;
        const b = el('button', 'stage-btn' + (st.boss ? ' boss' : '') + (done ? ' done' : '') + (unlocked(wi, si) ? '' : ' locked'));
        b.innerHTML = `<span class="stage-n">${st.boss ? '👑' : si + 1}</span><span class="stage-name">${st.name}</span>${done ? '<span class="stage-check">✔</span>' : ''}`;
        b.disabled = !unlocked(wi, si);
        b.onclick = () => startStage(wi, si);
        row.appendChild(b);
      });
      card.appendChild(row); list.appendChild(card);
    });
    updateCredits(); renderGear();
  }
  function renderGear() {
    const w = D.WEAPONS.find((x) => x.id === save.weapon), a = D.ARMORS.find((x) => x.id === save.armor);
    document.querySelectorAll('.gear-summary').forEach((e) => (e.innerHTML = `⚔ ${w.name} (${w.atk}) &nbsp; 🛡 ${a.name} (${Math.round(a.def * 100)}%) &nbsp; 🍎 ×${save.apples}`));
  }

  // ---------- Game ----------
  function startStage(wi, si) {
    current = { w: wi, s: si };
    show('game'); modal('#modal-pause', false);
    if (!game) {
      game = new window.Game($('#game'), save);
      game.cb.onStageClear = onStageClear; game.cb.onPlayerDown = onPlayerDown; game.cb.onTrader = () => openShop(true); game.cb.onCreditsChange = updateCredits;
      window.__game = game; // debug handle (console: __game.player, __game.enemies ...)
    }
    game.save = save; game.startStage(wi, si); window.Input.setEnabled(true); updateCredits();
    $('#hud-stage').textContent = `${D.WORLDS[wi].name} · ${D.WORLDS[wi].stages[si].name}`;
  }
  function onStageClear(wi, si, info) {
    const world = D.WORLDS[wi], isBoss = !!world.stages[si].boss;
    const firstTime = save.progress[world.id] <= si;
    if (firstTime) save.progress[world.id] = si + 1;
    const bonus = isBoss ? D.CREDITS.bossClear : D.CREDITS.stageClear[world.id];
    const reward = firstTime ? bonus : Math.round(bonus / 2);
    save.credits += reward; updateCredits();
    if (isBoss && wi === D.WORLDS.length - 1) { save.won = true; persist(); showVictory(); return; }
    $('#clear-title').textContent = isBoss ? `${D.ENEMIES[world.stages[si].boss].name} defeated!` : 'Stage clear!';
    $('#clear-body').innerHTML = `<p>⏱ ${Math.round(info.time)}s &nbsp; ⚔ ${info.kills} defeated</p><p class="reward">+${reward} ⛃ ${firstTime ? '' : '<small>(replay bonus)</small>'}</p>${isBoss ? `<p class="unlock">🔓 World ${world.id + 1} unlocked!</p>` : ''}`;
    const nextBtn = $('#btn-next');
    const hasNext = si + 1 < world.stages.length || wi + 1 < D.WORLDS.length;
    nextBtn.classList.toggle('hidden', !hasNext);
    nextBtn.onclick = () => { if (si + 1 < world.stages.length) startStage(wi, si + 1); else startStage(wi + 1, 0); };
    show('clear');
  }
  function onPlayerDown() {
    $('#down-body').innerHTML = `<p>The ${D.WORLDS[current.w].name} got the better of you this time.</p><p>Tip: earn credits with maths and buy better armor!</p>`;
    show('down');
  }
  function showVictory() { show('victory'); $('#victory-stats').innerHTML = `<p>Questions answered: <b>${save.stats.answered}</b></p><p>Correct: <b>${save.stats.correct}</b></p><p>Best streak: <b>${save.stats.streakBest}</b></p>`; }

  // ---------- Pause ----------
  function openPause() { if (!game || game.state !== 'play') return; game.pause(); $('#pause-apple').classList.toggle('hidden', save.apples <= 0); $('#pause-apple').textContent = `🍎 Eat Golden Apple (×${save.apples})`; modal('#modal-pause', true); }
  function closePause() { modal('#modal-pause', false); game && game.resume(); }

  // ---------- Shop ----------
  let shopFromTrader = false, shopReturnToPause = false;
  function openShop(fromTrader, returnToPause) {
    shopFromTrader = !!fromTrader; shopReturnToPause = !!returnToPause;
    if (game && game.state === 'play') game.pause();
    modal('#modal-shop', true); renderShop('weapons');
  }
  function closeShop() {
    modal('#modal-shop', false); renderGear();
    if (shopReturnToPause) { modal('#modal-pause', true); }
    else if (shopFromTrader && game) game.resume();
    shopFromTrader = false; shopReturnToPause = false;
  }
  function renderShop(tab) {
    document.querySelectorAll('.shop-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const body = $('#shop-body'); body.innerHTML = '';
    if (tab === 'earn') { body.appendChild(el('div', 'shop-earn', `<p>Answer maths questions to earn credits.</p><p class="small">World ${D.WORLDS[current.w].id} pays <b>${D.CREDITS.perCorrect[D.WORLDS[current.w].id]} ⛃</b> per correct answer, +${D.CREDITS.streakBonus} ⛃ every 3 in a row.</p>`)); const b = el('button', 'btn big', '📚 Start earning'); b.onclick = () => { modal('#modal-shop', false); openMath(() => { modal('#modal-shop', true); renderShop('earn'); }); }; body.appendChild(b); return; }
    const list = tab === 'weapons' ? D.WEAPONS : tab === 'armor' ? D.ARMORS : D.ITEMS;
    list.forEach((it) => {
      const owned = save.owned.includes(it.id), equipped = save.weapon === it.id || save.armor === it.id;
      const row = el('div', 'shop-item' + (equipped ? ' equipped' : ''));
      const stat = tab === 'weapons' ? `⚔ ${it.atk} dmg` : tab === 'armor' ? `🛡 ${Math.round(it.def * 100)}% block · +${it.hp} ♥` : `🍎 ×${save.apples}`;
      row.appendChild(el('div', 'shop-swatch', '')); row.lastChild.style.background = it.color || '#ffd84a';
      row.appendChild(el('div', 'shop-info', `<div class="shop-name">${it.name}</div><div class="shop-stat">${stat}</div><div class="shop-desc">${it.desc}</div>`));
      const btn = el('button', 'btn shop-buy');
      if (tab === 'items') { btn.textContent = `Buy ${it.price} ⛃`; btn.disabled = save.credits < it.price; btn.onclick = () => { save.credits -= it.price; save.apples++; updateCredits(); renderShop(tab); }; }
      else if (equipped) { btn.textContent = 'Equipped'; btn.disabled = true; }
      else if (owned) { btn.textContent = 'Equip'; btn.onclick = () => { equip(tab, it.id); renderShop(tab); }; }
      else { btn.textContent = `${it.price} ⛃`; btn.disabled = save.credits < it.price; btn.onclick = () => { save.credits -= it.price; save.owned.push(it.id); equip(tab, it.id); updateCredits(); renderShop(tab); }; }
      row.appendChild(btn); body.appendChild(row);
    });
  }
  function equip(tab, id) { if (tab === 'weapons') save.weapon = id; else if (tab === 'armor') { save.armor = id; if (game && game.player) game.player.hp = Math.min(game.maxHp(), game.player.hp + 2); } persist(); renderGear(); }

  // ---------- Math modal ----------
  let problem = null, answer = '', onMathClose = null, mathAnswered = 0, mathCorrect = 0;
  function openMath(onClose) {
    onMathClose = onClose || null; mathAnswered = 0; mathCorrect = 0;
    if (game && game.state === 'play') game.pause();
    modal('#modal-math', true); nextProblem();
  }
  function closeMath() {
    modal('#modal-math', false); persist();
    if (onMathClose) { const f = onMathClose; onMathClose = null; f(); } else if (game && game.state === 'paused' && screens.game && !screens.game.classList.contains('hidden') && $('#modal-pause').classList.contains('hidden')) game.resume();
  }
  function nextProblem() {
    const worldId = D.WORLDS[current.w].id;
    problem = M.generate(worldId); answer = '';
    $('#math-kind').textContent = problem.kind === 'story' ? '📖 Word problem' : problem.kind === 'twostep' ? '📖 Two-step problem' : '🔢 Number problem';
    $('#math-q').textContent = problem.text; $('#math-q').classList.toggle('story', problem.kind !== 'notation');
    $('#math-feedback').innerHTML = ''; $('#math-feedback').className = 'math-feedback';
    $('#math-pad').classList.remove('hidden'); $('#math-next').classList.add('hidden');
    $('#math-streak').textContent = streak >= 2 ? `🔥 Streak ${streak}` : '';
    renderAnswer();
  }
  function renderAnswer() { $('#math-answer').textContent = answer === '' ? '?' : answer; }
  function pressKey(k) {
    if (!problem || !$('#math-next').classList.contains('hidden')) return;
    if (k === 'del') answer = answer.slice(0, -1);
    else if (k === 'ok') submit();
    else if (answer.length < 3) answer += k;
    renderAnswer();
  }
  function submit() {
    if (answer === '') return;
    const val = parseInt(answer, 10), ok = val === problem.answer;
    const worldId = D.WORLDS[current.w].id;
    save.stats.answered++; mathAnswered++;
    M.record(problem.op, ok);
    const fb = $('#math-feedback');
    if (ok) {
      streak++; mathCorrect++; save.stats.correct++; save.stats.streakBest = Math.max(save.stats.streakBest, streak);
      let gain = D.CREDITS.perCorrect[worldId]; let extra = '';
      if (streak % 3 === 0) { gain += D.CREDITS.streakBonus; extra = ` <span class="bonus">🔥 Streak bonus +${D.CREDITS.streakBonus}!</span>`; }
      save.credits += gain; updateCredits();
      fb.className = 'math-feedback good'; fb.innerHTML = `✅ Correct! <b>+${gain} ⛃</b>${extra}`;
      confetti();
    } else {
      streak = 0;
      fb.className = 'math-feedback bad'; fb.innerHTML = `❌ Not quite. The answer is <b>${problem.answer}</b>.<div class="explain">${problem.explain}</div>`;
    }
    $('#math-pad').classList.add('hidden'); $('#math-next').classList.remove('hidden');
    $('#math-streak').textContent = streak >= 2 ? `🔥 Streak ${streak}` : '';
    persist();
  }
  function confetti() {
    const box = $('#modal-math .modal-box'); for (let i = 0; i < 14; i++) { const c = el('span', 'confetti'); c.style.left = 20 + Math.random() * 60 + '%'; c.style.setProperty('--r', Math.random()); c.style.background = ['#ffd84a', '#5fcf5f', '#5fe3e0', '#ff5f7a', '#c77dff'][i % 5]; c.style.animationDelay = Math.random() * 0.2 + 's'; box.appendChild(c); setTimeout(() => c.remove(), 1200); }
  }

  // ---------- wire up ----------
  function init() {
    screens.title = $('#screen-title'); screens.map = $('#screen-map'); screens.game = $('#screen-game'); screens.clear = $('#screen-clear'); screens.down = $('#screen-down'); screens.victory = $('#screen-victory');
    buildTitle();
    $('#map-shop').onclick = () => openShop(false);
    $('#map-earn').onclick = () => openMath(null);
    $('#map-title').onclick = () => show('title');
    $('#hud-pause').onclick = openPause; $('#hud-earn').onclick = () => openMath(null);
    $('#pause-resume').onclick = closePause; $('#pause-earn').onclick = () => { modal('#modal-pause', false); openMath(() => modal('#modal-pause', true)); };
    $('#pause-shop').onclick = () => { modal('#modal-pause', false); openShop(false, true); };
    $('#pause-apple').onclick = () => { if (save.apples > 0 && game) { save.apples--; game.healFull(); persist(); closePause(); } };
    $('#pause-quit').onclick = () => { modal('#modal-pause', false); showMap(); };
    $('#shop-close').onclick = closeShop;
    document.querySelectorAll('.shop-tab').forEach((b) => (b.onclick = () => renderShop(b.dataset.tab)));
    document.querySelectorAll('#math-pad button').forEach((b) => (b.onclick = () => pressKey(b.dataset.k)));
    $('#math-next').onclick = nextProblem; $('#math-close').onclick = closeMath;
    $('#btn-map').onclick = showMap; $('#btn-retry').onclick = () => startStage(current.w, current.s); $('#down-map').onclick = showMap;
    $('#victory-map').onclick = showMap;
    window.addEventListener('keydown', (e) => {
      if (!$('#modal-math').classList.contains('hidden')) { if (/^[0-9]$/.test(e.key)) pressKey(e.key); else if (e.key === 'Backspace') pressKey('del'); else if (e.key === 'Enter') { if ($('#math-next').classList.contains('hidden')) pressKey('ok'); else nextProblem(); } return; }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (game && game.state === 'play') openPause(); else if (!$('#modal-pause').classList.contains('hidden')) closePause(); }
    });
    // Pause the game when the tab goes to the background
    document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.state === 'play') openPause(); });
    // Prevent iOS double-tap zoom / scroll
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.body.addEventListener('touchmove', (e) => { if (e.target.closest('.scroll')) return; e.preventDefault(); }, { passive: false });
    show('title'); updateCredits(); renderGear();
  }
  document.addEventListener('DOMContentLoaded', init);
  window.UI = { showMap, openMath, openShop };
})();
