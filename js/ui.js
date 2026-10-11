/* =====================================================================
   EduCraft — UI (v2): title, customise, world map, HUD, pause, shop
   catalogue, maths modal (earn + boss riddles), stage-clear / fainted /
   victory screens, save/load, answer log for the parent page.
   ===================================================================== */
(function () {
  'use strict';
  const D = window.GameData, M = window.MathGen, SP = window.Sprites, AU = window.Audio2;
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

  // ---------- save ----------
  const SAVE_KEY = 'educraft.save.v1';
  function defaultSave() {
    return { ver: 2, credits: 0, weapon: 'w_wood', armor: 'a_none', owned: ['w_wood', 'a_none'], apples: 0, progress: { 1: 0, 2: 0, 3: 0, 4: 0 }, skill: null,
      stats: { answered: 0, correct: 0, streakBest: 0, log: [] }, look: { skin: D.LOOK.skin[0], hair: D.LOOK.hair[0], shirt: D.LOOK.shirt[0] }, won: false, tutorialDone: false };
  }
  function loadSave() {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { const parsed = JSON.parse(raw), isV1 = !parsed.ver; const s = Object.assign(defaultSave(), parsed); s.progress = Object.assign({ 1: 0, 2: 0, 3: 0, 4: 0 }, s.progress); s.stats = Object.assign({ answered: 0, correct: 0, streakBest: 0, log: [] }, s.stats); s.look = Object.assign(defaultSave().look, s.look);
      if (isV1) { // v1 → v2: World 1 gained the Training Yard at index 0, shift cleared count so nothing is lost
        if (s.progress[1] > 0) s.progress[1] += 1; s.ver = 2; try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e2) { /* ignore */ }
      }
      return s; } } catch (e) { /* ignore */ }
    return defaultSave();
  }
  function persist() { save.skill = M.getSkill(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

  let save = loadSave(); M.setSkill(save.skill);
  let game = null, current = { w: 0, s: 0 }, streak = 0;

  // ---------- screens ----------
  const screens = {};
  function show(name) { for (const k of Object.keys(screens)) screens[k].classList.toggle('hidden', k !== name); $('#hud').classList.toggle('hidden', name !== 'game'); if (name === 'title' || name === 'map' || name === 'look') AU.play('title'); }
  function modal(id, open) { $(id).classList.toggle('hidden', !open); }
  function fmtCredits(n) { return `${n} ⛃`; }
  function updateCredits() { document.querySelectorAll('.credits').forEach((e) => (e.textContent = fmtCredits(save.credits))); persist(); }
  function updateMuteButtons() { document.querySelectorAll('.btn-mute').forEach((b) => (b.textContent = AU.isMuted() ? '🔇' : '🔊')); }
  function spriteCanvas(name, size, overrides) { const c = document.createElement('canvas'); c.width = size; c.height = size; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; const img = SP.mob(name, overrides); if (img) g.drawImage(img, 0, 0, size, size); c.className = 'pix'; return c; }

  // ---------- Title & customise ----------
  function buildTitle() {
    $('#btn-play').onclick = () => { AU.unlock(); showMap(); };
    $('#btn-look').onclick = () => { AU.unlock(); showLook(); };
    $('#btn-reset').onclick = () => { if (confirm('Start a brand new adventure? This erases all progress.')) { save = defaultSave(); M.setSkill(null); persist(); showMap(); } };
    $('#look-done').onclick = () => { persist(); show('title'); };
  }
  function showLook() {
    show('look'); const box = $('#look-rows'); box.innerHTML = '';
    const rows = [['skin', 'Skin'], ['hair', 'Hair'], ['shirt', 'Shirt']];
    for (const [key, label] of rows) {
      const row = el('div', 'look-row', `<div class="look-label">${label}</div>`); const sw = el('div', 'swatches');
      D.LOOK[key].forEach((c) => { const b = el('button', 'swatch' + (save.look[key] === c ? ' active' : '')); b.style.background = c; b.onclick = () => { save.look[key] = c; AU.sfx('tap'); showLook(); }; sw.appendChild(b); });
      row.appendChild(sw); box.appendChild(row);
    }
    const prev = $('#look-preview'); prev.innerHTML = ''; prev.appendChild(spriteCanvas('player', 160, { HAIR: save.look.hair, SKIN: save.look.skin, ARMOR: save.look.shirt }));
  }

  // ---------- World map ----------
  function unlocked(w, s) { if (w === 0) return s <= save.progress[1]; return save.progress[w] >= D.WORLDS[w - 1].stages.length && s <= save.progress[w + 1]; }
  function showMap() {
    show('map'); game && game.stop();
    const list = $('#world-list'); list.innerHTML = '';
    D.WORLDS.forEach((world, wi) => {
      const card = el('div', 'world-card' + (unlocked(wi, 0) ? '' : ' locked')); card.style.setProperty('--sky', world.sky);
      card.appendChild(el('div', 'world-title', `<span class="world-num">World ${world.id}</span> ${world.name}`));
      card.appendChild(el('div', 'world-sub', unlocked(wi, 0) ? world.subtitle : '🔒 Beat the previous boss to unlock'));
      card.appendChild(el('div', 'world-math', `📚 ${world.mathNote}`));
      const row = el('div', 'stage-row'); row.style.gridTemplateColumns = `repeat(${world.stages.length}, 1fr)`;
      world.stages.forEach((st, si) => {
        const done = save.progress[world.id] > si;
        const b = el('button', 'stage-btn' + (st.boss ? ' boss' : '') + (st.tutorial ? ' tut' : '') + (done ? ' done' : '') + (unlocked(wi, si) ? '' : ' locked'));
        b.innerHTML = `<span class="stage-n">${st.boss ? '👑' : st.tutorial ? '🎓' : si}</span><span class="stage-name">${st.name}</span>${done ? '<span class="stage-check">✔</span>' : ''}`;
        b.disabled = !unlocked(wi, si); b.onclick = () => { AU.sfx('tap'); startStage(wi, si); }; row.appendChild(b);
      });
      card.appendChild(row); list.appendChild(card);
    });
    updateCredits(); renderGear();
  }
  function renderGear() {
    const w = D.WEAPONS.find((x) => x.id === save.weapon), a = D.ARMORS.find((x) => x.id === save.armor);
    document.querySelectorAll('.gear-summary').forEach((e) => (e.innerHTML = `${w.kind === 'ranged' ? '🏹' : '⚔'} ${w.name} (${w.atk}) &nbsp; 🛡 ${a.name} (${Math.round(a.def * 100)}%) &nbsp; 🍎 ×${save.apples}`));
  }

  // ---------- Game ----------
  function startStage(wi, si) {
    current = { w: wi, s: si }; show('game'); modal('#modal-pause', false);
    if (!game) {
      game = new window.Game($('#game'), save); window.__game = game;
      game.cb.onStageClear = onStageClear; game.cb.onPlayerDown = onPlayerDown; game.cb.onTrader = () => openShop(true); game.cb.onCreditsChange = updateCredits; game.cb.onRiddle = openRiddle; game.cb.onNightmareDeath = openNightmare;
    }
    game.save = save; game.startStage(wi, si); updateCredits();
    $('#hud-stage').textContent = `${D.WORLDS[wi].name} · ${D.WORLDS[wi].stages[si].name}`;
  }
  function onStageClear(wi, si, info) {
    const world = D.WORLDS[wi], isBoss = !!world.stages[si].boss, firstTime = save.progress[world.id] <= si;
    if (firstTime) save.progress[world.id] = si + 1;
    if (world.stages[si].tutorial) save.tutorialDone = true;
    else save.cleanRuns = (save.cleanRuns || 0) + (info.noDamage ? 2 : 1); // 'too good' counter feeds the nightmare
    const bonus = isBoss ? D.CREDITS.bossClear : D.CREDITS.stageClear[world.id], reward = firstTime ? bonus : Math.round(bonus / 2);
    save.credits += reward; updateCredits();
    if (isBoss && wi === D.WORLDS.length - 1) { save.won = true; persist(); showVictory(); return; }
    $('#clear-title').textContent = isBoss ? `${D.ENEMIES[world.stages[si].boss].name} defeated!` : world.stages[si].tutorial ? 'Training complete!' : 'Stage clear!';
    $('#clear-body').innerHTML = `<p>⏱ ${Math.round(info.time)}s &nbsp; ⚔ ${info.kills} defeated</p><p class="reward">+${reward} ⛃ ${firstTime ? '' : '<small>(replay bonus)</small>'}</p>${isBoss ? `<p class="unlock">🔓 World ${world.id + 1} unlocked!</p>` : ''}`;
    const nextBtn = $('#btn-next'), hasNext = si + 1 < world.stages.length || wi + 1 < D.WORLDS.length;
    nextBtn.classList.toggle('hidden', !hasNext); nextBtn.onclick = () => { if (si + 1 < world.stages.length) startStage(wi, si + 1); else startStage(wi + 1, 0); };
    if (!isBoss) AU.play('victory'); show('clear');
  }
  function adviceForFaint() {
    const worldId = D.WORLDS[current.w].id, per = D.CREDITS.perCorrect[worldId];
    const nextW = D.WEAPONS.find((w) => !save.owned.includes(w.id)), nextA = D.ARMORS.find((a) => !save.owned.includes(a.id));
    const pick = [nextW, nextA].filter(Boolean).sort((a, b) => a.price - b.price)[0];
    if (!pick) return 'You own everything. This one is just practice.';
    const need = Math.max(0, pick.price - save.credits), q = Math.ceil(need / per);
    if (need === 0) return `You can already afford the <b>${pick.name}</b> (${pick.price} ⛃). Buy it in the shop!`;
    return `The Trader sells a <b>${pick.name}</b> for ${pick.price} ⛃. You need ${need} more — that's about <b>${q} question${q === 1 ? '' : 's'}</b>.`;
  }
  function onPlayerDown() { save.cleanRuns = 0; $('#down-body').innerHTML = `<p>${adviceForFaint()}</p>`; AU.sfx('wrong'); show('down'); }
  function showVictory() { show('victory'); AU.play('victory'); $('#victory-stats').innerHTML = `<p>Questions answered: <b>${save.stats.answered}</b></p><p>Correct: <b>${save.stats.correct}</b></p><p>Best streak: <b>${save.stats.streakBest}</b></p>`; }

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
  function closeShop() { modal('#modal-shop', false); renderGear(); if (shopReturnToPause) modal('#modal-pause', true); else if (game && screens.game && !screens.game.classList.contains('hidden')) game.resume(); shopFromTrader = false; shopReturnToPause = false; }
  function bars(spec, cur) {
    const labels = { dmg: 'Damage', spd: 'Speed', reach: 'Reach', block: 'Block', hp: 'Hearts' };
    return Object.keys(spec).map((k) => { const v = spec[k], c = cur ? cur[k] : null, diff = c === null ? 0 : v - c;
      return `<div class="bar"><span class="bar-l">${labels[k]}</span><span class="bar-t"><i style="width:${v * 10}%"></i>${diff > 0 ? `<b class="bar-up" style="left:${c * 10}%;width:${diff * 10}%"></b>` : ''}</span><span class="bar-v">${v}${diff ? `<em class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${diff}</em>` : ''}</span></div>`; }).join('');
  }
  function renderShop(tab) {
    document.querySelectorAll('.shop-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const body = $('#shop-body'); body.innerHTML = '';
    const worldId = D.WORLDS[current.w].id;
    if (tab === 'earn') { body.appendChild(el('div', 'shop-earn', `<p>Answer maths questions to earn credits.</p><p class="small">World ${worldId} pays <b>${D.CREDITS.perCorrect[worldId]} ⛃</b> per correct answer, +${D.CREDITS.streakBonus} ⛃ every 3 in a row.</p>`)); const b = el('button', 'btn big primary', '📚 Start earning'); b.onclick = () => { modal('#modal-shop', false); openMath(() => { modal('#modal-shop', true); renderShop('earn'); }); }; body.appendChild(b); return; }
    const list = tab === 'weapons' ? D.WEAPONS : tab === 'armor' ? D.ARMORS : D.ITEMS;
    const curW = D.WEAPONS.find((x) => x.id === save.weapon), curA = D.ARMORS.find((x) => x.id === save.armor);
    list.forEach((it) => {
      const owned = save.owned.includes(it.id), equipped = save.weapon === it.id || save.armor === it.id;
      const card = el('div', 'shop-card' + (equipped ? ' equipped' : '') + (!owned && save.credits < it.price ? ' locked' : ''));
      const art = el('div', 'shop-art'); art.appendChild(spriteCanvas(it.sprite, 96)); if (it.kind) art.appendChild(el('span', 'shop-kind', it.kind === 'ranged' ? '🏹 Ranged' : '⚔ Melee')); card.appendChild(art);
      const info = el('div', 'shop-info');
      info.appendChild(el('div', 'shop-name', it.name + (equipped ? ' <span class="tag">Equipped</span>' : owned ? ' <span class="tag owned">Owned</span>' : '')));
      info.appendChild(el('div', 'shop-lore', it.lore));
      if (it.bars) info.appendChild(el('div', 'bars', bars(it.bars, tab === 'weapons' ? curW.bars : curA.bars)));
      if (tab === 'items') info.appendChild(el('div', 'shop-stat', `You have 🍎 ×${save.apples}`));
      card.appendChild(info);
      const btn = el('button', 'btn shop-buy');
      if (tab === 'items') { btn.textContent = `Buy · ${it.price} ⛃`; btn.disabled = save.credits < it.price; btn.onclick = () => { save.credits -= it.price; save.apples++; AU.sfx('buy'); updateCredits(); renderShop(tab); }; }
      else if (equipped) { btn.textContent = 'Equipped'; btn.disabled = true; }
      else if (owned) { btn.textContent = 'Equip'; btn.onclick = () => { equip(tab, it.id); AU.sfx('tap'); renderShop(tab); }; }
      else { btn.innerHTML = `${it.price} ⛃`; btn.disabled = save.credits < it.price; btn.onclick = () => { save.credits -= it.price; save.owned.push(it.id); equip(tab, it.id); AU.sfx('buy'); updateCredits(); renderShop(tab); }; if (btn.disabled) btn.title = 'Earn more credits'; }
      card.appendChild(btn); body.appendChild(card);
    });
  }
  function equip(tab, id) { if (tab === 'weapons') save.weapon = id; else if (tab === 'armor') { save.armor = id; if (game && game.player) game.player.hp = Math.min(game.maxHp(), game.player.hp + 2); } persist(); renderGear(); }

  // ---------- Maths modal (earn mode + riddle mode) ----------
  let problem = null, answer = '', onMathClose = null, riddle = null; // riddle = { need, got, nightmare? }
  function openMath(onClose) { onMathClose = onClose || null; riddle = null; if (game && game.state === 'play') game.pause(); $('#modal-math').classList.remove('riddle'); $('#math-close').textContent = '✕'; modal('#modal-math', true); nextProblem(); }
  function openRiddle() {
    riddle = { need: D.CREDITS.riddleCount, got: 0 }; onMathClose = null; if (game) game.riddleOpen = true;
    $('#modal-math').classList.add('riddle'); $('#math-close').textContent = '← Step back'; modal('#modal-math', true); nextProblem();
  }
  function openNightmare() {
    riddle = { need: 1, got: 0, nightmare: true }; onMathClose = null;
    $('#modal-math').classList.add('riddle', 'nightmare'); $('#math-close').classList.add('hidden'); modal('#modal-math', true); nextProblem();
  }
  function closeMath() {
    modal('#modal-math', false); persist(); $('#modal-math').classList.remove('nightmare'); $('#math-close').classList.remove('hidden');
    if (riddle && riddle.nightmare) { riddle = null; if (game) game.exitNightmare(); return; }
    if (riddle) { const solved = riddle.got >= riddle.need; riddle = null; if (game) { game.riddleOpen = false; if (solved) game.unseal(); else game.riddleCancelled(); } return; }
    if (onMathClose) { const f = onMathClose; onMathClose = null; f(); }
    else if (game && game.state === 'paused' && screens.game && !screens.game.classList.contains('hidden') && $('#modal-pause').classList.contains('hidden')) game.resume();
  }
  function nextProblem() {
    if (riddle && riddle.got >= riddle.need) { closeMath(); return; }
    const worldId = D.WORLDS[current.w].id; problem = M.generate(worldId); answer = ''; window.__problem = problem;
    const kind = problem.kind === 'story' ? '📖 Word problem' : problem.kind === 'twostep' ? '📖 Two-step problem' : '🔢 Number problem';
    $('#math-kind').textContent = riddle ? (riddle.nightmare ? '😱 Exit the Nightmare — answer to escape' : `🔒 Door riddle ${riddle.got + 1} of ${riddle.need}`) : kind;
    $('#math-q').textContent = problem.text; $('#math-q').classList.toggle('story', problem.kind !== 'notation');
    $('#math-feedback').innerHTML = ''; $('#math-feedback').className = 'math-feedback';
    $('#math-pad').classList.remove('hidden'); $('#math-next').classList.add('hidden');
    $('#math-streak').textContent = streak >= 2 ? `🔥 Streak ${streak}` : ''; renderAnswer();
  }
  function renderAnswer() { $('#math-answer').textContent = answer === '' ? '?' : answer; }
  function pressKey(k) { if (!problem || !$('#math-next').classList.contains('hidden')) return; if (k === 'del') answer = answer.slice(0, -1); else if (k === 'ok') submit(); else if (answer.length < 3) { answer += k; AU.sfx('tap'); } renderAnswer(); }
  function submit() {
    if (answer === '') return;
    const val = parseInt(answer, 10), ok = val === problem.answer, worldId = D.WORLDS[current.w].id;
    save.stats.answered++; M.record(problem.op, ok);
    save.stats.log.push({ t: Date.now(), w: worldId, op: problem.op, k: problem.kind, ok, q: problem.text, a: problem.answer, g: val }); if (save.stats.log.length > 400) save.stats.log.shift();
    const fb = $('#math-feedback');
    if (ok) {
      streak++; save.stats.correct++; save.stats.streakBest = Math.max(save.stats.streakBest, streak);
      let gain = D.CREDITS.perCorrect[worldId], extra = '';
      if (streak % 3 === 0) { gain += D.CREDITS.streakBonus; extra = ` <span class="bonus">🔥 Streak bonus +${D.CREDITS.streakBonus}!</span>`; }
      save.credits += gain; updateCredits(); AU.sfx('correct'); confetti();
      if (riddle) { riddle.got++; fb.className = 'math-feedback good'; fb.innerHTML = `✅ Correct! <b>+${gain} ⛃</b>${extra}<div class="explain">${riddle.nightmare ? '🌅 The nightmare lets go of you…' : riddle.got >= riddle.need ? '🔓 The door is opening…' : `${riddle.need - riddle.got} more to open the door.`}</div>`; }
      else { fb.className = 'math-feedback good'; fb.innerHTML = `✅ Correct! <b>+${gain} ⛃</b>${extra}`; }
      if (game) game.tutorialEvent('math');
    } else { streak = 0; AU.sfx('wrong'); fb.className = 'math-feedback bad'; fb.innerHTML = `❌ Not quite. The answer is <b>${problem.answer}</b>.<div class="explain">${problem.explain}</div>`; }
    $('#math-pad').classList.add('hidden'); $('#math-next').classList.remove('hidden');
    $('#math-next').textContent = riddle && riddle.got >= riddle.need ? (riddle.nightmare ? '🌅 Wake up' : '🔓 Open the door') : 'Next question ▶';
    $('#math-streak').textContent = streak >= 2 ? `🔥 Streak ${streak}` : ''; persist();
  }
  function confetti() { const box = $('#modal-math .modal-box'); for (let i = 0; i < 14; i++) { const c = el('span', 'confetti'); c.style.left = 20 + Math.random() * 60 + '%'; c.style.setProperty('--r', Math.random()); c.style.background = ['#ffd84a', '#5fcf5f', '#5fe3e0', '#ff5f7a', '#c77dff'][i % 5]; c.style.animationDelay = Math.random() * 0.2 + 's'; box.appendChild(c); setTimeout(() => c.remove(), 1200); } }

  // ---------- wire up ----------
  function init() {
    screens.title = $('#screen-title'); screens.look = $('#screen-look'); screens.map = $('#screen-map'); screens.game = $('#screen-game'); screens.clear = $('#screen-clear'); screens.down = $('#screen-down'); screens.victory = $('#screen-victory');
    buildTitle();
    $('#map-shop').onclick = () => openShop(false); $('#map-earn').onclick = () => openMath(null); $('#map-title').onclick = () => show('title');
    $('#hud-pause').onclick = openPause; $('#hud-earn').onclick = () => openMath(null); $('#hud-shop').onclick = () => openShop(false);
    document.querySelectorAll('.btn-mute').forEach((b) => (b.onclick = () => { AU.unlock(); AU.toggleMute(); updateMuteButtons(); }));
    $('#pause-resume').onclick = closePause; $('#pause-earn').onclick = () => { modal('#modal-pause', false); openMath(() => modal('#modal-pause', true)); };
    $('#pause-shop').onclick = () => { modal('#modal-pause', false); openShop(false, true); };
    $('#pause-apple').onclick = () => { if (save.apples > 0 && game) { save.apples--; game.healFull(); AU.sfx('chest'); persist(); closePause(); } };
    $('#pause-quit').onclick = () => { modal('#modal-pause', false); showMap(); };
    $('#shop-close').onclick = closeShop; document.querySelectorAll('.shop-tab').forEach((b) => (b.onclick = () => { AU.sfx('tap'); renderShop(b.dataset.tab); }));
    document.querySelectorAll('#math-pad button').forEach((b) => (b.onclick = () => pressKey(b.dataset.k)));
    $('#math-next').onclick = nextProblem; $('#math-close').onclick = closeMath;
    $('#btn-map').onclick = showMap; $('#btn-retry').onclick = () => startStage(current.w, current.s); $('#down-map').onclick = showMap; $('#down-shop').onclick = () => openShop(false); $('#victory-map').onclick = showMap;
    window.addEventListener('keydown', (e) => {
      if (!$('#modal-math').classList.contains('hidden')) { if (/^[0-9]$/.test(e.key)) pressKey(e.key); else if (e.key === 'Backspace') pressKey('del'); else if (e.key === 'Enter') { if ($('#math-next').classList.contains('hidden')) pressKey('ok'); else nextProblem(); } return; }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { if (game && game.state === 'play') openPause(); else if (!$('#modal-pause').classList.contains('hidden')) closePause(); }
      if (e.key === 'm' || e.key === 'M') { AU.toggleMute(); updateMuteButtons(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.state === 'play') openPause(); });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.body.addEventListener('touchmove', (e) => { if (e.target.closest('.scroll')) return; e.preventDefault(); }, { passive: false });
    const unlockOnce = () => { AU.unlock(); if (!screens.game || screens.game.classList.contains('hidden')) AU.play('title'); };
    document.addEventListener('pointerdown', unlockOnce); document.addEventListener('touchend', unlockOnce);
    show('title'); updateCredits(); renderGear(); updateMuteButtons();
  }
  document.addEventListener('DOMContentLoaded', init);
  window.UI = { showMap, openMath, openShop };
})();
