/* =====================================================================
   EduCraft — Procedural pixel art
   Every tile and mob is a 16×16 grid of palette characters, rendered
   once to an offscreen canvas and then drawn scaled with smoothing off.
   '.' = transparent. Original blocky designs; no third-party assets.
   ===================================================================== */
(function () {
  'use strict';
  const S = 16;
  const cache = new Map();

  // Deterministic noise for tile texture variation
  function hash(x, y, seed) { let h = (x * 374761393 + y * 668265263 + seed * 97) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }

  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ---------- Tiles (procedural) ----------
  const TILE_DEFS = {
    grass:     { base: '#5fae3a', specks: ['#4e9a2e', '#73c24a', '#86d05a'], density: 0.35 },
    flower:    { base: '#5fae3a', specks: ['#4e9a2e', '#73c24a'], density: 0.3, flowers: ['#ff5f5f', '#ffe24a', '#ffffff', '#ff9ad5'] },
    dirt:      { base: '#8a5a2b', specks: ['#7a4c22', '#9c6b3c', '#6e4420'], density: 0.4 },
    sand:      { base: '#e3d28e', specks: ['#d6c47d', '#efe0a4'], density: 0.3 },
    stone:     { base: '#7d7d7d', specks: ['#6d6d6d', '#8d8d8d', '#999'], density: 0.35 },
    cobble:    { base: '#767676', specks: ['#5e5e5e', '#8e8e8e'], density: 0.5, cobble: true },
    gravel:    { base: '#8b8580', specks: ['#716b66', '#a19a94', '#6a6460'], density: 0.5 },
    netherrack:{ base: '#6e2a2a', specks: ['#5a1f1f', '#833636', '#4d1818'], density: 0.45 },
    basalt:    { base: '#3c3c44', specks: ['#2f2f36', '#4a4a54'], density: 0.3 },
    cloud:     { base: '#f3f7ff', specks: ['#e3ebfa', '#ffffff', '#d9e4f7'], density: 0.3 },
    quartz:    { base: '#ece6dc', specks: ['#dcd4c8', '#f7f2ea'], density: 0.25, cobble: true },
    water:     { base: '#2f7fd8', specks: ['#3f93ea', '#2669b8', '#6fb3f5'], density: 0.3, anim: true },
    lava:      { base: '#e8632a', specks: ['#ffae2e', '#c7411a', '#ffd84a'], density: 0.4, anim: true },
    void:      { base: '#150a2a', specks: ['#2a1650', '#3a1f6e', '#0b0518'], density: 0.3, anim: true },
    // walls (drawn with a darker bottom edge for a 3D cube feel)
    tree:      { wall: true, base: '#2e7d32', specks: ['#1b5e20', '#43a047', '#66bb6a'], density: 0.45, trunk: '#6d4c2a' },
    rock:      { wall: true, base: '#8d8d8d', specks: ['#777', '#a3a3a3', '#6a6a6a'], density: 0.4 },
    rockwall:  { wall: true, base: '#5d5d5d', specks: ['#4a4a4a', '#6f6f6f'], density: 0.4, cobble: true },
    ore:       { wall: true, base: '#5d5d5d', specks: ['#4a4a4a', '#6f6f6f'], density: 0.3, gems: ['#5fe3e0', '#ffd84a', '#ff6b6b'] },
    obsidian:  { wall: true, base: '#1d1030', specks: ['#2c1a4a', '#3a2460', '#120a20'], density: 0.4 },
    basaltwall:{ wall: true, base: '#2b2b33', specks: ['#1f1f26', '#3a3a44'], density: 0.3, cobble: true },
    glowstone: { wall: true, base: '#f6c445', specks: ['#ffe27a', '#e0a92c', '#fff3b0'], density: 0.5 },
    quartzwall:{ wall: true, base: '#d9d2c6', specks: ['#c7bfb1', '#ece6dc'], density: 0.3, cobble: true },
    crystal:   { wall: true, base: '#b9a7ff', specks: ['#d6ccff', '#9a84f0', '#f0ebff'], density: 0.5 },
  };

  function renderTile(name, variant, frame) {
    const d = TILE_DEFS[name]; if (!d) return null;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = d.base; g.fillRect(0, 0, S, S);
    const seed = variant * 31 + (frame || 0) * 7;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = hash(x, y, seed);
      if (r < d.density) { g.fillStyle = d.specks[Math.floor(hash(y, x, seed + 1) * d.specks.length)]; g.fillRect(x, y, 1, 1); }
    }
    if (d.cobble) { // stone block grid lines
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < S; i += 8) { g.fillRect(0, i, S, 1); g.fillRect(i + ((i / 8) % 2) * 4, 0, 1, 8); g.fillRect(i + 4 - ((i / 8) % 2) * 4, 8, 1, 8); }
    }
    if (d.flowers) {
      for (let i = 0; i < 2; i++) { const fx = 2 + Math.floor(hash(i, variant, 5) * 11), fy = 2 + Math.floor(hash(variant, i, 6) * 11);
        g.fillStyle = '#3f8a2a'; g.fillRect(fx + 1, fy + 2, 1, 2); g.fillStyle = d.flowers[Math.floor(hash(i, variant, 9) * d.flowers.length)]; g.fillRect(fx, fy, 3, 1); g.fillRect(fx + 1, fy - 1, 1, 3); }
    }
    if (d.gems) { for (let i = 0; i < 4; i++) { g.fillStyle = d.gems[i % d.gems.length]; g.fillRect(2 + Math.floor(hash(i, 3, variant) * 11), 2 + Math.floor(hash(7, i, variant) * 11), 2, 2); } }
    if (d.wall) {
      // top-light, bottom-dark bevel for a raised cube look
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, 0, S, 1); g.fillRect(0, 0, 1, S);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, S - 2, S, 2); g.fillRect(S - 1, 0, 1, S);
      if (d.trunk) { g.fillStyle = d.trunk; g.fillRect(6, 10, 4, 6); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(9, 10, 1, 6); }
    }
    return c;
  }

  // ---------- Mob sprites (16×16 string art) ----------
  // Palette letters are local to each sprite.
  const MOBS = {
    player: {
      pal: { h: 'HAIR', s: 'SKIN', e: '#ffffff', p: '#2d2d2d', t: 'ARMOR', l: '#3b5ba5', b: '#5a3a1a', m: '#c1583a' },
      rows: [
        '....hhhhhhhh....',
        '....hhhhhhhh....',
        '....hsssssss....',
        '....sseesees....',
        '....sspssps.....',
        '....sssssss.....',
        '....ssmmmss.....',
        '.....sssss......',
        '...tttttttttt...',
        '..sttttttttts...',
        '..stttttttttss..',
        '..s.tttttttt.s..',
        '....llllllll....',
        '....llll.llll...',
        '....lll...lll...',
        '....bbb...bbb...'],
    },
    trader: {
      pal: { h: '#7b4b2a', s: '#e8b98a', e: '#ffffff', p: '#222', r: '#7a1f6b', g: '#e6c15a', l: '#3a2a4a', b: '#2a1a0a', n: '#d4a373' },
      rows: [
        '....hhhhhhhh....',
        '...hhhhhhhhhh...',
        '...hsssssssss...',
        '...sseesseess...',
        '...ssspssspss...',
        '...sssssnnsss...',
        '...ssssnnnnss...',
        '....sssssss.....',
        '...rrrrrrrrrr...',
        '..rrrggrrggrrr..',
        '..rrrrrrrrrrrr..',
        '..r.rrrrrrrr.r..',
        '....llllllll....',
        '....llll.llll...',
        '....lll...lll...',
        '....bbb...bbb...'],
    },
    zombie: {
      pal: { g: '#3f8a3a', d: '#2d6b2a', e: '#000000', t: '#2a6fb5', l: '#3a3a8a', b: '#1a1a1a' },
      rows: [
        '....gggggggg....',
        '....gggggggg....',
        '....gggggggg....',
        '....ggeeggeeg...',
        '....gggggggg....',
        '....ggddddgg....',
        '....gggggggg....',
        '.....gggggg.....',
        '..gttttttttttg..',
        '..gttttttttttg..',
        '..gttttttttttg..',
        '..g.tttttttt.g..',
        '....llllllll....',
        '....llll.llll...',
        '....lll...lll...',
        '....bbb...bbb...'],
    },
    skeleton: {
      pal: { w: '#e6e6e6', d: '#9a9a9a', e: '#000000', b: '#bdbdbd' },
      rows: [
        '....wwwwwwww....',
        '....wwwwwwww....',
        '....wweewwee....',
        '....wweewwee....',
        '....wwwwwwww....',
        '....wdwdwdww....',
        '....wwwwwwww....',
        '.....wwwwww.....',
        '..w.wwwwwwww.w..',
        '..w.wdwwwwdw.w..',
        '..w.wwwwwwww.w..',
        '..w.wdwwwwdw.w..',
        '....wwwwwwww....',
        '....www..www....',
        '....www..www....',
        '....bbb..bbb....'],
    },
    spider: {
      pal: { k: '#1f1f1f', d: '#333', r: '#ff2e2e', l: '#2a2a2a' },
      rows: [
        '................',
        '................',
        '..l...kkkk...l..',
        '...l.kkkkkk.l...',
        '....kkkkkkkk....',
        '.l..krkkkkrk..l.',
        '..llkkkkkkkkll..',
        '....kkkkkkkk....',
        '..llkkkkkkkkll..',
        '.l..kkkkkkkk..l.',
        '....kddddddk....',
        '...l.kkkkkk.l...',
        '..l...kkkk...l..',
        '.l............l.',
        '................',
        '................'],
    },
    boomer: {
      pal: { r: '#d63a2a', d: '#a52a1c', y: '#ffe24a', k: '#1a1a1a', w: '#fff' },
      rows: [
        '....rrrrrrrr....',
        '....rrrrrrrr....',
        '....rkkrrkkr....',
        '....rkwrrkwr....',
        '....rrrrrrrr....',
        '....rrrkkrrr....',
        '....rrkkkkrr....',
        '....rrrkkrrr....',
        '....rdddddddr...',
        '....dyyyyyydd...',
        '....ddyTNTdd....',
        '....dyyyyyyd....',
        '....dddddddd....',
        '...kk.kkkk.kk...',
        '...kk......kk...',
        '................'],
    },
    wisp: {
      pal: { y: '#ffd84a', o: '#ff8a2a', r: '#ff4a2a', k: '#2a1a0a', w: '#fff' },
      rows: [
        '.......y........',
        '......yyy.......',
        '.....yyoyy......',
        '....yyoooyy.....',
        '....yoooooy.....',
        '...yooorrooy....',
        '...yookrkooy....',
        '...yooorrooy....',
        '...yoooooooy....',
        '....yooooy.y....',
        '....yooooyy.....',
        '.....yooy.......',
        '.....yooy.......',
        '......yy........',
        '......y.........',
        '................'],
    },
    golemling: {
      pal: { g: '#9a9a9a', d: '#6f6f6f', m: '#4caf50', e: '#ff3b3b' },
      rows: [
        '...gggggggggg...',
        '...gggggggggg...',
        '...ggeeggggeeg..',
        '...gggggggggg...',
        '...gggdddddgg...',
        '...gggggggggg...',
        '..gggggggggggg..',
        '.ggggmmmmmmgggg.',
        '.gggggmmmmggggg.',
        '.ggggggggggggg..',
        '.ddgggggggggdd..',
        '.dd.gggggggg.dd.',
        '....dddddddd....',
        '....ddd..ddd....',
        '....ddd..ddd....',
        '....ddd..ddd....'],
    },
    shade: {
      pal: { p: '#3b1e6e', d: '#24104a', e: '#c77dff', w: '#f0e6ff' },
      rows: [
        '.....pppppp.....',
        '....pppppppp....',
        '....ppeeppee....',
        '....ppewppew....',
        '....pppppppp....',
        '.....pppppp.....',
        '...pppppppppp...',
        '..pppppppppppp..',
        '..pppppppppppp..',
        '..pp.pppppp.pp..',
        '..pp.pppppp.pp..',
        '....pppppppp....',
        '....dpdppdpd....',
        '....d.d..d.d....',
        '................',
        '................'],
    },
    // Bosses — drawn larger by the engine (size field in data)
    bigslime: {
      pal: { g: '#5fcf5f', d: '#3f9f3f', l: '#8fef8f', e: '#1a1a1a' },
      rows: [
        '................',
        '....gggggggg....',
        '..gggggggggggg..',
        '.gglggggggggggg.',
        '.glggggggggggggg',
        'gggggeeggggeeggg',
        'gggggeeggggeeggg',
        'gggggggggggggggg',
        'gggggggggggggggg',
        'ggggggdddddggggg',
        'gggggggggggggggg',
        'gggggggggggggggg',
        '.gggggggggggggg.',
        '.dgggggggggggdd.',
        '..dddddddddddd..',
        '................'],
    },
    golem: {
      pal: { g: '#8c8c8c', d: '#5f5f5f', m: '#3f9f3f', e: '#ff3b3b', k: '#2a2a2a' },
      rows: [
        '....gggggggg....',
        '....gggggggg....',
        '....geegggeeg...',
        '....gggggggg....',
        '....gggdddgg....',
        '.....gggggg.....',
        'ggggggggggggggg.',
        'gggggmmmmmmggggg',
        'ggggmmmmmmmmgggg',
        'ggggggmmmmgggggg',
        'gggggggggggggggg',
        'ddd.gggggggg.ddd',
        'ddd.gggggggg.ddd',
        '....dddddddd....',
        '....ddd..ddd....',
        '....kkk..kkk....'],
    },
    wyrm: {
      pal: { o: '#ff7a2a', r: '#c43a1a', y: '#ffd84a', k: '#2a0a0a', w: '#fff' },
      rows: [
        '..........rrrr..',
        '.........rroorr.',
        '........rooooor.',
        '.......roowkoor.',
        '......rooooooor.',
        '.....roooyyyoor.',
        '....roooooyyyr..',
        '...roooooooor...',
        '..roooooooor....',
        '.rooooyyyoor....',
        'roooyyyyyoor....',
        'roooyyyyoor.....',
        '.rooooooor......',
        '..rroooorr......',
        '....rrrr........',
        '................'],
    },
    voidking: {
      pal: { p: '#2a0f4a', d: '#160726', e: '#ff3bd4', c: '#ffd84a', w: '#f0e6ff' },
      rows: [
        '..c.c.cccc.c.c..',
        '..cccccccccccc..',
        '....pppppppp....',
        '....ppeeppee....',
        '....ppewppew....',
        '....pppppppp....',
        '.....pppppp.....',
        '..pppppppppppp..',
        '.pppppppppppppp.',
        '.pppppppppppppp.',
        '.pp.pppppppp.pp.',
        '.pp.pppppppp.pp.',
        '....pppppppp....',
        '....pppppppp....',
        '....dpdppdpd....',
        '....d.d..d.d....'],
    },
    // ---- Weapons (shop cards + in-hand) ----
    sw_wood: { pal: { b: '#c9a06a', d: '#9c6b3c', h: '#6d4c2a', g: '#8a5a2b' }, rows: ['..............b.', '.............bb.', '............bbd.', '...........bbd..', '..........bbd...', '.........bbd....', '........bbd.....', '.......bbd......', '..gg..bbd.......', '...ggbbd........', '....gg..........', '...hhgg.........', '..hh............', '.hh.............', '................', '................'] },
    sw_stone: { pal: { b: '#a8a8a8', d: '#6e6e6e', h: '#6d4c2a', g: '#8a8a8a' }, rows: ['..............b.', '.............bb.', '............bbd.', '...........bbd..', '..........bbd...', '.........bbd....', '........bbd.....', '.......bbd......', '..gg..bbd.......', '...ggbbd........', '....gg..........', '...hhgg.........', '..hh............', '.hh.............', '................', '................'] },
    sw_iron: { pal: { b: '#f0f0f0', d: '#b0b0b0', h: '#6d4c2a', g: '#d8d8d8' }, rows: ['..............b.', '.............bb.', '............bbd.', '...........bbd..', '..........bbd...', '.........bbd....', '........bbd.....', '.......bbd......', '..gg..bbd.......', '...ggbbd........', '....gg..........', '...hhgg.........', '..hh............', '.hh.............', '................', '................'] },
    sw_diamond: { pal: { b: '#9ff5f3', d: '#3fc9c6', h: '#6d4c2a', g: '#5fe3e0' }, rows: ['..............b.', '.............bb.', '............bbd.', '...........bbd..', '..........bbd...', '.........bbd....', '........bbd.....', '.......bbd......', '..gg..bbd.......', '...ggbbd........', '....gg..........', '...hhgg.........', '..hh............', '.hh.............', '................', '................'] },
    sw_ench: { pal: { b: '#e5c8ff', d: '#a85cff', h: '#3a2460', g: '#c77dff', s: '#ffffff' }, rows: ['.............sb.', '............sbb.', '............bbd.', '...........bbd..', '.....s....bbd...', '.........bbd....', '........bbd..s..', '.......bbd......', '..gg..bbd.......', '...ggbbd........', '....gg..........', '...hhgg.........', '..hh......s.....', '.hh.............', '................', '................'] },
    axe_gold: { pal: { b: '#ffe06a', d: '#d9a520', h: '#6d4c2a', k: '#8a6a10' }, rows: ['........bbbbb...', '.......bbbbbbb..', '.......bbbbbbbb.', '........bbddbbb.', '.........bddbb..', '..........hdb...', '.........hh.....', '........hh......', '.......hh.......', '......hh........', '.....hh.........', '....hh..........', '...hh...........', '..hh............', '.hh.............', '................'] },
    bow: { pal: { w: '#b5651d', d: '#7a4418', s: '#eeeeee', a: '#d8d8d8', f: '#ff5f5f', k: '#4a3a2a' }, rows: ['.....ww.........', '....wddw........', '...wd..s........', '...wd..s........', '..wd...s........', '..wd...s........', '..wd...s........', '..wdffkkkkkkaa..', '..wd...s........', '..wd...s........', '..wd...s........', '...wd..s........', '...wd..s........', '....wddw........', '.....ww.........', '................'] },
    crossbow: { pal: { w: '#6d4c2a', d: '#3f2a14', m: '#9a9a9a', s: '#eeeeee', a: '#d8d8d8' }, rows: ['................', '......mm........', '....mm..mm......', '...m......m.....', '..m...ww...m....', '..m...ww...m....', '..ms..ww..sm....', '...sssaaaaaaaa..', '......ww........', '......ww........', '......ww........', '.....wwww.......', '.....wddw.......', '......ww........', '......ww........', '................'] },
    staff: { pal: { w: '#6d4c2a', o: '#ff7a2a', y: '#ffd84a', r: '#ff3a1a' }, rows: ['...........ry...', '..........ryyr..', '.........ryooyr.', '.........ryooyr.', '..........ryyr..', '..........ww....', '.........ww.....', '........ww......', '.......ww.......', '......ww........', '.....ww.........', '....ww..........', '...ww...........', '..ww............', '.ww.............', '................'] },
    // ---- Armor (chestplate icons) ----
    ar_none: { pal: { c: '#4fd1ff', d: '#2a9fc9' }, rows: ['................', '................', '...cc......cc...', '..cccc....cccc..', '..cccccccccccc..', '..cccccccccccc..', '..cdccccccccdc..', '....cccccccc....', '....cccccccc....', '....cccccccc....', '....cccccccc....', '....cccccccc....', '....cccccccc....', '....dddddddd....', '................', '................'] },
    ar_leather: { pal: { c: '#b5651d', d: '#7a4418', s: '#d08a4a' }, rows: ['................', '................', '...cc......cc...', '..cccc....cccc..', '..cccccccccccc..', '..cccsccccsccc..', '..cdccccccccdc..', '....cccccccc....', '....ccsccscc....', '....cccccccc....', '....ccccdccc....', '....cccccccc....', '....cccccccc....', '....dddddddd....', '................', '................'] },
    ar_chain: { pal: { c: '#a0a8b0', d: '#6e767e', s: '#d0d8e0' }, rows: ['................', '................', '...cc......cc...', '..cscs....scsc..', '..cscscscscscs..', '..scscscscscsc..', '..cdcscscscsdc..', '....scscscsc....', '....cscscscs....', '....scscscsc....', '....cscscscs....', '....scscscsc....', '....cscscscs....', '....dddddddd....', '................', '................'] },
    ar_iron: { pal: { c: '#e0e0e0', d: '#9a9a9a', s: '#ffffff' }, rows: ['................', '................', '...cc......cc...', '..cccc....cccc..', '..cccccccccccc..', '..csccccccccsc..', '..cdccccccccdc..', '....cccccccc....', '....cccddccc....', '....ccdccdcc....', '....cccddccc....', '....cccccccc....', '....cccccccc....', '....dddddddd....', '................', '................'] },
    ar_diamond: { pal: { c: '#6ef0ee', d: '#2fb8b5', s: '#ffffff' }, rows: ['................', '................', '...cc......cc...', '..cccc....cccc..', '..cccccccccccc..', '..cscccccccssc..', '..cdccccccccdc..', '....cccccccc....', '....cccssccc....', '....ccscscc.....', '....cccssccc....', '....cccccccc....', '....cccscccc....', '....dddddddd....', '................', '................'] },
    ar_ench: { pal: { c: '#d59bff', d: '#8a3fd9', s: '#ffffff', g: '#ffd84a' }, rows: ['................', '................', '...cc......cc...', '..cccc....cccc..', '..cccccccccccc..', '..cscccggcccsc..', '..cdcccggcccdc..', '....cccccccc....', '....ccsccscc....', '....cccccccc....', '....cccggccc....', '....cccccccc....', '....ccscccsc....', '....dddddddd....', '................', '................'] },
    apple: { pal: { g: '#ffd84a', d: '#d9a520', l: '#5fcf5f', s: '#6d4c2a', w: '#fff3b0' }, rows: ['................', '.......s........', '.......s.ll.....', '......ssll......', '....ggggggg.....', '...ggwgggggg....', '..gggwggggggg...', '..ggggggggggg...', '..ggggggggggg...', '..ggggggggggd...', '..ggggggggggd...', '...gggggggdd....', '....ggggddd.....', '.....ddddd......', '................', '................'] },
    // ---- World objects ----
    dummy: { pal: { w: '#c9a06a', d: '#8a5a2b', s: '#e3d28e', r: '#ff5f5f', k: '#2a2a2a' }, rows: ['.....ssssss.....', '....sskssks.....', '....ssssssss....', '....sssrrsss....', '.....ssssss.....', '......wwww......', '..ddwwwwwwwwdd..', '..ddwwwwwwwwdd..', '....wwwwwwww....', '....wwwrrwww....', '....wwwwwwww....', '.....wwwwww.....', '.......dd.......', '.......dd.......', '.....dddddd.....', '....dddddddd....'] },
    stall: { pal: { r: '#c43a3a', w: '#ffffff', d: '#6d4c2a', p: '#9c6b3c', g: '#ffd84a', b: '#5fe3e0' }, rows: ['rwrwrwrwrwrwrwrw', 'wrwrwrwrwrwrwrwr', 'rwrwrwrwrwrwrwrw', '.d............d.', '.d............d.', '.d............d.', '.d............d.', '.d............d.', 'pppppppppppppppp', 'pppppppppppppppp', 'pp.gg.bb.gg.b.pp', 'pp.gg.bb.gg.b.pp', 'pppppppppppppppp', '.d............d.', '.d............d.', '.d............d.'] },
    sign: { pal: { d: '#6d4c2a', p: '#e3d28e', k: '#2a2a2a' }, rows: ['................', '.pppppppppppppp.', '.pkkpkkpkpppkpp.', '.pkppkkpkppkkkp.', '.pkkpkppkpppkpp.', '.pppkkkpkkpkkpp.', '.pppppppppppppp.', '.......dd.......', '.......dd.......', '.......dd.......', '................', '................', '................', '................', '................', '................'] },
    chest: { pal: { w: '#9c6b3c', d: '#6d4c2a', g: '#ffd84a', k: '#2a2a2a' }, rows: ['................', '................', '...dddddddddd...', '..dwwwwwwwwwwd..', '..dwwwwwwwwwwd..', '..dwwwwwwwwwwd..', '..dddddddddddd..', '..dwwwwggwwwwd..', '..dwwwwgkwwwwd..', '..dwwwwwwwwwwd..', '..dwwwwwwwwwwd..', '..dwwwwwwwwwwd..', '..dddddddddddd..', '................', '................', '................'] },
    chestOpen: { pal: { w: '#9c6b3c', d: '#6d4c2a', g: '#ffd84a', y: '#fff3b0', k: '#2a2a2a' }, rows: ['...dddddddddd...', '..dwwwwwwwwwwd..', '..dwwwwwwwwwwd..', '..dddddddddddd..', '.....yygyyg.....', '....gyygygyyg...', '..dkkkkkkkkkkd..', '..dwwwwggwwwwd..', '..dwwwwgkwwwwd..', '..dwwwwwwwwwwd..', '..dwwwwwwwwwwd..', '..dwwwwwwwwwwd..', '..dddddddddddd..', '................', '................', '................'] },
    gate: { pal: { o: '#1d1030', p: '#8a2be2', l: '#c77dff', g: '#ffd84a', w: '#ffffff' }, rows: ['oooooooooooooooo', 'olpplppppplpplpo', 'oppppppppppppppo', 'oppgggppppgggppo', 'oppgwgppppgwgppo', 'oppgggppppgggppo', 'oppppppppppppppo', 'olppppgggpppplpo', 'oppppggwggppppoo', 'oppppgggggppppoo', 'oppppppppppppppo', 'oppgggppppgggppo', 'oppgwgppppgwgppo', 'oppgggppppgggppo', 'olpplppppplpplpo', 'oooooooooooooooo'] },
    bolt: { pal: { w: '#9a9a9a', k: '#4a3a2a', f: '#ddd' }, rows: ['................', '................', '................', '................', '................', '................', '................', 'ffkkkkkkkkkkkww.', '.......kkkkkkk..', '................', '................', '................', '................', '................', '................', '................'] },
    // ---- Armor overlays drawn on top of the hero (torso rows 8-11, helmet rows 0-2) ----
    ov_leather: { pal: { c: '#b5651d', d: '#7a4418', s: '#d08a4a' }, rows: ['................', '................', '................', '................', '................', '................', '................', '................', '...cccccccccc...', '..sccdccccdccs..', '..sccccccccccs..', '..s.ccdccdcc.s..', '................', '................', '................', '................'] },
    ov_chain: { pal: { c: '#a0a8b0', d: '#6e767e', s: '#d0d8e0' }, rows: ['................', '................', '................', '................', '................', '................', '................', '................', '...cscscscscs...', '..scscscscscsc..', '..cscscscscscs..', '..s.scscscsc.s..', '................', '................', '................', '................'] },
    ov_iron: { pal: { c: '#e0e0e0', d: '#9a9a9a', s: '#ffffff' }, rows: ['....cccccccc....', '....cdccccdc....', '....c......c....', '................', '................', '................', '................', '................', '...cccccccccc...', '..scccddddcccs..', '..scccdccdcccs..', '..s.ccddddcc.s..', '................', '................', '................', '................'] },
    ov_diamond: { pal: { c: '#6ef0ee', d: '#2fb8b5', s: '#ffffff' }, rows: ['....cccccccc....', '....csccccsc....', '....c......c....', '................', '................', '................', '................', '................', '...cccccccccc...', '..scccsddscccs..', '..scccdssdcccs..', '..s.ccsddscc.s..', '................', '................', '................', '................'] },
    ov_ench: { pal: { c: '#d59bff', d: '#8a3fd9', s: '#ffffff', g: '#ffd84a' }, rows: ['....cgcccccgc...', '....csccccsc....', '....c......c....', '................', '................', '................', '................', '.s..............', '...cccccccccc...', '..gcccsddscccg..', '..scccdggdcccs..', '..s.ccsddscc.s..', '..............s.', '................', '................', '................'] },
    herobrine: {
      pal: { k: '#14141c', d: '#0a0a10', w: '#ffffff', b: '#2a2a3a', e: '#e8f4ff' },
      rows: [
        '....kkkkkkkk....', '....kkkkkkkk....', '....kkkkkkkk....', '....kweekkwee...', '....kkkkkkkk....', '....kkkddkkk....', '....kkkkkkkk....', '.....kkkkkk.....',
        '..kbbbbbbbbbbk..', '..kbbbbbbbbbbk..', '..kbbbbbbbbbbk..', '..k.bbbbbbbb.k..', '....dddddddd....', '....dddd.dddd...', '....ddd...ddd...', '....kkk...kkk...'],
    },
    // Projectiles & pickups
    arrow:  { pal: { w: '#e6e6e6', k: '#7a5a3a', f: '#ddd' }, rows: ['................', '................', '................', '................', '................', '................', '................', 'ffkkkkkkkkkkww..', '................', '................', '................', '................', '................', '................', '................', '................'] },
    fireball: { pal: { y: '#ffd84a', o: '#ff8a2a', r: '#ff3a1a' }, rows: ['................', '................', '................', '......rr........', '.....rooro......', '....roooooy.....', '....rooyyyo.....', '....roooyyo.....', '.....roooo......', '......rr........', '................', '................', '................', '................', '................', '................'] },
    heart:  { pal: { r: '#ff3b5c', d: '#c0163a', w: '#ffb3c0' }, rows: ['................', '................', '...rrr...rrr....', '..rwrrr.rrrrr...', '..rrrrrrrrrrr...', '..rrrrrrrrrrr...', '..rrrrrrrrrrr...', '...rrrrrrrrr....', '....rrrrrrr.....', '.....rrrrr......', '......rrr.......', '.......r........', '................', '................', '................', '................'] },
    portal: { pal: { o: '#1d1030', p: '#8a2be2', l: '#c77dff', w: '#f0e6ff' }, rows: ['oooooooooooooooo', 'oppppppppppppppo', 'opplppppppppllpo', 'oppplppwpppplppo', 'opppplppppplpppo', 'oppppplpwplppppo', 'opppppplllpppppo', 'oppppwplllpwpppo', 'opppppplllpppppo', 'oppppplppplppppo', 'opppplpwppplpppo', 'oppplppppppplppo', 'opplpppppppppl.o', 'oppppppppppppppo', 'oppppppppppppppo', 'oooooooooooooooo'] },
    portalOff: { pal: { o: '#1d1030', g: '#3a3a44' }, rows: ['oooooooooooooooo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oggggggggggggggo', 'oooooooooooooooo'] },
    sword: { pal: { b: 'BLADE', h: '#6d4c2a', g: '#ffd84a' }, rows: ['..............b.', '.............bb.', '............bb..', '...........bb...', '..........bb....', '.........bb.....', '........bb......', '.......bb.......', '..gg..bb........', '...ggbb.........', '....gg..........', '...hhgg.........', '..hh............', '.hh.............', '................', '................'] },
    coin: { pal: { g: '#ffd84a', d: '#d9a520', w: '#fff3b0' }, rows: ['................', '................', '................', '.....gggggg.....', '....gwgggggg....', '...ggwgggdggg...', '...gggggggdgg...', '...gggggddggg...', '...ggggddgggg...', '...gggddggggg...', '...ggdgggggdg...', '....ggggggdg....', '.....gggggg.....', '................', '................', '................'] },
  };

  function renderMob(name, overrides) {
    const m = MOBS[name]; if (!m) return null;
    const c = makeCanvas(S, S), g = c.getContext('2d');
    for (let y = 0; y < S; y++) {
      const row = m.rows[y] || '';
      for (let x = 0; x < S; x++) {
        const ch = row[x]; if (!ch || ch === '.') continue;
        let col = m.pal[ch];
        if (col === undefined) continue;
        if (overrides && overrides[col] !== undefined) col = overrides[col]; // e.g. 'ARMOR' -> color
        if (col === 'ARMOR') col = '#4fd1ff';
        if (col === 'HAIR') col = '#4a2e14';
        if (col === 'SKIN') col = '#f1c27d';
        if (col === 'BLADE') col = '#d8d8d8';
        g.fillStyle = col; g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  // Public API --------------------------------------------------------
  function tile(name, variant, frame) {
    const key = `t:${name}:${variant | 0}:${frame | 0}`;
    if (!cache.has(key)) cache.set(key, renderTile(name, variant | 0, frame | 0));
    return cache.get(key);
  }
  function mob(name, overrides) {
    const key = `m:${name}:${overrides ? JSON.stringify(overrides) : ''}`;
    if (!cache.has(key)) cache.set(key, renderMob(name, overrides));
    return cache.get(key);
  }
  function isWall(name) { return !!(TILE_DEFS[name] && TILE_DEFS[name].wall); }
  function isAnimated(name) { return !!(TILE_DEFS[name] && TILE_DEFS[name].anim); }

  window.Sprites = { tile, mob, isWall, isAnimated, SIZE: S };
})();
