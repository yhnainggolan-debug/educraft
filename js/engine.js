/* =====================================================================
   EduCraft — Game engine (v2)
   Top-down tile world, procedural stages, melee + ranged combat,
   enemy AI, sealed boss doors, tutorial stage, loot chests, juice.
   The UI (ui.js) talks to the engine through callbacks:
     onStageClear, onPlayerDown, onTrader, onCreditsChange,
     onRiddle (sealed boss door reached), onTutorialStep
   ===================================================================== */
(function () {
  'use strict';
  const T = 32;
  const D = window.GameData, SP = window.Sprites, IN = window.Input, AU = window.Audio2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const TUTORIAL = [
    { id: 'move',   text: 'Drag on the LEFT side of the screen to walk' },
    { id: 'hit',    text: 'Tap the RIGHT side to HIT the training dummy' },
    { id: 'trader', text: 'Walk to the Trader and press TRADE' },
    { id: 'math',   text: 'Tap 📚 Earn and answer one question' },
    { id: 'portal', text: 'Portal open! Walk into it to finish' },
  ];

  class Game {
    constructor(canvas, save) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.save = save; this.state = 'idle'; this.time = 0; this.cb = {};
      this.resize(); window.addEventListener('resize', () => this.resize());
      IN.attach(canvas); this.lastTs = 0;
      requestAnimationFrame((ts) => this.loop(ts));
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = window.innerWidth, h = window.innerHeight;
      this.W = w; this.H = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      this.zoom = clamp(Math.max(w / (16 * T), h / (13 * T)), 1.2, 3.2);
      this.ctx.imageSmoothingEnabled = false;
    }

    // ---------- gear ----------
    weapon() { return D.WEAPONS.find((w) => w.id === this.save.weapon) || D.WEAPONS[0]; }
    armor() { return D.ARMORS.find((a) => a.id === this.save.armor) || D.ARMORS[0]; }
    maxHp() { return 10 + this.armor().hp; }
    lookOverrides() {
      const look = this.save.look || {}, a = this.armor();
      return { HAIR: look.hair || D.LOOK.hair[0], SKIN: look.skin || D.LOOK.skin[0], ARMOR: a.id === 'a_none' ? (look.shirt || D.LOOK.shirt[0]) : a.color };
    }

    // ---------- stage lifecycle ----------
    startStage(worldIdx, stageIdx) {
      const world = D.WORLDS[worldIdx], stage = world.stages[stageIdx];
      this.world = world; this.stage = stage; this.worldIdx = worldIdx; this.stageIdx = stageIdx;
      const hasTut = !!world.stages[0].tutorial, si = stage.boss ? 3 : Math.max(0, stageIdx - (hasTut ? 1 : 0));
      const ws = D.worldScale[world.id], ss = D.stageScale(si);
      this.scale = { hp: ws.hp * ss.hp, dmg: ws.dmg * ss.dmg };
      this.genMap(world, stage);
      this.enemies = []; this.projectiles = []; this.pickups = []; this.particles = []; this.texts = []; this.corpses = [];
      this.portalOpen = false; this.cleared = false; this.bossDef = null; this.boss = null; this.chest = null; this.gate = null; this.sealed = false;
      this.freeze = 0; this.flash = 0; this.shake = 0; this.kills = 0; this.stageTime = 0; this.lastKill = null;
      this.tutorial = stage.tutorial ? { step: 0, moved: 0 } : null;
      this.pendingHits = []; this.bolts = []; this.nightmare = null; this.riddleAsked = false; this.damageTaken = 0;
      const NM = D.NIGHTMARE;
      this.nightmareAt = (!stage.tutorial && !stage.boss && (this.save.cleanRuns || 0) >= NM.cleanRuns && Math.random() < NM.chance) ? rnd(NM.delayMin, NM.delayMax) : -1;
      this.spawnPlayer(); this.spawnEnemies(stage);
      this.state = 'play'; IN.setEnabled(true);
      this.msg(stage.name, '#fff', 2.2, true);
      AU.play('world' + world.id);
      if (this.tutorial) this.tutorialHint();
    }

    spawnPlayer() {
      const s = this.spawn;
      this.player = { x: s.x * T + T / 2, y: s.y * T + T / 2, r: 11, hp: this.maxHp(), face: 1, dir: { x: 1, y: 0 }, swing: 0, cd: 0, inv: 0, kx: 0, ky: 0, anim: 0, moving: false };
    }

    // ---------- map generation ----------
    genMap(world, stage) {
      const [W, H] = stage.size; this.mw = W; this.mh = H; const tl = world.tiles;
      const grid = [], solid = [], hazard = [], variant = [];
      for (let y = 0; y < H; y++) { grid.push([]); solid.push([]); hazard.push([]); variant.push([]);
        for (let x = 0; x < W; x++) { const border = x === 0 || y === 0 || x === W - 1 || y === H - 1; const t = border || Math.random() < stage.density ? pick(tl.wall) : pick(tl.floor);
          grid[y].push(t); solid[y].push(SP.isWall(t)); hazard[y].push(false); variant[y].push(rndi(0, 7)); } }
      if (tl.hazard && stage.hazard > 0) { const pools = Math.floor(W * H * stage.hazard / 4);
        for (let i = 0; i < pools; i++) { const px = rndi(2, W - 5), py = rndi(2, H - 4), pw = rndi(2, 3), ph = rndi(1, 2);
          for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) { grid[y][x] = tl.hazard; solid[y][x] = false; hazard[y][x] = true; } } }
      const sx = 3, sy = Math.floor(H / 2);
      for (let y = sy - 2; y <= sy + 2; y++) for (let x = sx - 1; x <= sx + 5; x++) if (x > 0 && y > 0 && x < W - 1 && y < H - 1) { grid[y][x] = tl.floor[0]; solid[y][x] = false; hazard[y][x] = false; }
      this.spawn = { x: sx, y: sy };
      this.trader = { x: (sx + 3) * T + T / 2, y: (sy - 1) * T + T / 2, r: 14 };
      const dist = this.bfs(sx, sy, solid, hazard, W, H);
      let far = { x: sx, y: sy, d: 0 };
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (!solid[y][x] && dist[y][x] < 0) { grid[y][x] = pick(tl.wall); solid[y][x] = true; hazard[y][x] = false; }
        else if (!solid[y][x] && !hazard[y][x] && dist[y][x] > far.d) far = { x, y, d: dist[y][x] }; }
      this.portal = { tx: far.x, ty: far.y, x: far.x * T + T / 2, y: far.y * T + T / 2 };
      grid[far.y][far.x] = tl.floor[0]; hazard[far.y][far.x] = false;
      this.grid = grid; this.solid = solid; this.hazardMap = hazard; this.variant = variant; this.dist = dist;
    }
    bfs(sx, sy, solid, hazard, W, H) {
      const dist = Array.from({ length: H }, () => Array(W).fill(-1)); const q = [[sx, sy]]; dist[sy][sx] = 0;
      while (q.length) { const [x, y] = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || solid[ny][nx] || hazard[ny][nx] || dist[ny][nx] >= 0) continue; dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); } }
      return dist;
    }
    freeTileFar(minDist) {
      for (let tries = 0; tries < 400; tries++) { const x = rndi(1, this.mw - 2), y = rndi(1, this.mh - 2);
        if (!this.solid[y][x] && !this.hazardMap[y][x] && this.dist[y][x] >= minDist && !(x === this.portal.tx && y === this.portal.ty)) return { x: x * T + T / 2, y: y * T + T / 2 }; }
      return { x: this.portal.x, y: this.portal.y };
    }
    spawnEnemies(stage) {
      for (const [type, count] of stage.enemies) for (let i = 0; i < count; i++) { const p = this.tutorial ? { x: (this.spawn.x + 5) * T, y: (this.spawn.y + 1) * T + T / 2 } : this.freeTileFar(7); this.addEnemy(type, p.x, p.y); }
      if (stage.boss) {
        let p = null;
        for (let tries = 0; tries < 300 && !p; tries++) { const tx = this.spawn.x + 11 + rndi(0, 3), ty = this.spawn.y + rndi(-3, 3);
          if (tx < this.mw - 2 && ty > 0 && ty < this.mh - 1 && !this.solid[ty][tx] && !this.hazardMap[ty][tx]) p = { x: tx * T + T / 2, y: ty * T + T / 2 }; }
        if (!p) p = this.freeTileFar(6);
        const b = this.addEnemy(stage.boss, p.x, p.y); this.boss = b; this.bossDef = D.ENEMIES[stage.boss];
        // sealed door 5 tiles before the boss: a barrier the player cannot cross until the riddles are solved
        this.gate = { x: (this.spawn.x + 7) * T, y: p.y }; this.sealed = true;
        for (let y = 1; y < this.mh - 1; y++) { const tx = this.spawn.x + 7; this.solid[y][tx] = false; this.hazardMap[y][tx] = false; this.grid[y][tx] = this.world.tiles.floor[0]; }
      }
    }
    addEnemy(type, x, y, isMinion) {
      const def = D.ENEMIES[type];
      const e = { type, def, x, y, r: def.size / 2 - 2, cr: def.boss ? 14 : Math.min(def.size / 2 - 2, 13), hp: def.hp * this.scale.hp, maxHp: def.hp * this.scale.hp,
        dmg: def.dmg * this.scale.dmg, speed: def.speed, state: 'idle', t: rnd(0, 1), cd: rnd(0.5, 2), face: -1, vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, anim: rnd(0, 10),
        wander: { x: 0, y: 0, t: 0 }, minion: !!isMinion, fuse: -1, phaseT: 0, phase: 'chase', stun: 0 };
      if (def.behaviour === 'dummy') { e.hp = def.hp; e.maxHp = def.hp; e.dmg = 0; }
      this.enemies.push(e); return e;
    }

    // ---------- helpers ----------
    tileAt(px, py) { const tx = Math.floor(px / T), ty = Math.floor(py / T); if (tx < 0 || ty < 0 || tx >= this.mw || ty >= this.mh) return null; return { tx, ty }; }
    blocked(px, py, r, avoidHazard) {
      for (const [x, y] of [[px - r, py - r], [px + r, py - r], [px - r, py + r], [px + r, py + r], [px, py - r], [px, py + r], [px - r, py], [px + r, py]]) {
        const t = this.tileAt(x, y); if (!t) return true; if (this.solid[t.ty][t.tx]) return true; if (avoidHazard && this.hazardMap[t.ty][t.tx]) return true; }
      return false;
    }
    moveEntity(e, dx, dy, avoidHazard) {
      const r = e.cr || e.r;
      if (dx && !this.blocked(e.x + dx, e.y, r, avoidHazard) && !(e === this.player && this.sealed && e.x + dx + r > this.gate.x - 6)) e.x += dx; else if (dx) { e.vx = 0; e.kx = 0; }
      if (dy && !this.blocked(e.x, e.y + dy, r, avoidHazard)) e.y += dy; else if (dy) { e.vy = 0; e.ky = 0; }
    }
    msg(text, color, life, big) { this.texts.push({ x: null, y: null, text, color: color || '#fff', life: life || 1, big: !!big, t: 0 }); }
    floatText(x, y, text, color) { this.texts.push({ x, y, text, color: color || '#fff', life: 0.9, t: 0 }); }
    burst(x, y, color, n, speed, square) { for (let i = 0; i < (n || 8); i++) { const a = rnd(0, Math.PI * 2), s = rnd(20, speed || 90); this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (square ? 60 : 0), life: rnd(0.3, square ? 0.9 : 0.7), color, sq: !!square, g: square ? 260 : 0 }); } }
    addCredits(n) { this.save.credits += n; if (this.cb.onCreditsChange) this.cb.onCreditsChange(this.save.credits); }

    // ---------- tutorial ----------
    tutorialHint() { if (!this.tutorial) return; const s = TUTORIAL[this.tutorial.step]; if (s) { this.hint = s.text; if (this.cb.onTutorialStep) this.cb.onTutorialStep(s.id); } else this.hint = null; }
    tutorialAdvance(id) { if (!this.tutorial) return; const s = TUTORIAL[this.tutorial.step]; if (s && s.id === id) { this.tutorial.step++; AU.sfx('coin'); this.tutorialHint(); } }
    tutorialEvent(id) { this.tutorialAdvance(id); } // called by UI: 'trader', 'math'

    // ---------- main loop ----------
    loop(ts) {
      const dt = Math.min(0.033, (ts - (this.lastTs || ts)) / 1000); this.lastTs = ts;
      if (this.state === 'play') { if (this.freeze > 0) this.freeze -= dt; else this.update(dt); }
      if (this.state === 'play' || this.state === 'paused') this.render();
      requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
      this.time += dt; this.stageTime += dt;
      const p = this.player;
      const ax = IN.getAxis(); const spd = 115; let vx = ax.x * spd, vy = ax.y * spd;
      p.moving = Math.abs(ax.x) + Math.abs(ax.y) > 0.05;
      if (p.moving) { const l = Math.hypot(ax.x, ax.y) || 1; p.dir = { x: ax.x / l, y: ax.y / l }; if (Math.abs(ax.x) > 0.2) p.face = ax.x > 0 ? 1 : -1; p.anim += dt * 10; if (this.tutorial) { this.tutorial.moved += spd * dt; if (this.tutorial.moved > 70) this.tutorialAdvance('move'); } }
      vx += p.kx; vy += p.ky; p.kx *= Math.pow(0.001, dt); p.ky *= Math.pow(0.001, dt);
      this.moveEntity(p, vx * dt, vy * dt, false);
      p.cd = Math.max(0, p.cd - dt); p.inv = Math.max(0, p.inv - dt); p.swing = Math.max(0, p.swing - dt); this.flash = Math.max(0, this.flash - dt);
      const under = this.tileAt(p.x, p.y);
      if (under && this.hazardMap[under.ty][under.tx] && p.inv <= 0) this.hurtPlayer(1, { x: -p.dir.x, y: -p.dir.y }, true);

      const enemyClose = this.enemies.some((e) => e.def.behaviour !== 'dummy' && !(e.def.boss && this.sealed) && Math.hypot(e.x - p.x, e.y - p.y) < 90 + e.r);
      this.nearTrader = !enemyClose && Math.hypot(this.trader.x - p.x, this.trader.y - p.y) < 50;
      if (IN.consumeAttack()) { if (this.nearTrader) { this.tutorialAdvance('trader'); if (this.cb.onTrader) this.cb.onTrader(); } else this.attack(); }

      // sealed door
      if (this.sealed && Math.abs(p.x - this.gate.x) < 60 && !this.riddleAsked) { this.riddleAsked = true; this.state = 'paused'; IN.setEnabled(false); AU.sfx('riddle'); if (this.cb.onRiddle) this.cb.onRiddle(); return; }
      // chest
      if (this.chest && !this.chest.open && Math.hypot(this.chest.x - p.x, this.chest.y - p.y) < 26) this.openChest();
      // portal
      if (this.portalOpen && Math.hypot(this.portal.x - p.x, this.portal.y - p.y) < 24 && !this.cleared) {
        this.cleared = true; this.state = 'paused'; IN.setEnabled(false); AU.sfx('portal');
        if (this.cb.onStageClear) this.cb.onStageClear(this.worldIdx, this.stageIdx, { kills: this.kills, time: this.stageTime, noDamage: this.damageTaken === 0 }); return; }

      // delayed second hits (double slash)
      for (const h of this.pendingHits) { h.t -= dt; if (h.t <= 0) { h.done = true; for (const e of this.enemies) { if (e.hp <= 0 || (e.def.boss && this.sealed)) continue; if (Math.hypot(e.x - h.x, e.y - h.y) < h.r + e.r) this.damageEnemy(e, h.dmg, h.dir); } } }
      this.pendingHits = this.pendingHits.filter((h) => !h.done);
      // nightmare
      if (this.nightmareAt > 0 && this.stageTime >= this.nightmareAt) { this.nightmareAt = -1; this.spawnNightmare(); }
      if (this.nightmare) { this.nightmare.t += dt; if (this.nightmare.t >= D.NIGHTMARE.duration) this.endNightmare(false); }
      for (const b of this.bolts) { b.t += dt; if (!b.struck && b.t >= b.delay) { b.struck = true; this.strikeBolt(b); } }
      this.bolts = this.bolts.filter((b) => b.t < b.delay + 0.35);
      for (const e of this.enemies) this.updateEnemy(e, dt);
      this.enemies = this.enemies.filter((e) => e.hp > 0);
      // projectiles
      for (const pr of this.projectiles) {
        pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt; pr.dist = (pr.dist || 0) + Math.hypot(pr.vx, pr.vy) * dt;
        const t = this.tileAt(pr.x, pr.y);
        if (!t || this.solid[t.ty][t.tx] || (pr.range && pr.dist > pr.range)) { pr.life = 0; this.burst(pr.x, pr.y, '#ccc', 4, 50); continue; }
        if (pr.fromPlayer) {
          for (const e of this.enemies) { if (e.hp <= 0 || (e.def.boss && this.sealed) || (pr.hit && pr.hit.has(e))) continue;
            if (Math.hypot(pr.x - e.x, pr.y - e.y) < e.r + 6) { this.damageEnemy(e, pr.dmg, { x: pr.vx, y: pr.vy }, true); if (pr.pierce) { pr.hit = pr.hit || new Set(); pr.hit.add(e); } else { pr.life = 0; break; } } }
        } else if (Math.hypot(pr.x - p.x, pr.y - p.y) < p.r + 6) { this.hurtPlayer(pr.dmg, { x: pr.vx, y: pr.vy }); pr.life = 0; }
      }
      this.projectiles = this.projectiles.filter((pr) => pr.life > 0);
      for (const k of this.pickups) { k.t += dt; if (Math.hypot(k.x - p.x, k.y - p.y) < p.r + 12) { k.dead = true; p.hp = Math.min(this.maxHp(), p.hp + 2); this.floatText(p.x, p.y - 20, '+2 ♥', '#ff5f7a'); this.burst(k.x, k.y, '#ff5f7a', 8, 60); AU.sfx('heart'); } }
      this.pickups = this.pickups.filter((k) => !k.dead && k.t < 20);
      for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt; q.vx *= 0.92; if (!q.sq) q.vy *= 0.92; q.life -= dt; }
      this.particles = this.particles.filter((q) => q.life > 0);
      for (const c of this.corpses) c.t += dt; this.corpses = this.corpses.filter((c) => c.t < 0.3);
      for (const tx of this.texts) tx.t += dt; this.texts = this.texts.filter((tx) => tx.t < tx.life);
      if (this.chest) this.chest.t += dt;

      // stage clear
      if (!this.portalOpen) {
        const alive = this.enemies.filter((e) => e.def.behaviour !== 'dummy' && !e.def.nightmare).length;
        const bossDone = !this.bossDef || !this.boss || this.boss.hp <= 0;
        const tutDone = !this.tutorial || this.tutorial.step >= 4;
        if (alive === 0 && bossDone && tutDone && (!this.tutorial || this.enemies.length === 0)) this.openPortal();
      }
    }
    openPortal() {
      this.portalOpen = true; this.msg('Portal opened! Find it!', '#c77dff', 2.5, true); this.burst(this.portal.x, this.portal.y, '#c77dff', 30, 160); AU.sfx('portal');
      if (!this.tutorial) { const at = this.lastKill || { x: this.player.x + 40, y: this.player.y }; this.chest = { x: at.x, y: at.y, open: false, t: 0 }; }
      if (this.tutorial) this.tutorialHint();
      if (this.bossDef) AU.play('world' + this.world.id);
    }
    openChest() {
      const c = this.chest; c.open = true; AU.sfx('chest'); this.burst(c.x, c.y - 10, '#ffd84a', 24, 140, true);
      this.player.hp = this.maxHp(); this.floatText(c.x, c.y - 24, 'Hearts restored!', '#ffd84a');
      if (Math.random() < 0.3) { this.save.apples++; this.floatText(c.x, c.y - 44, '+1 Golden Apple!', '#fff3b0'); if (this.cb.onCreditsChange) this.cb.onCreditsChange(this.save.credits); }
    }
    unseal() { // called by UI after the riddles are solved
      this.sealed = false; this.burst(this.gate.x, this.gate.y, '#c77dff', 50, 220, true); this.shake = 0.4; AU.sfx('explode');
      this.msg(this.bossDef.roar, '#ffd84a', 3.2, false); setTimeout(() => AU.sfx('roar'), 200);
      this.boss.phase = 'chase'; this.boss.phaseT = 0; AU.play('boss');
      this.state = 'play'; IN.setEnabled(true); this.lastTs = 0;
    }

    // ---------- nightmare ----------
    spawnNightmare() {
      const p = this.player; let x = p.x + 160 * (p.face || 1), y = p.y; if (this.blocked(x, y, 13, true)) { x = p.x; y = p.y - 120; }
      const e = this.addEnemy('herobrine', x, y); e.hp = D.ENEMIES.herobrine.hp * this.scale.hp; e.maxHp = e.hp; e.dmg = D.ENEMIES.herobrine.dmg; e.kx = 0;
      this.nightmare = { t: 0, e }; this.save.cleanRuns = 0; this.flash = 0.5; this.shake = 0.6; AU.sfx('thunder'); AU.play('metal');
      this.msg('HEROBRINE', '#ff3b3b', 3, true); setTimeout(() => this.msg('Survive 45 seconds… or fall into the nightmare', '#fff', 3), 1200);
      this.burst(x, y, '#ffffff', 30, 200); if (this.cb.onCreditsChange) this.cb.onCreditsChange(this.save.credits);
    }
    endNightmare(defeated) {
      if (!this.nightmare) return; const e = this.nightmare.e; this.nightmare = null; e.hp = 0; this.bolts = [];
      this.burst(e.x, e.y, '#ffffff', 40, 220, true); AU.sfx('teleport'); AU.play('world' + this.world.id);
      if (defeated) { this.msg('IMPOSSIBLE. You defeated Herobrine!', '#ffd84a', 4, true); this.save.apples += 3; this.floatText(e.x, e.y - 30, '+3 Golden Apples!', '#fff3b0'); this.shake = 0.6; this.freeze = 0.4; }
      else this.msg('The nightmare fades…', '#c77dff', 3, true);
      if (this.cb.onCreditsChange) this.cb.onCreditsChange(this.save.credits);
    }
    exitNightmare() { // player answered the exit question
      const p = this.player; this.endNightmare(false); this.enemies = this.enemies.filter((x) => !x.def.nightmare);
      p.hp = this.maxHp(); p.inv = 2; this.msg('You escaped the nightmare!', '#5fcf5f', 3, true); this.burst(p.x, p.y, '#5fcf5f', 30, 150);
      this.state = 'play'; IN.setEnabled(true); this.lastTs = 0;
    }
    strikeBolt(b) {
      const p = this.player; this.flash = 0.35; this.shake = 0.35; AU.sfx('thunder'); this.burst(b.x, b.y, '#ffffff', 24, 200); this.burst(b.x, b.y, '#9ad8ff', 16, 160, true);
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + p.r) this.hurtPlayer(b.dmg, { x: p.x - b.x, y: p.y - b.y });
    }

    // ---------- combat ----------
    attack() {
      const p = this.player, w = this.weapon(); if (p.cd > 0) return;
      let best = null, bd = (w.kind === 'ranged' ? w.range : w.range + 30);
      for (const e of this.enemies) { if (e.def.boss && this.sealed) continue; const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r; if (d < bd) { bd = d; best = e; } }
      if (best) { const dx = best.x - p.x, dy = best.y - p.y, l = Math.hypot(dx, dy) || 1; p.dir = { x: dx / l, y: dy / l }; if (Math.abs(dx) > 4) p.face = dx > 0 ? 1 : -1; }
      p.cd = w.cd; p.swing = 0.22; p.swingMax = 0.22; p.animType = w.anim || 'bow';
      if (w.kind === 'ranged') {
        this.projectiles.push({ x: p.x + p.dir.x * 10, y: p.y + p.dir.y * 10 - 4, vx: p.dir.x * w.speed, vy: p.dir.y * w.speed, dmg: w.atk, sprite: w.proj, life: 4, ang: Math.atan2(p.dir.y, p.dir.x), fromPlayer: true, pierce: !!w.pierce, range: w.range });
        AU.sfx(w.proj === 'fireball' ? 'fire' : 'shoot'); return;
      }
      AU.sfx('swing');
      const anim = w.anim || 'swing'; p.animType = anim; p.swing = anim === 'spin' ? 0.32 : anim === 'chop' ? 0.28 : anim === 'slash' ? 0.16 : 0.22; p.swingMax = p.swing;
      let hx = p.x + p.dir.x * w.range * 0.55, hy = p.y + p.dir.y * w.range * 0.55, hr = w.range * 0.65; let hitAny = false;
      if (anim === 'spin') { hx = p.x; hy = p.y; hr = w.range; this.burst(p.x, p.y, w.color, 14, 140); }
      if (anim === 'chop') { hx = p.x + p.dir.x * w.range * 0.7; hy = p.y + p.dir.y * w.range * 0.7; hr = w.range * 0.75; this.shake = 0.12; setTimeout(() => this.burst(hx, hy + 8, '#8a5a2b', 10, 90, true), 120); }
      if (anim === 'double') this.pendingHits.push({ t: 0.13, x: hx, y: hy, r: hr, dmg: w.atk, dir: p.dir });
      for (const e of this.enemies) { if (e.def.boss && this.sealed) continue; if (Math.hypot(e.x - hx, e.y - hy) < hr + e.r) { hitAny = true; this.damageEnemy(e, w.atk, p.dir); } }
      for (const pr of this.projectiles) if (!pr.fromPlayer && Math.hypot(pr.x - hx, pr.y - hy) < hr + 6) { pr.life = 0; this.burst(pr.x, pr.y, '#fff', 5, 60); }
      if (!hitAny) this.burst(hx, hy, 'rgba(255,255,255,0.6)', 3, 40);
    }
    damageEnemy(e, dmg, dir, ranged) {
      e.hp -= dmg; e.flash = 0.15; const l = Math.hypot(dir.x, dir.y) || 1, kb = (e.def.boss || e.def.nightmare) ? 40 : (ranged ? 90 : 170);
      e.kx += dir.x / l * kb; e.ky += dir.y / l * kb; this.freeze = Math.max(this.freeze, e.def.boss ? 0.06 : 0.04); AU.sfx('hit');
      this.floatText(e.x, e.y - e.r - 6, `-${dmg}`, '#ffe24a'); this.burst(e.x, e.y, '#fff', 6, 80);
      if (e.hp <= 0) this.killEnemy(e);
    }
    killEnemy(e) {
      this.kills++; this.lastKill = { x: e.x, y: e.y };
      this.corpses.push({ x: e.x, y: e.y, sprite: e.def.sprite, size: e.def.size, face: e.face, t: 0 });
      this.burst(e.x, e.y, e.def.boss ? '#ffd84a' : '#9be39b', e.def.boss ? 60 : 14, e.def.boss ? 220 : 120, true);
      if (e.def.behaviour === 'dummy') { this.tutorialAdvance('hit'); return; }
      if (!e.def.boss && Math.random() < 0.1) this.pickups.push({ kind: 'heart', x: e.x, y: e.y, t: 0 });
      if (e.def.nightmare) { this.endNightmare(true); return; }
      if (e.def.boss) { for (const m of this.enemies) if (m !== e && m.minion) m.hp = 0; this.msg(`${e.def.name} defeated!`, '#ffd84a', 3, true); this.shake = 0.5; this.freeze = 0.25; AU.sfx('explode'); AU.play('victory'); }
    }
    hurtPlayer(dmg, dir, hazard) {
      const p = this.player; if (p.inv > 0) return;
      const real = Math.max(0.5, Math.round(dmg * (1 - this.armor().def) * 2) / 2);
      p.hp -= real; this.damageTaken += real; p.inv = hazard ? 0.7 : 0.9; this.flash = 0.18; this.shake = 0.15; AU.sfx('hurt');
      const l = Math.hypot(dir.x, dir.y) || 1; p.kx += dir.x / l * 160; p.ky += dir.y / l * 160;
      this.floatText(p.x, p.y - 24, `-${real}`, '#ff5f5f'); this.burst(p.x, p.y, '#ff5f5f', 8, 90);
      if (p.hp <= 0) {
        if (this.save.apples > 0) { this.save.apples--; p.hp = this.maxHp(); p.inv = 1.5; this.msg('Golden Apple saved you!', '#ffd84a', 2.5, true); this.burst(p.x, p.y, '#ffd84a', 30, 150); AU.sfx('chest'); if (this.cb.onCreditsChange) this.cb.onCreditsChange(this.save.credits); }
        else if (this.nightmare) { p.hp = 0; this.state = 'paused'; IN.setEnabled(false); AU.stop(); AU.sfx('thunder'); if (this.cb.onNightmareDeath) this.cb.onNightmareDeath(); }
        else { p.hp = 0; this.state = 'paused'; IN.setEnabled(false); AU.stop(); if (this.cb.onPlayerDown) this.cb.onPlayerDown(); }
      }
    }

    // ---------- enemy AI ----------
    updateEnemy(e, dt) {
      const p = this.player, d = e.def;
      e.t += dt; e.anim += dt * 8; e.flash = Math.max(0, e.flash - dt); e.cd -= dt; e.stun = Math.max(0, e.stun - dt);
      if (d.behaviour === 'dummy') return;
      if (d.boss && this.sealed) { e.anim += dt * 0.1; return; } // asleep behind the door
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
      const aggro = dist < (d.boss ? 9999 : 280); if (Math.abs(dx) > 3) e.face = dx > 0 ? 1 : -1;
      let vx = 0, vy = 0; const avoid = !d.flying;
      if (e.stun > 0) { /* stunned */ }
      else if (d.behaviour === 'chase') { if (aggro) { vx = ux * e.speed; vy = uy * e.speed; } else this.wander(e, dt); }
      else if (d.behaviour === 'shoot') {
        if (aggro) { if (dist < d.keepDist - 20) { vx = -ux * e.speed; vy = -uy * e.speed; } else if (dist > d.keepDist + 30) { vx = ux * e.speed; vy = uy * e.speed; }
          if (e.cd <= 0 && dist < 300) { e.cd = d.shotCd; this.shoot(e, ux, uy, d.shotSpeed, e.dmg, d.sprite === 'wisp' ? 'fireball' : 'arrow'); } } else this.wander(e, dt);
      }
      else if (d.behaviour === 'dash') {
        if (e.state === 'dash') { e.dashT -= dt; vx = e.dx * d.dashSpeed; vy = e.dy * d.dashSpeed; if (e.dashT <= 0) { e.state = 'idle'; e.cd = d.dashCd; } }
        else if (aggro) { if (dist < 150 && e.cd <= 0) { e.state = 'dash'; e.dashT = 0.4; e.dx = ux; e.dy = uy; } else { vx = ux * e.speed; vy = uy * e.speed; } } else this.wander(e, dt);
      }
      else if (d.behaviour === 'boomer') {
        if (e.fuse >= 0) { e.fuse -= dt; if (e.fuse <= 0) { this.explode(e); return; } }
        else if (aggro) { vx = ux * e.speed; vy = uy * e.speed; if (dist < 44) e.fuse = d.fuse; } else this.wander(e, dt);
      }
      else if (d.behaviour === 'boss') { ({ vx, vy } = this.bossAI(e, dt, ux, uy, dist)); }
      else if (d.behaviour === 'nightmare') {
        vx = ux * e.speed; vy = uy * e.speed;
        e.tpT = (e.tpT === undefined ? 1.5 : e.tpT) - dt; e.boltT = (e.boltT === undefined ? 2 : e.boltT) - dt;
        if (e.tpT <= 0) { e.tpT = d.teleportCd; this.burst(e.x, e.y, '#ffffff', 12, 120); const a = rnd(0, Math.PI * 2); let nx = p.x + Math.cos(a) * 90, ny = p.y + Math.sin(a) * 90; if (!this.blocked(nx, ny, e.cr, true)) { e.x = nx; e.y = ny; } this.burst(e.x, e.y, '#ffffff', 12, 120); AU.sfx('teleport'); }
        if (e.boltT <= 0) { e.boltT = d.boltCd; this.bolts.push({ x: p.x, y: p.y, t: 0, delay: d.boltDelay, dmg: e.dmg, r: d.boltRadius }); AU.sfx('charge'); }
      }
      vx += e.kx; vy += e.ky; e.kx *= Math.pow(0.0005, dt); e.ky *= Math.pow(0.0005, dt);
      this.moveEntity(e, vx * dt, vy * dt, avoid);
      if (dist < e.r + p.r && p.inv <= 0 && d.behaviour !== 'boomer') this.hurtPlayer(e.dmg, { x: ux, y: uy });
      for (const o of this.enemies) if (o !== e) { const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy); if (od > 0 && od < e.r + o.r) { e.x += ox / od * 0.6; e.y += oy / od * 0.6; } }
    }
    wander(e, dt) { e.wander.t -= dt; if (e.wander.t <= 0) { e.wander.t = rnd(0.8, 2.2); const a = rnd(0, Math.PI * 2), go = Math.random() < 0.6; e.wander.x = go ? Math.cos(a) : 0; e.wander.y = go ? Math.sin(a) : 0; } this.moveEntity(e, e.wander.x * e.speed * 0.45 * dt, e.wander.y * e.speed * 0.45 * dt, !e.def.flying); }
    shoot(e, ux, uy, speed, dmg, sprite) { this.projectiles.push({ x: e.x + ux * e.r, y: e.y + uy * e.r, vx: ux * speed, vy: uy * speed, dmg, sprite, life: 4, ang: Math.atan2(uy, ux) }); AU.sfx(sprite === 'fireball' ? 'fire' : 'shoot'); }
    explode(e) {
      e.hp = 0; this.kills++; this.lastKill = { x: e.x, y: e.y }; this.burst(e.x, e.y, '#ff8a2a', 30, 220); this.burst(e.x, e.y, '#ffe24a', 20, 160, true); this.shake = 0.3; AU.sfx('explode');
      const p = this.player; if (Math.hypot(p.x - e.x, p.y - e.y) < e.def.blast + p.r) this.hurtPlayer(e.dmg, { x: p.x - e.x, y: p.y - e.y });
      for (const o of this.enemies) if (o !== e && Math.hypot(o.x - e.x, o.y - e.y) < e.def.blast) this.damageEnemy(o, 3, { x: o.x - e.x, y: o.y - e.y });
    }
    bossAI(e, dt, ux, uy, dist) {
      const d = e.def; e.phaseT += dt; let vx = 0, vy = 0;
      const minions = this.enemies.filter((m) => m.minion && m.hp > 0).length;
      e.summonT = (e.summonT || 6) - dt;
      if (e.summonT <= 0 && minions < 3) { e.summonT = 11; for (let i = 0; i < 2; i++) { const a = rnd(0, Math.PI * 2); const m = this.addEnemy(d.summon, e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, true); this.burst(m.x, m.y, '#c77dff', 10, 90); } this.msg(`${d.name} calls for help!`, '#c77dff', 1.5); }
      const pattern = d.pattern === 'all' ? ['hop', 'charge', 'fire'][Math.floor(e.t / 6) % 3] : d.pattern;
      if (e.phase === 'chase') { vx = ux * e.speed; vy = uy * e.speed; if (e.phaseT > 2.5) { e.phase = pattern; e.phaseT = 0; e.dx = ux; e.dy = uy; e.phaseN = 0; } }
      else if (e.phase === 'hop') {
        if (e.phaseT < 0.5) { /* crouch */ } else if (e.phaseT < 0.9) { vx = e.dx * 260; vy = e.dy * 260; e.hop = Math.sin((e.phaseT - 0.5) / 0.4 * Math.PI) * 24; }
        else { if (e.hop > 0) { e.hop = 0; this.burst(e.x, e.y + e.r, '#8fef8f', 20, 140); this.shake = 0.25; const p = this.player; if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + 40) this.hurtPlayer(e.dmg, { x: p.x - e.x, y: p.y - e.y }); } if (e.phaseT > 1.4) { e.phase = 'chase'; e.phaseT = 0; } }
      } else if (e.phase === 'charge') {
        if (e.phaseT < 0.6) { e.dx = ux; e.dy = uy; }
        else if (e.phaseT < 1.6) { const ox = e.x, oy = e.y; this.moveEntity(e, e.dx * 300 * dt, e.dy * 300 * dt, false); if (e.x === ox && e.y === oy) { e.stun = 1.2; e.phase = 'chase'; e.phaseT = 0; this.burst(e.x, e.y, '#aaa', 16, 120); this.shake = 0.3; AU.sfx('explode'); } }
        else { e.phase = 'chase'; e.phaseT = 0; }
      } else if (e.phase === 'fire') {
        if (e.phaseT > 0.4 * (e.phaseN + 1) && e.phaseN < 3) { e.phaseN++; for (let k = -1; k <= 1; k++) { const a = Math.atan2(uy, ux) + k * 0.35; this.shoot(e, Math.cos(a), Math.sin(a), 150, e.dmg * 0.6, 'fireball'); } }
        if (e.phaseT > 2) { e.phase = 'chase'; e.phaseT = 0; }
      }
      return { vx, vy };
    }

    // ---------- rendering ----------
    render() {
      const g = this.ctx, z = this.zoom, dpr = this.dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
      const W = this.W, H = this.H, p = this.player;
      let camX = p.x - W / 2 / z, camY = p.y - H / 2 / z;
      camX = clamp(camX, 0, Math.max(0, this.mw * T - W / z)); camY = clamp(camY, 0, Math.max(0, this.mh * T - H / z));
      if (this.shake > 0) { this.shake -= 0.016; camX += rnd(-5, 5); camY += rnd(-5, 5); }
      this.cam = { x: camX, y: camY };
      g.fillStyle = this.world.sky; g.fillRect(0, 0, W, H);
      const ts = Math.ceil(T * z) + 1, x0 = Math.max(0, Math.floor(camX / T)), y0 = Math.max(0, Math.floor(camY / T));
      const x1 = Math.min(this.mw - 1, Math.ceil((camX + W / z) / T)), y1 = Math.min(this.mh - 1, Math.ceil((camY + H / z) / T)), aframe = Math.floor(this.time * 2.5) % 3;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const name = this.grid[y][x]; const img = SP.tile(name, this.variant[y][x], SP.isAnimated(name) ? aframe : 0); if (img) g.drawImage(img, Math.floor((x * T - camX) * z), Math.floor((y * T - camY) * z), ts, ts); }
      g.drawImage(SP.mob(this.portalOpen ? 'portal' : 'portalOff'), Math.floor((this.portal.tx * T - camX) * z), Math.floor((this.portal.ty * T - camY) * z), ts, ts);
      if (this.portalOpen) { g.save(); g.globalAlpha = 0.35 + 0.2 * Math.sin(this.time * 6); g.fillStyle = '#c77dff'; g.beginPath(); g.arc((this.portal.x - camX) * z, (this.portal.y - camY) * z, T * z * 0.7, 0, Math.PI * 2); g.fill(); g.restore(); }
      // sealed barrier
      if (this.gate) {
        const gx = (this.gate.x - camX) * z;
        if (this.sealed) { g.save(); g.globalAlpha = 0.45 + 0.1 * Math.sin(this.time * 4); g.fillStyle = '#8a2be2'; g.fillRect(gx - 4 * z, 0, 8 * z, H); g.globalAlpha = 0.9; for (let yy = 0; yy < H; yy += 48 * z) g.drawImage(SP.mob('gate'), gx - 12 * z, yy + ((this.time * 20 * z) % (48 * z)) - 24 * z, 24 * z, 24 * z); g.restore(); }
      }
      // stall + sign behind the trader
      this.drawMob(g, 'stall', this.trader.x, this.trader.y - 22, 48, 1, 0, null, 0, true);
      const drawables = [];
      drawables.push({ y: this.trader.y, draw: () => this.drawMob(g, 'trader', this.trader.x, this.trader.y, 32, 1, 0, null, Math.sin(this.time * 3) * 1.5) });
      for (const c of this.corpses) drawables.push({ y: c.y, draw: () => this.drawCorpse(g, c) });
      for (const e of this.enemies) drawables.push({ y: e.y, draw: () => this.drawEnemy(g, e) });
      drawables.push({ y: p.y, draw: () => this.drawPlayer(g) });
      for (const k of this.pickups) drawables.push({ y: k.y, draw: () => this.drawMob(g, 'heart', k.x, k.y - 4 + Math.sin(k.t * 5) * 3, 24, 1) });
      if (this.chest) drawables.push({ y: this.chest.y, draw: () => this.drawMob(g, this.chest.open ? 'chestOpen' : 'chest', this.chest.x, this.chest.y + (this.chest.open ? 0 : Math.sin(this.chest.t * 4) * 2), 30, 1) });
      drawables.sort((a, b) => a.y - b.y); for (const d of drawables) d.draw();
      for (const pr of this.projectiles) { const img = SP.mob(pr.sprite); const sx = (pr.x - camX) * z, sy = (pr.y - camY) * z, s = 30 * z / 2; g.save(); g.translate(sx, sy); g.rotate(pr.ang); g.drawImage(img, -s, -s, s * 2, s * 2); g.restore(); }
      for (const q of this.particles) { g.globalAlpha = clamp(q.life * 2, 0, 1); g.fillStyle = q.color; const s = (q.sq ? 5 : 3) * z; g.fillRect((q.x - camX) * z - s / 2, (q.y - camY) * z - s / 2, s, s); }
      g.globalAlpha = 1;
      // SHOP sign
      { const sx = (this.trader.x - camX) * z, sy = (this.trader.y - camY) * z - 34 * z + Math.sin(this.time * 2.5) * 3; g.save(); g.fillStyle = '#6d4c2a'; g.fillRect(sx - 20 * z / 1.3, sy - 7 * z / 1.3, 40 * z / 1.3, 14 * z / 1.3); g.fillStyle = '#ffd84a'; g.font = `bold ${Math.round(7 * z)}px "Press Start 2P", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SHOP', sx, sy + 1); g.restore(); }
      for (const tx of this.texts) {
        const a = 1 - tx.t / tx.life; g.save(); g.globalAlpha = clamp(a * 1.5, 0, 1);
        if (tx.x === null) { g.font = `bold ${tx.big ? 22 : 14}px "Press Start 2P", monospace`; g.textAlign = 'center'; const yy = H * (tx.big ? 0.28 : 0.36); const ww = g.measureText(tx.text).width; if (!tx.big) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(W / 2 - ww / 2 - 14, yy - 20, ww + 28, 30); } g.fillStyle = '#000'; g.fillText(tx.text, W / 2 + 2, yy + 2); g.fillStyle = tx.color; g.fillText(tx.text, W / 2, yy); }
        else { g.font = 'bold 13px "Press Start 2P", monospace'; g.textAlign = 'center'; const sx = (tx.x - camX) * z, sy = (tx.y - camY) * z - tx.t * 40; g.fillStyle = '#000'; g.fillText(tx.text, sx + 1, sy + 1); g.fillStyle = tx.color; g.fillText(tx.text, sx, sy); }
        g.restore();
      }
      if (this.world.id === 2) { const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.65)'); g.fillStyle = grd; g.fillRect(0, 0, W, H); }
      // lightning: warning ring, then the bolt
      for (const b of this.bolts) { const bx = (b.x - camX) * z, by = (b.y - camY) * z;
        if (!b.struck) { g.save(); g.globalAlpha = 0.5 + 0.4 * Math.sin(b.t * 30); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.arc(bx, by, b.r * z * (0.6 + 0.4 * b.t / b.delay), 0, Math.PI * 2); g.stroke(); g.restore(); }
        else { const k = (b.t - b.delay) / 0.35; g.save(); g.globalAlpha = 1 - k; g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.shadowColor = '#9ad8ff'; g.shadowBlur = 18; g.beginPath(); let x = bx + rnd(-40, 40), y = -10; g.moveTo(x, y); for (let i = 1; i <= 6; i++) { y = by * i / 6; x = i === 6 ? bx : bx + rnd(-30, 30); g.lineTo(x, y); } g.stroke(); g.restore(); } }
      if (this.nightmare) { const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7); grd.addColorStop(0, 'rgba(60,0,0,0)'); grd.addColorStop(1, `rgba(60,0,0,${0.5 + 0.1 * Math.sin(this.time * 9)})`); g.fillStyle = grd; g.fillRect(0, 0, W, H); }
      if (this.flash > 0) { g.fillStyle = `rgba(255,40,40,${this.flash * 2})`; g.fillRect(0, 0, W, H); }
      this.drawHUD(g, W, H);
    }
    drawShadow(g, x, y, w) { const z = this.zoom, c = this.cam; g.save(); g.globalAlpha = 0.28; g.fillStyle = '#000'; g.beginPath(); g.ellipse((x - c.x) * z, (y - c.y) * z, w * z * 0.42, w * z * 0.16, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    drawMob(g, name, x, y, size, face, flash, overrides, bob, noShadow) {
      const z = this.zoom, c = this.cam, img = SP.mob(name, overrides); if (!img) return;
      const s = size * z, sx = (x - c.x) * z, sy = (y - c.y) * z + (bob || 0) * z;
      if (!noShadow) this.drawShadow(g, x, y + size * 0.45, size);
      g.save(); g.translate(sx, sy - s * 0.1); if (face < 0) g.scale(-1, 1); g.drawImage(img, -s / 2, -s / 2, s, s);
      if (flash > 0) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.7; g.fillStyle = '#fff'; g.fillRect(-s / 2, -s / 2, s, s); }
      g.restore();
    }
    drawCorpse(g, c) { const z = this.zoom, cam = this.cam, k = c.t / 0.3, s = c.size * z, sx = (c.x - cam.x) * z, sy = (c.y - cam.y) * z; g.save(); g.globalAlpha = 1 - k; g.translate(sx, sy + s * 0.4); g.scale((1 + k) * (c.face < 0 ? -1 : 1), 1 - k * 0.9); g.drawImage(SP.mob(c.sprite), -s / 2, -s * 0.9, s, s); g.restore(); }
    drawPlayer(g) {
      const p = this.player, z = this.zoom, c = this.cam, w = this.weapon();
      const bob = p.moving ? Math.abs(Math.sin(p.anim)) * -3 : 0;
      if (p.inv > 0 && Math.floor(this.time * 12) % 2 === 0) g.globalAlpha = 0.45;
      this.drawMob(g, 'player', p.x, p.y, 32, p.face, 0, this.lookOverrides(), bob);
      const a = this.armor(); if (a.overlay) this.drawMob(g, a.overlay, p.x, p.y, 32, p.face, 0, null, bob, true);
      if (a.id === 'a_ench') { g.save(); g.globalAlpha = 0.25 + 0.15 * Math.sin(this.time * 6); g.fillStyle = '#c77dff'; g.beginPath(); g.arc((p.x - c.x) * z, (p.y - c.y) * z, 22 * z, 0, Math.PI * 2); g.fill(); g.restore(); }
      g.globalAlpha = 1;
      const max = p.swingMax || 0.22, k = p.swing > 0 ? 1 - p.swing / max : 0, sx = (p.x - c.x) * z, sy = (p.y - c.y) * z, s = 26 * z, a0 = Math.atan2(p.dir.y, p.dir.x), anim = p.animType || w.anim || 'swing';
      const img = SP.mob(w.sprite);
      if (w.kind === 'ranged') {
        g.save(); g.translate(sx + p.dir.x * 8 * z, sy - 2 * z); g.rotate(a0); if (p.face < 0 && Math.abs(a0) > Math.PI / 2) g.scale(1, -1);
        const recoil = p.swing > 0 ? (anim === 'xbow' ? -6 * z * (1 - k) : anim === 'bow' ? -3 * z * (1 - k) : 0) : 0; g.drawImage(img, -s * 0.3 + recoil, -s / 2, s, s); g.restore();
        if (p.swing > 0 && anim === 'staff') { g.save(); g.globalAlpha = 0.6 * (1 - k); g.fillStyle = '#ff7a2a'; g.beginPath(); g.arc(sx + p.dir.x * 22 * z, sy - 8 * z, 10 * z * (0.5 + k), 0, Math.PI * 2); g.fill(); g.restore(); }
        if (p.swing > 0 && anim === 'bow') { g.save(); g.globalAlpha = 0.5 * (1 - k); g.strokeStyle = '#fff'; g.lineWidth = 2 * z; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + p.dir.x * 40 * z, sy + p.dir.y * 40 * z); g.stroke(); g.restore(); }
      } else {
        let ang = a0 + 0.9; // resting angle
        if (p.swing > 0) {
          if (anim === 'swing') ang = a0 + (k - 0.5) * 2.2;
          else if (anim === 'slash') ang = a0 + (k - 0.5) * 3.0;
          else if (anim === 'chop') ang = a0 + (k < 0.4 ? -1.6 + k * 1.5 : -1.0 + (k - 0.4) / 0.6 * 1.3);
          else if (anim === 'double') ang = a0 + Math.sin(k * Math.PI * 2) * 1.3;
          else if (anim === 'spin') ang = a0 + k * Math.PI * 2;
        }
        g.save(); g.translate(sx, sy - 4 * z); g.rotate(ang + Math.PI / 4); g.drawImage(img, 2 * z, -s - 2 * z, s, s); g.restore();
        if (p.swing > 0) {
          g.save(); g.strokeStyle = w.color; g.lineCap = 'round';
          if (anim === 'spin') { g.globalAlpha = 0.5 * (1 - k); g.lineWidth = 4 * z; g.beginPath(); g.arc(sx, sy, w.range * 0.9 * z, a0, a0 + k * Math.PI * 2); g.stroke(); }
          else if (anim === 'double') { g.globalAlpha = 0.45 * (1 - k); g.lineWidth = 2.5 * z; g.beginPath(); g.arc(sx, sy, w.range * 0.8 * z, a0 - 1.0, a0 + 1.0); g.stroke(); g.beginPath(); g.arc(sx, sy - 6 * z, w.range * 0.65 * z, a0 + 1.0, a0 - 1.0, true); g.stroke(); }
          else if (anim === 'chop') { if (k > 0.4) { g.globalAlpha = 0.6 * (1 - k); g.lineWidth = 5 * z; g.beginPath(); g.moveTo(sx, sy - 20 * z); g.lineTo(sx + p.dir.x * w.range * 0.9 * z, sy + p.dir.y * w.range * 0.9 * z); g.stroke(); g.fillStyle = '#ffffff'; g.globalAlpha = 0.5 * (1 - k); g.beginPath(); g.arc(sx + p.dir.x * w.range * 0.7 * z, sy + p.dir.y * w.range * 0.7 * z, 14 * z * k, 0, Math.PI * 2); g.fill(); } }
          else if (anim === 'slash') { g.globalAlpha = 0.6 * (1 - k); g.lineWidth = 2 * z; g.strokeStyle = '#fff'; g.beginPath(); g.arc(sx, sy, w.range * 0.85 * z, a0 - 1.3, a0 + 1.3); g.stroke(); g.strokeStyle = w.color; g.lineWidth = 4 * z; g.globalAlpha = 0.3 * (1 - k); g.beginPath(); g.arc(sx, sy, w.range * 0.7 * z, a0 - 1.3, a0 + 1.3); g.stroke(); }
          else { g.globalAlpha = 0.35 * (1 - k); g.lineWidth = 3 * z; g.beginPath(); g.arc(sx, sy, w.range * 0.8 * z, a0 - 1.1, a0 + 1.1); g.stroke(); }
          g.restore();
        }
      }
    }
    drawEnemy(g, e) {
      const d = e.def; let bob = Math.sin(e.anim) * 1.5;
      if (d.flying) bob = Math.sin(e.anim * 0.7) * 4 - 6; if (e.phase === 'hop' && e.hop) bob = -e.hop; if (d.behaviour === 'boomer' && e.fuse >= 0) bob = Math.sin(e.t * 40) * 2;
      const flash = e.flash > 0 ? 1 : (d.behaviour === 'boomer' && e.fuse >= 0 && Math.floor(e.t * 12) % 2 === 0 ? 1 : 0);
      if (d.boss && this.sealed) g.globalAlpha = 0.75;
      this.drawMob(g, d.sprite, e.x, e.y, d.size, e.face, flash, null, bob); g.globalAlpha = 1;
      if (d.boss && this.sealed) { const z = this.zoom, c = this.cam; g.save(); g.font = `bold ${Math.round(8 * z)}px "Press Start 2P", monospace`; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText('z z z', (e.x - c.x) * z + 20 * z, (e.y - c.y) * z - d.size * z * 0.6 + Math.sin(this.time * 2) * 4); g.restore(); }
      if (d.nightmare) { const z = this.zoom, c = this.cam; g.save(); g.globalAlpha = 0.5 + 0.3 * Math.sin(this.time * 10); g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 12; g.fillRect((e.x - c.x) * z - 5 * z * e.face - (e.face > 0 ? 0 : 2 * z), (e.y - c.y) * z - 9 * z, 4 * z, 2 * z); g.fillRect((e.x - c.x) * z + 2 * z * e.face, (e.y - c.y) * z - 9 * z, 4 * z, 2 * z); g.restore(); }
      if (!d.boss && e.hp < e.maxHp) { const z = this.zoom, c = this.cam, w = d.size * z, x = (e.x - c.x) * z - w / 2, y = (e.y - c.y) * z - d.size * z * 0.7; g.fillStyle = '#000'; g.fillRect(x, y, w, 2 * z); g.fillStyle = '#5fcf5f'; g.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 2 * z); }
    }
    drawHUD(g, W, H) {
      const p = this.player, maxH = this.maxHp(), hs = 22, pad = 12, perRow = Math.min(maxH, 10);
      for (let i = 0; i < maxH; i++) { const x = pad + (i % perRow) * (hs + 2), y = pad + Math.floor(i / perRow) * (hs + 2), full = p.hp >= i + 1, half = !full && p.hp > i;
        g.save(); g.globalAlpha = full || half ? 1 : 0.3; g.drawImage(SP.mob('heart'), x, y, hs, hs); if (half) { g.globalAlpha = 1; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + hs / 2, y, hs / 2, hs); } g.restore(); }
      g.font = 'bold 12px "Press Start 2P", monospace'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 4;
      const narrow = W < 700, rows = Math.ceil(maxH / perRow), statusY = narrow ? pad + rows * (hs + 2) + 16 : 26;
      if (this.boss && this.boss.hp > 0 && !this.sealed) { const bw = Math.min(W * 0.6, 420), bx = W / 2 - bw / 2, by = narrow ? statusY - 12 : 14; g.fillStyle = '#000'; g.fillRect(bx - 2, by - 2, bw + 4, 18); g.fillStyle = '#c0163a'; g.fillRect(bx, by, bw * clamp(this.boss.hp / this.boss.maxHp, 0, 1), 14); g.fillStyle = '#fff'; g.fillText(this.bossDef.name, W / 2, by + 32); }
      else if (this.nightmare) { const e = this.nightmare.e, left = Math.max(0, Math.ceil(D.NIGHTMARE.duration - this.nightmare.t)); const bw = Math.min(W * 0.6, 420), bx = W / 2 - bw / 2, by = narrow ? statusY - 12 : 14; g.fillStyle = '#000'; g.fillRect(bx - 2, by - 2, bw + 4, 18); g.fillStyle = '#ffffff'; g.fillRect(bx, by, bw * clamp(e.hp / e.maxHp, 0, 1), 14); g.fillStyle = '#ff3b3b'; g.fillText(`HEROBRINE · survive ${left}s`, W / 2, by + 32); }
      else if (this.sealed) { g.fillStyle = '#c77dff'; g.fillText('→ The boss door is sealed. Walk to it!', W / 2, statusY); }
      else if (this.tutorial && !this.portalOpen) { /* hint shown below */ }
      else if (!this.portalOpen) g.fillText(`Enemies left: ${this.enemies.filter((e) => e.def.behaviour !== 'dummy').length}`, W / 2, statusY);
      else { g.fillStyle = '#c77dff'; g.fillText('→ Portal is open!', W / 2, statusY); }
      g.shadowBlur = 0;
      if (this.portalOpen) { const dx = this.portal.x - p.x, dy = this.portal.y - p.y, a = Math.atan2(dy, dx); if (Math.hypot(dx, dy) > 120) { const sx = (p.x - this.cam.x) * this.zoom + Math.cos(a) * 60, sy = (p.y - this.cam.y) * this.zoom + Math.sin(a) * 60; g.save(); g.translate(sx, sy); g.rotate(a); g.fillStyle = '#c77dff'; g.globalAlpha = 0.8 + 0.2 * Math.sin(this.time * 8); g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -10); g.lineTo(-8, 10); g.closePath(); g.fill(); g.restore(); } }
      if (this.hint && this.tutorial) { g.save(); g.font = 'bold 13px "Press Start 2P", monospace'; const ww = g.measureText(this.hint).width + 36, yy = H - 190; g.globalAlpha = 0.85 + 0.15 * Math.sin(this.time * 5); g.fillStyle = '#1d1030'; g.fillRect(W / 2 - ww / 2, yy - 22, ww, 36); g.strokeStyle = '#ffd84a'; g.lineWidth = 3; g.strokeRect(W / 2 - ww / 2, yy - 22, ww, 36); g.fillStyle = '#ffd84a'; g.textAlign = 'center'; g.fillText(this.hint, W / 2, yy + 2); g.restore(); }
      if (this.nearTrader) { g.fillStyle = '#ffd84a'; g.font = 'bold 12px "Press Start 2P", monospace'; g.fillText('Press TRADE to open the shop', W / 2, H - 150); }
      IN.drawOverlay(g, W, H, { trade: this.nearTrader, ranged: this.weapon().kind === 'ranged' });
    }

    // ---------- controls from UI ----------
    pause() { if (this.state === 'play') { this.state = 'paused'; IN.setEnabled(false); } }
    resume() { if (this.state === 'paused' && this.player.hp > 0 && !this.cleared && !(this.sealed && this.riddleAsked && this.riddleOpen)) { this.state = 'play'; IN.setEnabled(true); this.lastTs = 0; } }
    stop() { this.state = 'idle'; IN.setEnabled(false); }
    healFull() { if (this.player) this.player.hp = this.maxHp(); }
    riddleCancelled() { this.riddleAsked = false; this.player.x = this.gate.x - 90; this.state = 'play'; IN.setEnabled(true); this.lastTs = 0; }
  }
  window.Game = Game; window.TILE = T;
})();
