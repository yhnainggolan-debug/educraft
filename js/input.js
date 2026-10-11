/* =====================================================================
   EduCraft — Input: floating touch joystick (left), attack zone (right),
   keyboard fallback (WASD / arrows, Space or J = attack, E = interact).
   Designed for small thumbs: the joystick appears wherever the left
   thumb lands, and ANY tap on the right half attacks.
   ===================================================================== */
(function () {
  'use strict';

  const state = {
    axis: { x: 0, y: 0 },
    attackQueued: false,
    joystick: null,          // { ox, oy, x, y, id } while touching
    keys: {},
    enabled: true,
    tapTargets: [],          // [{x,y,r,onTap}] screen-space hotspots (e.g. trader)
  };
  const JOY_RADIUS = 56;     // px travel radius

  function keyAxis() {
    const k = state.keys;
    let x = 0, y = 0;
    if (k.ArrowLeft || k.a || k.A) x -= 1;
    if (k.ArrowRight || k.d || k.D) x += 1;
    if (k.ArrowUp || k.w || k.W) y -= 1;
    if (k.ArrowDown || k.s || k.S) y += 1;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  function attach(canvas) {
    const rect = () => canvas.getBoundingClientRect();

    // ---- touch ----
    canvas.addEventListener('touchstart', (e) => {
      if (!state.enabled) return;
      e.preventDefault();
      const r = rect();
      for (const t of e.changedTouches) {
        const x = t.clientX - r.left, y = t.clientY - r.top;
        // explicit hotspots first (trader, portal hints etc.)
        let hit = false;
        for (const h of state.tapTargets) { if (Math.hypot(h.x - x, h.y - y) < h.r) { h.onTap(); hit = true; break; } }
        if (hit) continue;
        if (x < r.width * 0.5) {
          if (!state.joystick) state.joystick = { ox: x, oy: y, x, y, id: t.identifier };
        } else {
          state.attackQueued = true;
        }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      if (!state.enabled) return;
      e.preventDefault();
      const r = rect();
      for (const t of e.changedTouches) {
        if (state.joystick && t.identifier === state.joystick.id) {
          const j = state.joystick; j.x = t.clientX - r.left; j.y = t.clientY - r.top;
          let dx = j.x - j.ox, dy = j.y - j.oy; const d = Math.hypot(dx, dy);
          if (d > JOY_RADIUS) { dx = dx / d * JOY_RADIUS; dy = dy / d * JOY_RADIUS; j.x = j.ox + dx; j.y = j.oy + dy; }
          const dead = 8;
          state.axis = d < dead ? { x: 0, y: 0 } : { x: dx / JOY_RADIUS, y: dy / JOY_RADIUS };
        }
      }
    }, { passive: false });
    const end = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (state.joystick && t.identifier === state.joystick.id) { state.joystick = null; state.axis = { x: 0, y: 0 }; }
      }
    };
    canvas.addEventListener('touchend', end, { passive: false });
    canvas.addEventListener('touchcancel', end, { passive: false });

    // ---- mouse (desktop testing) ----
    let mouseDown = false;
    canvas.addEventListener('mousedown', (e) => {
      if (!state.enabled) return;
      const r = rect(); const x = e.clientX - r.left, y = e.clientY - r.top;
      for (const h of state.tapTargets) { if (Math.hypot(h.x - x, h.y - y) < h.r) { h.onTap(); return; } }
      if (x < r.width * 0.5) { state.joystick = { ox: x, oy: y, x, y, id: 'mouse' }; mouseDown = true; }
      else state.attackQueued = true;
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown || !state.joystick) return;
      const r = rect(); const j = state.joystick; j.x = e.clientX - r.left; j.y = e.clientY - r.top;
      let dx = j.x - j.ox, dy = j.y - j.oy; const d = Math.hypot(dx, dy);
      if (d > JOY_RADIUS) { dx = dx / d * JOY_RADIUS; dy = dy / d * JOY_RADIUS; j.x = j.ox + dx; j.y = j.oy + dy; }
      state.axis = d < 8 ? { x: 0, y: 0 } : { x: dx / JOY_RADIUS, y: dy / JOY_RADIUS };
    });
    window.addEventListener('mouseup', () => { if (mouseDown) { mouseDown = false; state.joystick = null; state.axis = { x: 0, y: 0 }; } });

    // ---- keyboard ----
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      state.keys[e.key] = true;
      if (!state.enabled) return;
      if (e.key === ' ' || e.key === 'j' || e.key === 'J' || e.key === 'e' || e.key === 'E') { state.attackQueued = true; e.preventDefault(); }
      if (e.key.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { state.keys[e.key] = false; });
    window.addEventListener('blur', () => { state.keys = {}; state.joystick = null; state.axis = { x: 0, y: 0 }; });
  }

  function getAxis() {
    if (state.joystick) return state.axis;
    return keyAxis();
  }
  function consumeAttack() { const a = state.attackQueued; state.attackQueued = false; return a; }
  function setEnabled(v) { state.enabled = v; if (!v) { state.joystick = null; state.axis = { x: 0, y: 0 }; state.attackQueued = false; } }
  function setTapTargets(list) { state.tapTargets = list || []; }

  // Draw the joystick + attack button hint on the HUD layer
  function drawOverlay(ctx, W, H, opts) {
    const j = state.joystick;
    if (j) {
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(j.ox, j.oy, JOY_RADIUS + 10, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(j.ox, j.oy, JOY_RADIUS + 10, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(j.x, j.y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // attack button (visual only; whole right half is the hit zone)
    const bx = W - 76, by = H - 86, br = 44;
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.fillStyle = opts && opts.trade ? '#ffd84a' : '#ff5f5f'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(opts && opts.trade ? 'TRADE' : 'HIT!', bx, by + 1);
    ctx.restore();
  }

  window.Input = { attach, getAxis, consumeAttack, setEnabled, setTapTargets, drawOverlay, JOY_RADIUS };
})();
