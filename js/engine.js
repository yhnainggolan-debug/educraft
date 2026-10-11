/* =====================================================================
   EduCraft — Game engine
   Top-down tile world, procedural stages, combat, enemy AI, bosses.
   The engine owns the canvas; UI (DOM) is in ui.js and talks to the
   engine through a small set of callbacks (onStageClear, onPlayerDown,
   onTrader, onCreditsChange).
   ===================================================================== */
(function () {
  'use strict';
  const T = 32;                 // world px per tile
  const D = window.GameData, SP = window.Sprites, IN = window.Input;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rndi = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class Game {
    constructor(canvas, save) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.save = save;                     // shared save object (see ui.js)
      this.state = 'idle';                  // idle | play | paused
      this.time = 0; this.frame = 0;
      this.cb = {};                         // callbacks from UI
      this.resize();
      window.addEventListener('resize', () => this.resize());
      IN.attach(canvas);
      this.lastTs = 0;
      requestAnimationFrame((ts) => this.loop(ts));
    }

    // ---------- sizing ----------
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth, h = window.innerHeight;
      this.W = w; this.H = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
      // Fit roughly 16 tiles across in landscape, 13 tall in portrait
      this.zoom = clamp(Math.max(w / (16 * T), h / (13 * T)), 1.2, 3.2);
      this.ctx.imageSmoothingEnabled = false;
    }

    // ---------- stage lifecycle ----------
    startStage(worldIdx, stageIdx) {
      const world = D.WORLDS[worldIdx], stage = world.stages[stageIdx];
      this.world = world; this.stage = stage; this.worldIdx = worldIdx; this.stageIdx = stageIdx;
      this.scale = D.worldScale[world.id];
      this.genMap(world, stage);
      this.enemies = []; this.projectiles = []; this.pickups = []; this.particles = []; this.texts = [];
      this.portalOpen = false; this.cleared = false; this.bossDef = null; this.boss = null;
      this.spawnPlayer();
      this.spawnEnemies(stage);
      this.state = 'play'; this.stageTime = 0; this.kills = 0;
      this.msg(`${stage.name}`, '#fff', 2.2, true);
    }

    weapon() { return D.WEAPONS.find((w) => w.id === this.save.weapon) || D.WEAPONS[0]; }
    armor() { return D.ARMORS.find((a) => a.id === this.save.armor) || D.ARMORS[0]; }
    maxHp() { return 10 + this.armor().hp; }

    spawnPlayer() {
      const s = this.spawn;
      this.player = { x: s.x * T + T / 2, y: s.y * T + T / 2, r: 11, hp: this.maxHp(), face: 1, dir: { x: 1, y: 0 }, swing: 0, cd: 0, inv: 0, kx: 0, ky: 0, anim: 0, moving: false };
    }

    // ---------- map generation ----------
    genMap(world, stage) {
      const [W, H] = stage.size; this.mw = W; this.mh = H;
      const tl = world.tiles;
      const grid = [], solid = [], hazard = [], variant = [];
      for (let y = 0; y < H; y++) {
        grid.push([]); solid.push([]); hazard.push([]); variant.push([]);
        for (let x = 0; x < W; x++) {
          const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
          let t;
          if (border) t = pick(tl.wall);
          else if (Math.random() < stage.density) t = pick(tl.wall);
          else t = pick(tl.floor);
          grid[y].push(t); solid[y].push(SP.isWall(t)); hazard[y].push(false); variant[y].push(rndi(0, 7));
        }
      }
      // hazard pools (2x2 / 3x2 patches)
      if (tl.hazard && stage.hazard > 0) {
        const pools = Math.floor(W * H * stage.hazard / 4);
        for (let i = 0; i < pools; i++) {
          const px = rndi(2, W - 5), py = rndi(2, H - 4), pw = rndi(2, 3), ph = rndi(1, 2);
          for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) { grid[y][x] = tl.hazard; solid[y][x] = false; hazard[y][x] = true; }
        }
      }
      // spawn area: clear a 5x5 around left-middle
      const sx = 3, sy = Math.floor(H / 2);
      for (let y = sy - 2; y <= sy + 2; y++) for (let x = sx - 1; x <= sx + 4; x++) if (x > 0 && y > 0 && x < W - 1 && y < H - 1) { grid[y][x] = tl.floor[0]; solid[y][x] = false; hazard[y][x] = false; }
      this.spawn = { x: sx, y: sy };
      this.trader = { x: (sx + 3) * T + T / 2, y: (sy - 1) * T + T / 2, r: 14 };
      // connectivity: BFS from spawn over non-solid; unreachable floor -> wall
      const dist = this.bfs(sx, sy, solid, hazard, W, H);
      let far = { x: sx, y: sy, d: 0 };
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (!solid[y][x] && dist[y][x] < 0) { grid[y][x] = pick(tl.wall); solid[y][x] = true; hazard[y][x] = false; }
        else if (!solid[y][x] && !hazard[y][x] && dist[y][x] > far.d) far = { x, y, d: dist[y][x] };
      }
      // portal at the farthest reachable tile
      this.portal = { tx: far.x, ty: far.y, x: far.x * T + T / 2, y: far.y * T + T / 2 };
      grid[far.y][far.x] = tl.floor[0]; hazard[far.y][far.x] = false;
      this.grid = grid; this.solid = solid; this.hazardMap = hazard; this.variant = variant; this.dist = dist;
    }

    bfs(sx, sy, solid, hazard, W, H) {
      const dist = Array.from({ length: H }, () => Array(W).fill(-1));
      const q = [[sx, sy]]; dist[sy][sx] = 0;
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || solid[ny][nx] || hazard[ny][nx] || dist[ny][nx] >= 0) continue;
          dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]);
        }
      }
      return dist;
    }

    freeTileFar(minDist) {
      for (let tries = 0; tries < 400; tries++) {
        const x = rndi(1, this.mw - 2), y = rndi(1, this.mh - 2);
        if (!this.solid[y][x] && !this.hazardMap[y][x] && this.dist[y][x] >= minDist && !(x === this.portal.tx && y === this.portal.ty)) return { x: x * T + T / 2, y: y * T + T / 2 };
      }
      return { x: this.portal.x, y: this.portal.y };
    }

    spawnEnemies(stage) {
      for (const [type, count] of stage.enemies) for (let i = 0; i < count; i++) { const p = this.freeTileFar(7); this.addEnemy(type, p.x, p.y); }
      if (stage.boss) {
        // boss waits about 9 tiles to the right of spawn so the fight starts within seconds
        let p = null;
        for (let tries = 0; tries < 300 && !p; tries++) {
          const tx = this.spawn.x + 8 + rndi(0, 3), ty = this.spawn.y + rndi(-3, 3);
          if (tx < this.mw - 2 && ty > 0 && ty < this.mh - 1 && !this.solid[ty][tx] && !this.hazardMap[ty][tx]) p = { x: tx * T + T / 2, y: ty * T + T / 2 };
        }
        if (!p) p = this.freeTileFar(6);
        const b = this.addEnemy(stage.boss, p.x, p.y); this.boss = b; this.bossDef = D.ENEMIES[stage.boss];
      }
    }

    addEnemy(type, x, y, isMinion) {
      const def = D.ENEMIES[type];
      const e = {
        type, def, x, y, r: def.size / 2 - 2, cr: def.boss ? 14 : Math.min(def.size / 2 - 2, 13), hp: def.hp * this.scale.hp, maxHp: def.hp * this.scale.hp,
        dmg: def.dmg * this.scale.dmg, speed: def.speed, state: 'idle', t: rnd(0, 1), cd: rnd(0.5, 2), face: -1,
        vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, anim: rnd(0, 10), wander: { x: 0, y: 0, t: 0 }, minion: !!isMinion, fuse: -1, phaseT: 0, phase: 'chase', stun: 0,
      };
      this.enemies.push(e); return e;
    }

    // ---------- helpers ----------
    tileAt(px, py) { const tx = Math.floor(px / T), ty = Math.floor(py / T); if (tx < 0 || ty < 0 || tx >= this.mw || ty >= this.mh) return null; return { tx, ty }; }
    blocked(px, py, r, avoidHazard) {
      // circle approx by its bounding box corners + edges
      const pts = [[px - r, py - r], [px + r, py - r], [px - r, py + r], [px + r, py + r], [px, py - r], [px, py + r], [px - r, py], [px + r, py]];
      for (const [x, y] of pts) {
        const t = this.tileAt(x, y); if (!t) return true;
        if (this.solid[t.ty][t.tx]) return true;
        if (avoidHazard && this.hazardMap[t.ty][t.tx]) return true;
      }
      return false;
    }
    moveEntity(e, dx, dy, avoidHazard) {
      const r = e.cr || e.r; // collision radius (bosses use a small one so they never wedge between blocks)
      if (dx && !this.blocked(e.x + dx, e.y, r, avoidHazard)) e.x += dx; else if (dx) { e.vx = 0; e.kx = 0; }
      if (dy && !this.blocked(e.x, e.y + dy, r, avoidHazard)) e.y += dy; else if (dy) { e.vy = 0; e.ky = 0; }
    }
    msg(text, color, life, big) { this.texts.push({ x: null, y: null, text, color: color || '#fff', life: life || 1, big: !!big, t: 0 }); }
    floatText(x, y, text, color) { this.texts.push({ x, y, text, color: color || '#fff', life: 0.9, t: 0 }); }
    burst(x, y, color, n, speed) { for (let i = 0; i < (n || 8); i++) { const a = rnd(0, Math.PI * 2), s = rnd(20, speed || 90); this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.3, 0.7), color }); } }
    addCredits(n) { this.save.credits += n; if (this.cb.onCreditsChange) this.cb.onCreditsChange(this.save.credits); }

    // ---------- main loop ----------
    loop(ts) {
      const dt = Math.min(0.033, (ts - (this.lastTs || ts)) / 1000); this.lastTs = ts;
      if (this.state === 'play') { this.update(dt); }
      if (this.state === 'play' || this.state === 'paused') this.render();
      requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
      this.time += dt; this.stageTime += dt; this.frame++;
      const p = this.player;
      // ---- player movement ----
      const ax = IN.getAxis();
      const spd = 115;
      let vx = ax.x * spd, vy = ax.y * spd;
      p.moving = Math.abs(ax.x) + Math.abs(ax.y) > 0.05;
      if (p.moving) { const l = Math.hypot(ax.x, ax.y) || 1; p.dir = { x: ax.x / l, y: ax.y / l }; if (Math.abs(ax.x) > 0.2) p.face = ax.x > 0 ? 1 : -1; p.anim += dt * 10; }
      vx += p.kx; vy += p.ky; p.kx *= Math.pow(0.001, dt); p.ky *= Math.pow(0.001, dt);
      this.moveEntity(p, vx * dt, vy * dt, false);
      p.cd = Math.max(0, p.cd - dt); p.inv = Math.max(0, p.inv - dt); p.swing = Math.max(0, p.swing - dt);

      // hazard under player
      const under = this.tileAt(p.x, p.y);
      if (under && this.hazardMap[under.ty][under.tx] && p.inv <= 0) this.hurtPlayer(1, { x: -p.dir.x, y: -p.dir.y }, true);

      // ---- trader proximity & attack / trade ----
      // Trade only when standing by the Trader AND no enemy is close — fighting always wins
      const enemyClose = this.enemies.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 90 + e.r);
      const nearTrader = !enemyClose && Math.hypot(this.trader.x - p.x, this.trader.y - p.y) < 46;
      this.nearTrader = nearTrader;
      if (IN.consumeAttack()) {
        if (nearTrader) { if (this.cb.onTrader) this.cb.onTrader(); }
        else this.attack();
      }

      // ---- portal ----
      if (this.portalOpen && Math.hypot(this.portal.x - p.x, this.portal.y - p.y) < 24 && !this.cleared) {
        this.cleared = true; this.state = 'paused';
        if (this.cb.onStageClear) this.cb.onStageClear(this.worldIdx, this.stageIdx, { kills: this.kills, time: this.stageTime });
        return;
      }

      // ---- enemies ----
      for (const e of this.enemies) this.updateEnemy(e, dt);
      // remove dead
      const before = this.enemies.length;
      this.enemies = this.enemies.filter((e) => e.hp > 0);
      // ---- projectiles ----
      for (const pr of this.projectiles) {
        pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
        const t = this.tileAt(pr.x, pr.y);
        if (!t || this.solid[t.ty][t.tx]) { pr.life = 0; this.burst(pr.x, pr.y, '#ccc', 4, 50); continue; }
        if (Math.hypot(pr.x - p.x, pr.y - p.y) < p.r + 6) { this.hurtPlayer(pr.dmg, { x: pr.vx, y: pr.vy }); pr.life = 0; }
      }
      this.projectiles = this.projectiles.filter((pr) => pr.life > 0);
      // ---- pickups ----
      for (const k of this.pickups) {
        k.t += dt;
        if (Math.hypot(k.x - p.x, k.y - p.y) < p.r + 12) {
          k.dead = true;
          if (k.kind === 'heart') { p.hp = Math.min(this.maxHp(), p.hp + 2); this.floatText(p.x, p.y - 20, '+2 ♥', '#ff5f7a'); this.burst(k.x, k.y, '#ff5f7a', 8, 60); }
        }
      }
      this.pickups = this.pickups.filter((k) => !k.dead && k.t < 20);
      // ---- particles & texts ----
      for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy *= 0.9; q.life -= dt; }
      this.particles = this.particles.filter((q) => q.life > 0);
      for (const tx of this.texts) tx.t += dt;
      this.texts = this.texts.filter((tx) => tx.t < tx.life);

      // ---- stage clear check ----
      if (!this.portalOpen) {
        const alive = this.enemies.length;
        const bossDone = !this.bossDef || !this.boss || this.boss.hp <= 0;
        if (alive === 0 && bossDone) { this.portalOpen = true; this.msg('Portal opened! Find it!', '#c77dff', 2.5, true); this.burst(this.portal.x, this.portal.y, '#c77dff', 30, 160); }
      }
    }

    attack() {
      const p = this.player, w = this.weapon();
      if (p.cd > 0) return;
      // auto-aim: face the nearest enemy within reach so small thumbs don't need precision
      let best = null, bd = w.range + 30;
      for (const e of this.enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r; if (d < bd) { bd = d; best = e; } }
      if (best) { const dx = best.x - p.x, dy = best.y - p.y, l = Math.hypot(dx, dy) || 1; p.dir = { x: dx / l, y: dy / l }; if (Math.abs(dx) > 4) p.face = dx > 0 ? 1 : -1; }
      p.cd = w.cd; p.swing = 0.22;
      const hx = p.x + p.dir.x * w.range * 0.55, hy = p.y + p.dir.y * w.range * 0.55, hr = w.range * 0.65;
      let hitAny = false;
      for (const e of this.enemies) {
        if (Math.hypot(e.x - hx, e.y - hy) < hr + e.r) {
          hitAny = true;
          this.damageEnemy(e, w.atk, p.dir);
        }
      }
      // deflect projectiles
      for (const pr of this.projectiles) if (Math.hypot(pr.x - hx, pr.y - hy) < hr + 6) { pr.life = 0; this.burst(pr.x, pr.y, '#fff', 5, 60); }
      if (!hitAny) this.burst(hx, hy, 'rgba(255,255,255,0.6)', 3, 40);
    }

    damageEnemy(e, dmg, dir) {
      e.hp -= dmg; e.flash = 0.15;
      const kb = e.def.boss ? 40 : 170;
      e.kx += dir.x * kb; e.ky += dir.y * kb;
      this.floatText(e.x, e.y - e.r - 6, `-${dmg}`, '#ffe24a');
      this.burst(e.x, e.y, '#fff', 6, 80);
      if (e.hp <= 0) this.killEnemy(e);
    }

    killEnemy(e) {
      this.kills++;
      this.burst(e.x, e.y, e.def.boss ? '#ffd84a' : '#9be39b', e.def.boss ? 60 : 14, e.def.boss ? 220 : 110);
      if (!e.def.boss && Math.random() < 0.18) this.pickups.push({ kind: 'heart', x: e.x, y: e.y, t: 0 });
      if (e.def.boss) { for (const m of this.enemies) if (m !== e && m.minion) m.hp = 0; this.msg(`${e.def.name} defeated!`, '#ffd84a', 3, true); }
    }

    hurtPlayer(dmg, dir, hazard) {
      const p = this.player; if (p.inv > 0) return;
      const def = this.armor().def;
      let real = Math.max(0.5, Math.round(dmg * (1 - def) * 2) / 2);
      p.hp -= real; p.inv = hazard ? 0.7 : 0.9;
      const l = Math.hypot(dir.x, dir.y) || 1; p.kx += dir.x / l * 160; p.ky += dir.y / l * 160;
      this.floatText(p.x, p.y - 24, `-${real}`, '#ff5f5f'); this.burst(p.x, p.y, '#ff5f5f', 8, 90);
      if (p.hp <= 0) {
        if (this.save.apples > 0) { this.save.apples--; p.hp = this.maxHp(); p.inv = 1.5; this.msg('Golden Apple saved you!', '#ffd84a', 2.5, true); this.burst(p.x, p.y, '#ffd84a', 30, 150); if (this.cb.onCreditsChange) this.cb.onCreditsChange(this.save.credits); }
        else { p.hp = 0; this.state = 'paused'; if (this.cb.onPlayerDown) this.cb.onPlayerDown(); }
      }
    }

    // ---------- enemy AI ----------
    updateEnemy(e, dt) {
      const p = this.player, d = e.def;
      e.t += dt; e.anim += dt * 8; e.flash = Math.max(0, e.flash - dt); e.cd -= dt; e.stun = Math.max(0, e.stun - dt);
      const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist;
      const aggro = dist < (d.boss ? 9999 : 280);
      if (Math.abs(dx) > 3) e.face = dx > 0 ? 1 : -1;
      let vx = 0, vy = 0;
      const avoid = !d.flying;

      if (e.stun > 0) { /* stunned */ }
      else if (d.behaviour === 'chase') { if (aggro) { vx = ux * e.speed; vy = uy * e.speed; } else this.wander(e, dt); }
      else if (d.behaviour === 'shoot') {
        if (aggro) {
          if (dist < d.keepDist - 20) { vx = -ux * e.speed; vy = -uy * e.speed; } else if (dist > d.keepDist + 30) { vx = ux * e.speed; vy = uy * e.speed; }
          if (e.cd <= 0 && dist < 300) { e.cd = d.shotCd; this.shoot(e, ux, uy, d.shotSpeed, e.dmg, d.sprite === 'wisp' ? 'fireball' : 'arrow'); }
        } else this.wander(e, dt);
      }
      else if (d.behaviour === 'dash') {
        if (e.state === 'dash') { e.dashT -= dt; vx = e.dx * d.dashSpeed; vy = e.dy * d.dashSpeed; if (e.dashT <= 0) { e.state = 'idle'; e.cd = d.dashCd; } }
        else if (aggro) { if (dist < 150 && e.cd <= 0) { e.state = 'dash'; e.dashT = 0.4; e.dx = ux; e.dy = uy; } else { vx = ux * e.speed; vy = uy * e.speed; } }
        else this.wander(e, dt);
      }
      else if (d.behaviour === 'boomer') {
        if (e.fuse >= 0) { e.fuse -= dt; if (e.fuse <= 0) { this.explode(e); return; } }
        else if (aggro) { vx = ux * e.speed; vy = uy * e.speed; if (dist < 44) { e.fuse = d.fuse; } }
        else this.wander(e, dt);
      }
      else if (d.behaviour === 'boss') { ({ vx, vy } = this.bossAI(e, dt, ux, uy, dist)); }

      vx += e.kx; vy += e.ky; e.kx *= Math.pow(0.0005, dt); e.ky *= Math.pow(0.0005, dt);
      this.moveEntity(e, vx * dt, vy * dt, avoid);

      // contact damage
      if (dist < e.r + p.r && p.inv <= 0 && !(d.behaviour === 'boomer')) this.hurtPlayer(e.dmg, { x: ux, y: uy });
      // enemy separation (soft)
      for (const o of this.enemies) if (o !== e) { const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy); if (od > 0 && od < e.r + o.r) { e.x += ox / od * 0.6; e.y += oy / od * 0.6; } }
    }

    wander(e, dt) {
      e.wander.t -= dt;
      if (e.wander.t <= 0) { e.wander.t = rnd(0.8, 2.2); const a = rnd(0, Math.PI * 2); const go = Math.random() < 0.6; e.wander.x = go ? Math.cos(a) : 0; e.wander.y = go ? Math.sin(a) : 0; }
      this.moveEntity(e, e.wander.x * e.speed * 0.45 * dt, e.wander.y * e.speed * 0.45 * dt, !e.def.flying);
    }
    shoot(e, ux, uy, speed, dmg, sprite) {
      this.projectiles.push({ x: e.x + ux * e.r, y: e.y + uy * e.r, vx: ux * speed, vy: uy * speed, dmg, sprite, life: 4, ang: Math.atan2(uy, ux) });
    }
    explode(e) {
      e.hp = 0; this.kills++;
      this.burst(e.x, e.y, '#ff8a2a', 30, 220); this.burst(e.x, e.y, '#ffe24a', 20, 160);
      const p = this.player; if (Math.hypot(p.x - e.x, p.y - e.y) < e.def.blast + p.r) this.hurtPlayer(e.dmg, { x: p.x - e.x, y: p.y - e.y });
      for (const o of this.enemies) if (o !== e && Math.hypot(o.x - e.x, o.y - e.y) < e.def.blast) this.damageEnemy(o, 3, { x: o.x - e.x, y: o.y - e.y });
    }

    bossAI(e, dt, ux, uy, dist) {
      const d = e.def; e.phaseT += dt;
      let vx = 0, vy = 0;
      const minions = this.enemies.filter((m) => m.minion && m.hp > 0).length;
      // summon minions periodically
      e.summonT = (e.summonT || 6) - dt;
      if (e.summonT <= 0 && minions < 3) { e.summonT = 11; for (let i = 0; i < 2; i++) { const a = rnd(0, Math.PI * 2); const m = this.addEnemy(d.summon, e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, true); this.burst(m.x, m.y, '#c77dff', 10, 90); } this.msg(`${d.name} calls for help!`, '#c77dff', 1.5); }
      const pattern = d.pattern === 'all' ? ['hop', 'charge', 'fire'][Math.floor(e.t / 6) % 3] : d.pattern;
      if (e.phase === 'chase') {
        vx = ux * e.speed; vy = uy * e.speed;
        if (e.phaseT > 2.5) { e.phase = pattern; e.phaseT = 0; e.dx = ux; e.dy = uy; e.phaseN = 0; }
      } else if (e.phase === 'hop') {
        // big lunge toward player; damaging landing
        if (e.phaseT < 0.5) { /* crouch */ } else if (e.phaseT < 0.9) { vx = e.dx * 260; vy = e.dy * 260; e.hop = Math.sin((e.phaseT - 0.5) / 0.4 * Math.PI) * 24; }
        else { if (e.hop > 0) { e.hop = 0; this.burst(e.x, e.y + e.r, '#8fef8f', 20, 140); const p = this.player; if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + 40) this.hurtPlayer(e.dmg, { x: p.x - e.x, y: p.y - e.y }); } if (e.phaseT > 1.4) { e.phase = 'chase'; e.phaseT = 0; } }
      } else if (e.phase === 'charge') {
        if (e.phaseT < 0.6) { e.dx = ux; e.dy = uy; } // aim
        else if (e.phaseT < 1.6) { const ox = e.x, oy = e.y; vx = e.dx * 300; vy = e.dy * 300; this.moveEntity(e, vx * dt, vy * dt, false); if (e.x === ox && e.y === oy) { e.stun = 1.2; e.phase = 'chase'; e.phaseT = 0; this.burst(e.x, e.y, '#aaa', 16, 120); this.shake = 0.3; } vx = 0; vy = 0; }
        else { e.phase = 'chase'; e.phaseT = 0; }
      } else if (e.phase === 'fire') {
        if (e.phaseT > 0.4 * (e.phaseN + 1) && e.phaseN < 3) { e.phaseN++; for (let k = -1; k <= 1; k++) { const a = Math.atan2(uy, ux) + k * 0.35; this.shoot(e, Math.cos(a), Math.sin(a), 150, e.dmg * 0.6, 'fireball'); } }
        if (e.phaseT > 2) { e.phase = 'chase'; e.phaseT = 0; }
      }
      return { vx, vy };
    }

    // ---------- rendering ----------
    render() {
      const g = this.ctx, z = this.zoom, dpr = this.dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.imageSmoothingEnabled = false;
      const W = this.W, H = this.H, p = this.player;
      // camera
      let camX = p.x - W / 2 / z, camY = p.y - H / 2 / z;
      camX = clamp(camX, 0, Math.max(0, this.mw * T - W / z)); camY = clamp(camY, 0, Math.max(0, this.mh * T - H / z));
      if (this.shake > 0) { this.shake -= 0.016; camX += rnd(-4, 4); camY += rnd(-4, 4); }
      this.cam = { x: camX, y: camY };
      g.fillStyle = this.world.sky; g.fillRect(0, 0, W, H);
      const ts = Math.ceil(T * z) + 1;
      const x0 = Math.max(0, Math.floor(camX / T)), y0 = Math.max(0, Math.floor(camY / T));
      const x1 = Math.min(this.mw - 1, Math.ceil((camX + W / z) / T)), y1 = Math.min(this.mh - 1, Math.ceil((camY + H / z) / T));
      const aframe = Math.floor(this.time * 2.5) % 3;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const name = this.grid[y][x];
        const img = SP.tile(name, this.variant[y][x], SP.isAnimated(name) ? aframe : 0);
        if (img) g.drawImage(img, Math.floor((x * T - camX) * z), Math.floor((y * T - camY) * z), ts, ts);
      }
      // portal
      const pimg = SP.mob(this.portalOpen ? 'portal' : 'portalOff');
      g.drawImage(pimg, Math.floor((this.portal.tx * T - camX) * z), Math.floor((this.portal.ty * T - camY) * z), ts, ts);
      if (this.portalOpen) { g.save(); g.globalAlpha = 0.35 + 0.2 * Math.sin(this.time * 6); g.fillStyle = '#c77dff'; g.beginPath(); g.arc((this.portal.x - camX) * z, (this.portal.y - camY) * z, T * z * 0.7, 0, Math.PI * 2); g.fill(); g.restore(); }

      // draw order by y
      const drawables = [];
      drawables.push({ y: this.trader.y, draw: () => this.drawMob(g, 'trader', this.trader.x, this.trader.y, 32, 1, 0, null, Math.sin(this.time * 3) * 1.5) });
      for (const e of this.enemies) drawables.push({ y: e.y, draw: () => this.drawEnemy(g, e) });
      drawables.push({ y: p.y, draw: () => this.drawPlayer(g) });
      for (const k of this.pickups) drawables.push({ y: k.y, draw: () => this.drawMob(g, 'heart', k.x, k.y - 4 + Math.sin(k.t * 5) * 3, 24, 1) });
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) d.draw();
      // projectiles
      for (const pr of this.projectiles) {
        const img = SP.mob(pr.sprite); const sx = (pr.x - camX) * z, sy = (pr.y - camY) * z, s = 24 * z / 32 * 16 / 16 * 1.0;
        g.save(); g.translate(sx, sy); g.rotate(pr.ang); g.drawImage(img, -s / 2 * 1.3, -s / 2 * 1.3, s * 1.3, s * 1.3); g.restore();
      }
      // particles
      for (const q of this.particles) { g.globalAlpha = clamp(q.life * 2, 0, 1); g.fillStyle = q.color; const s = 3 * z; g.fillRect((q.x - camX) * z - s / 2, (q.y - camY) * z - s / 2, s, s); }
      g.globalAlpha = 1;
      // floating texts
      for (const tx of this.texts) {
        const a = 1 - tx.t / tx.life;
        g.save(); g.globalAlpha = clamp(a * 1.5, 0, 1);
        if (tx.x === null) { g.font = `bold ${tx.big ? 22 : 15}px "Press Start 2P", monospace`; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(tx.text, W / 2 + 2, H * 0.28 + 2); g.fillStyle = tx.color; g.fillText(tx.text, W / 2, H * 0.28); }
        else { g.font = 'bold 13px "Press Start 2P", monospace'; g.textAlign = 'center'; const sx = (tx.x - camX) * z, sy = (tx.y - camY) * z - tx.t * 40; g.fillStyle = '#000'; g.fillText(tx.text, sx + 1, sy + 1); g.fillStyle = tx.color; g.fillText(tx.text, sx, sy); }
        g.restore();
      }
      // vignette for cave/lava
      if (this.world.id === 2) { const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.65)'); g.fillStyle = grd; g.fillRect(0, 0, W, H); }
      this.drawHUD(g, W, H);
    }

    drawShadow(g, x, y, w) { const z = this.zoom, c = this.cam; g.save(); g.globalAlpha = 0.28; g.fillStyle = '#000'; g.beginPath(); g.ellipse((x - c.x) * z, (y - c.y) * z, w * z * 0.42, w * z * 0.16, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    drawMob(g, name, x, y, size, face, flash, overrides, bob) {
      const z = this.zoom, c = this.cam, img = SP.mob(name, overrides); if (!img) return;
      const s = size * z, sx = (x - c.x) * z, sy = (y - c.y) * z + (bob || 0) * z;
      this.drawShadow(g, x, y + size * 0.45, size);
      g.save(); g.translate(sx, sy - s * 0.1); if (face < 0) g.scale(-1, 1);
      g.drawImage(img, -s / 2, -s / 2, s, s);
      if (flash > 0) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.7; g.fillStyle = '#fff'; g.fillRect(-s / 2, -s / 2, s, s); }
      g.restore();
    }
    drawPlayer(g) {
      const p = this.player, z = this.zoom, c = this.cam;
      const bob = p.moving ? Math.abs(Math.sin(p.anim)) * -3 : 0;
      if (p.inv > 0 && Math.floor(this.time * 12) % 2 === 0) g.globalAlpha = 0.45;
      this.drawMob(g, 'player', p.x, p.y, 32, p.face, 0, { ARMOR: this.armor().color }, bob);
      g.globalAlpha = 1;
      // sword
      const w = this.weapon(); const swing = p.swing > 0 ? (0.22 - p.swing) / 0.22 : 0;
      const ang = Math.atan2(p.dir.y, p.dir.x) + (swing > 0 ? (swing - 0.5) * 2.2 : 0.9) ;
      const sx = (p.x - c.x) * z, sy = (p.y - c.y) * z;
      g.save(); g.translate(sx, sy - 4 * z); g.rotate(ang + Math.PI / 4); const s = 26 * z;
      g.drawImage(SP.mob('sword', { BLADE: w.color }), 2 * z, -s - 2 * z, s, s); g.restore();
      if (p.swing > 0) { g.save(); g.globalAlpha = 0.35 * (p.swing / 0.22); g.strokeStyle = w.color; g.lineWidth = 6 * z / 2; g.beginPath(); const a0 = Math.atan2(p.dir.y, p.dir.x); g.arc(sx, sy, w.range * 0.8 * z, a0 - 1.1, a0 + 1.1); g.stroke(); g.restore(); }
    }
    drawEnemy(g, e) {
      const d = e.def; let bob = Math.sin(e.anim) * 1.5;
      if (d.flying) bob = Math.sin(e.anim * 0.7) * 4 - 6;
      if (e.phase === 'hop' && e.hop) bob = -e.hop;
      if (d.behaviour === 'boomer' && e.fuse >= 0) { bob = Math.sin(e.t * 40) * 2; }
      const flash = e.flash > 0 ? 1 : (d.behaviour === 'boomer' && e.fuse >= 0 && Math.floor(e.t * 12) % 2 === 0 ? 1 : 0);
      this.drawMob(g, d.sprite, e.x, e.y, d.size, e.face, flash, null, bob);
      // hp bar for non-boss
      if (!d.boss && e.hp < e.maxHp) { const z = this.zoom, c = this.cam, w = d.size * z, x = (e.x - c.x) * z - w / 2, y = (e.y - c.y) * z - d.size * z * 0.7; g.fillStyle = '#000'; g.fillRect(x, y, w, 4 * z / 2); g.fillStyle = '#5fcf5f'; g.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 4 * z / 2); }
    }

    drawHUD(g, W, H) {
      const p = this.player;
      // hearts
      const maxH = this.maxHp(), hs = 22, pad = 12;
      const perRow = Math.min(maxH, 10);
      for (let i = 0; i < maxH; i++) {
        const x = pad + (i % perRow) * (hs + 2), y = pad + Math.floor(i / perRow) * (hs + 2);
        const full = p.hp >= i + 1, half = !full && p.hp > i;
        g.save(); g.globalAlpha = full || half ? 1 : 0.3; g.drawImage(SP.mob('heart'), x, y, hs, hs);
        if (half) { g.globalAlpha = 1; g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + hs / 2, y, hs / 2, hs); }
        g.restore();
      }
      // enemies left / boss bar
      g.font = 'bold 12px "Press Start 2P", monospace'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 4;
      // on narrow screens the hearts take the top-left, so push the status line below them
      const narrow = W < 700, rows = Math.ceil(maxH / perRow), statusY = narrow ? pad + rows * (hs + 2) + 16 : 26;
      if (this.boss && this.boss.hp > 0) {
        const bw = Math.min(W * 0.6, 420), bx = W / 2 - bw / 2, by = narrow ? statusY - 12 : 14;
        g.fillStyle = '#000'; g.fillRect(bx - 2, by - 2, bw + 4, 18); g.fillStyle = '#c0163a'; g.fillRect(bx, by, bw * clamp(this.boss.hp / this.boss.maxHp, 0, 1), 14);
        g.fillStyle = '#fff'; g.fillText(this.bossDef.name, W / 2, by + 32);
      } else if (!this.portalOpen) {
        g.fillText(`Enemies left: ${this.enemies.length}`, W / 2, statusY);
      } else { g.fillStyle = '#c77dff'; g.fillText('→ Portal is open!', W / 2, statusY); }
      g.shadowBlur = 0;
      // portal direction arrow when open
      if (this.portalOpen) {
        const dx = this.portal.x - p.x, dy = this.portal.y - p.y, a = Math.atan2(dy, dx);
        if (Math.hypot(dx, dy) > 120) { const sx = (p.x - this.cam.x) * this.zoom + Math.cos(a) * 60, sy = (p.y - this.cam.y) * this.zoom + Math.sin(a) * 60; g.save(); g.translate(sx, sy); g.rotate(a); g.fillStyle = '#c77dff'; g.globalAlpha = 0.8 + 0.2 * Math.sin(this.time * 8); g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -10); g.lineTo(-8, 10); g.closePath(); g.fill(); g.restore(); }
      }
      // trader hint
      if (this.nearTrader) { g.fillStyle = '#ffd84a'; g.font = 'bold 12px "Press Start 2P", monospace'; g.fillText('Trader: press TRADE to shop', W / 2, H - 150); }
      IN.drawOverlay(g, W, H, { trade: this.nearTrader });
    }

    // ---------- controls from UI ----------
    pause() { if (this.state === 'play') { this.state = 'paused'; IN.setEnabled(false); } }
    resume() { if (this.state === 'paused' && this.player.hp > 0 && !this.cleared) { this.state = 'play'; IN.setEnabled(true); this.lastTs = 0; } }
    stop() { this.state = 'idle'; IN.setEnabled(false); }
    healFull() { if (this.player) this.player.hp = this.maxHp(); }
  }

  window.Game = Game;
  window.TILE = T;
})();
