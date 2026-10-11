/* =====================================================================
   EduCraft — Game data: worlds, enemies, gear
   Everything here is tunable without touching engine code.
   Damage and HP are in HEARTS (player has 10 hearts by default).
   ===================================================================== */
(function () {
  'use strict';

  // ---------- Weapons ----------
  // kind: melee | ranged. atk = hearts per hit, cd = seconds between uses.
  // melee: range = px reach.  ranged: range = projectile travel px, speed = px/s, pierce = goes through enemies.
  // stat bars in the shop are 1–10 for damage/speed/reach.
  const WEAPONS = [
    { id: 'w_wood', anim: 'swing',     kind: 'melee',  name: 'Wooden Sword',    atk: 1, range: 44, cd: 0.45, price: 0,   sprite: 'sw_wood',  color: '#9c6b3c',
      lore: 'Carved from an oak plank on your first night. Splinters a bit.', bars: { dmg: 1, spd: 6, reach: 3 } },
    { id: 'w_stone', anim: 'swing',    kind: 'melee',  name: 'Stone Sword',     atk: 2, range: 44, cd: 0.45, price: 40,  sprite: 'sw_stone', color: '#8a8a8a',
      lore: 'Heavy cobblestone edge. Zombies feel this one.', bars: { dmg: 2, spd: 5, reach: 3 } },
    { id: 'w_bow', anim: 'bow',      kind: 'ranged', name: 'Hunting Bow',     atk: 2, range: 280, speed: 330, cd: 0.6, price: 80, sprite: 'bow', color: '#b5651d', proj: 'arrow',
      lore: 'Keep your distance. Arrows fly straight at the nearest foe.', bars: { dmg: 2, spd: 4, reach: 9 } },
    { id: 'w_iron', anim: 'slash',     kind: 'melee',  name: 'Iron Sword',      atk: 3, range: 48, cd: 0.42, price: 100, sprite: 'sw_iron',  color: '#d8d8d8',
      lore: 'Smelted from three iron ingots. Sharp, shiny, reliable.', bars: { dmg: 3, spd: 6, reach: 4 } },
    { id: 'w_gold', anim: 'chop',     kind: 'melee',  name: 'Golden Axe',      atk: 4, range: 52, cd: 0.55, price: 180, sprite: 'axe_gold', color: '#f2c14e',
      lore: 'Big swing, big damage. Slow, and it never dulls.', bars: { dmg: 5, spd: 3, reach: 5 } },
    { id: 'w_xbow', anim: 'xbow',     kind: 'ranged', name: 'Crossbow',        atk: 4, range: 320, speed: 420, cd: 0.85, price: 220, sprite: 'crossbow', color: '#6d4c2a', proj: 'bolt',
      lore: 'Slow to load, hits like a cave-in. Skeletons hate it.', bars: { dmg: 5, spd: 2, reach: 10 } },
    { id: 'w_diamond', anim: 'double',  kind: 'melee',  name: 'Diamond Sword',   atk: 6, range: 50, cd: 0.38, price: 320, sprite: 'sw_diamond', color: '#5fe3e0',
      lore: 'Found deep in the Caves. Cuts fast and clean.', bars: { dmg: 7, spd: 8, reach: 4 } },
    { id: 'w_staff', anim: 'staff',    kind: 'ranged', name: 'Flame Staff',     atk: 5, range: 300, speed: 260, cd: 0.7, price: 450, sprite: 'staff', color: '#ff7a2a', proj: 'fireball', pierce: true,
      lore: 'Forged in the Lava Realm. Fireballs burn through whole rows of enemies.', bars: { dmg: 6, spd: 5, reach: 9 } },
    { id: 'w_ench', anim: 'spin',     kind: 'melee',  name: 'Enchanted Blade', atk: 9, range: 56, cd: 0.35, price: 600, sprite: 'sw_ench', color: '#c77dff',
      lore: 'Hums with purple light. Even the Void King steps back.', bars: { dmg: 10, spd: 9, reach: 6 } },
  ];

  // ---------- Armor ----------
  // def = fraction of damage blocked, hp = bonus max hearts. bars 1–10 for block/hearts.
  const ARMORS = [
    { id: 'a_none',    name: 'Adventurer Shirt', def: 0,    hp: 0, price: 0,   sprite: 'ar_none',    color: '#4fd1ff', lore: 'Comfortable. Not protective.', bars: { block: 0, hp: 0 } },
    { id: 'a_leather', overlay: 'ov_leather', name: 'Leather Armor',    def: 0.15, hp: 1, price: 50,  sprite: 'ar_leather', color: '#b5651d', lore: 'Stitched from cow hide. Soft, but it helps.', bars: { block: 2, hp: 2 } },
    { id: 'a_chain', overlay: 'ov_chain',   name: 'Chainmail',        def: 0.3,  hp: 2, price: 120, sprite: 'ar_chain',   color: '#a0a8b0', lore: 'A thousand tiny rings. Clinks when you walk.', bars: { block: 4, hp: 3 } },
    { id: 'a_iron', overlay: 'ov_iron',    name: 'Iron Armor',       def: 0.45, hp: 3, price: 240, sprite: 'ar_iron',    color: '#e0e0e0', lore: 'Heavy plates. Arrows bounce right off.', bars: { block: 6, hp: 5 } },
    { id: 'a_diamond', overlay: 'ov_diamond', name: 'Diamond Armor',    def: 0.6,  hp: 4, price: 420, sprite: 'ar_diamond', color: '#6ef0ee', lore: 'Sparkles in the dark. Blocks most hits.', bars: { block: 8, hp: 7 } },
    { id: 'a_ench', overlay: 'ov_ench',    name: 'Enchanted Armor',  def: 0.75, hp: 6, price: 700, sprite: 'ar_ench',    color: '#d59bff', lore: 'Glows faintly. Almost unbreakable.', bars: { block: 10, hp: 10 } },
  ];

  // ---------- Consumables ----------
  const ITEMS = [
    { id: 'i_apple', name: 'Golden Apple', price: 25, sprite: 'apple', lore: 'Heals all hearts. Eaten automatically when you would faint.' },
  ];

  // ---------- Enemy archetypes ----------
  // behaviour: chase | shoot | dash | boomer | boss | dummy
  const ENEMIES = {
    dummy:    { name: 'Training Dummy', behaviour: 'dummy', hp: 3, dmg: 0, speed: 0, size: 28, sprite: 'dummy' },
    zombie:   { name: 'Zombie',      behaviour: 'chase',  hp: 3,  dmg: 1,   speed: 42,  size: 26, sprite: 'zombie' },
    skeleton: { name: 'Skeleton',    behaviour: 'shoot',  hp: 2,  dmg: 1,   speed: 32,  size: 26, sprite: 'skeleton', shotCd: 2.0, shotSpeed: 130, keepDist: 150 },
    spider:   { name: 'Cave Spider', behaviour: 'dash',   hp: 2,  dmg: 1,   speed: 58,  size: 24, sprite: 'spider', dashSpeed: 200, dashCd: 1.6 },
    boomer:   { name: 'Boomer',      behaviour: 'boomer', hp: 2,  dmg: 3,   speed: 46,  size: 26, sprite: 'boomer', fuse: 1.0, blast: 60 },
    wisp:     { name: 'Fire Wisp',   behaviour: 'shoot',  hp: 3,  dmg: 1.5, speed: 50,  size: 24, sprite: 'wisp', shotCd: 1.7, shotSpeed: 150, keepDist: 130, flying: true },
    golemling:{ name: 'Golemling',   behaviour: 'chase',  hp: 6,  dmg: 2,   speed: 30,  size: 30, sprite: 'golemling' },
    shade:    { name: 'Shade',       behaviour: 'dash',   hp: 4,  dmg: 2,   speed: 64,  size: 26, sprite: 'shade', dashSpeed: 230, dashCd: 1.4 },
    // The nightmare — appears only when the player is cruising; nearly unbeatable
    herobrine: { name: 'Herobrine', behaviour: 'nightmare', hp: 400, dmg: 4, speed: 95, size: 32, sprite: 'herobrine', nightmare: true, teleportCd: 2.6, boltCd: 3.0, boltDelay: 0.75, boltRadius: 36 },
    // Bosses
    bigslime: { name: 'King Slime',  behaviour: 'boss', hp: 36,  dmg: 2, speed: 36, size: 56, sprite: 'bigslime', boss: true, pattern: 'hop',    summon: 'zombie',  roar: 'Squelch! Who dares enter my pit?' },
    golem:    { name: 'Stone Golem', behaviour: 'boss', hp: 70,  dmg: 3, speed: 32, size: 60, sprite: 'golem',    boss: true, pattern: 'charge', summon: 'spider',  roar: 'Rumble... the Caves belong to me.' },
    wyrm:     { name: 'Magma Wyrm',  behaviour: 'boss', hp: 110, dmg: 3, speed: 42, size: 64, sprite: 'wyrm',     boss: true, pattern: 'fire',   summon: 'wisp',    roar: 'Sssss... you will burn, little hero.' },
    voidking: { name: 'Void King',   behaviour: 'boss', hp: 170, dmg: 4, speed: 46, size: 64, sprite: 'voidking', boss: true, pattern: 'all',    summon: 'shade',   roar: 'So. The one who counts. Let us end this.' },
  };

  // Difficulty: world multiplier × stage multiplier (stageIdx 0..3; boss stage uses idx 3)
  const worldScale = { 1: { hp: 1, dmg: 1 }, 2: { hp: 1.8, dmg: 1.3 }, 3: { hp: 2.8, dmg: 1.6 }, 4: { hp: 4.0, dmg: 2.0 } };
  const stageScale = (si) => ({ hp: 1 + 0.35 * si, dmg: 1 + 0.15 * si });

  // ---------- Worlds ----------
  const WORLDS = [
    {
      id: 1, name: 'Green Meadows', subtitle: 'Where every adventure begins',
      sky: '#7ec8ff', tiles: { floor: ['grass', 'grass', 'grass', 'flower', 'dirt'], wall: ['tree', 'tree', 'rock'], hazard: 'water' },
      mathNote: 'Adding and taking away. Numbers up to 20, then up to 100.',
      stages: [
        { name: 'Training Yard', size: [20, 14], density: 0.02, hazard: 0,    enemies: [['dummy', 1]], tutorial: true },
        { name: 'Sunny Field',   size: [28, 20], density: 0.07, hazard: 0.02, enemies: [['zombie', 5]] },
        { name: 'Dark Forest',   size: [32, 22], density: 0.1,  hazard: 0.02, enemies: [['zombie', 6], ['spider', 3]] },
        { name: 'Old Mine Mouth',size: [34, 24], density: 0.09, hazard: 0.03, enemies: [['zombie', 6], ['skeleton', 4], ['spider', 3]] },
        { name: 'Slime Pit',     size: [26, 20], density: 0.03, hazard: 0.0,  enemies: [], boss: 'bigslime' },
      ],
    },
    {
      id: 2, name: 'Deep Caves', subtitle: 'Watch your step in the dark',
      sky: '#1a1a24', tiles: { floor: ['stone', 'stone', 'cobble', 'gravel'], wall: ['rockwall', 'rockwall', 'ore'], hazard: 'water' },
      mathNote: 'Bigger adding and taking away, with regrouping and two-step stories.',
      stages: [
        { name: 'Crystal Tunnel', size: [30, 22], density: 0.12, hazard: 0.03, enemies: [['spider', 6], ['zombie', 4]] },
        { name: 'Bat Cavern',     size: [34, 24], density: 0.12, hazard: 0.03, enemies: [['skeleton', 5], ['spider', 5], ['boomer', 2]] },
        { name: 'Abandoned Mine', size: [36, 26], density: 0.13, hazard: 0.04, enemies: [['boomer', 4], ['skeleton', 5], ['golemling', 3]] },
        { name: 'Golem Hall',     size: [26, 20], density: 0.04, hazard: 0.0,  enemies: [], boss: 'golem' },
      ],
    },
    {
      id: 3, name: 'Lava Realm', subtitle: 'Hot. Very hot.',
      sky: '#3a0b0b', tiles: { floor: ['netherrack', 'netherrack', 'netherrack', 'basalt'], wall: ['obsidian', 'basaltwall', 'glowstone'], hazard: 'lava' },
      mathNote: 'Times tables 2, 5 and 10 — and sharing (division).',
      stages: [
        { name: 'Ash Plains',     size: [32, 22], density: 0.1,  hazard: 0.06, enemies: [['wisp', 5], ['zombie', 5]] },
        { name: 'Fire Bridge',    size: [36, 24], density: 0.11, hazard: 0.08, enemies: [['wisp', 6], ['boomer', 4], ['golemling', 3]] },
        { name: 'Magma Fortress', size: [38, 26], density: 0.12, hazard: 0.08, enemies: [['wisp', 7], ['skeleton', 5], ['golemling', 4]] },
        { name: 'Wyrm Lair',      size: [28, 20], density: 0.04, hazard: 0.04, enemies: [], boss: 'wyrm' },
      ],
    },
    {
      id: 4, name: 'Sky Fortress', subtitle: 'The final climb',
      sky: '#dfe9ff', tiles: { floor: ['cloud', 'cloud', 'quartz', 'quartz'], wall: ['quartzwall', 'quartzwall', 'crystal'], hazard: 'void' },
      mathNote: 'Everything mixed together. Read carefully and choose the right operation!',
      stages: [
        { name: 'Cloud Steps',    size: [32, 22], density: 0.1,  hazard: 0.08, enemies: [['shade', 5], ['skeleton', 5]] },
        { name: 'Crystal Garden', size: [36, 24], density: 0.11, hazard: 0.08, enemies: [['shade', 6], ['wisp', 5], ['golemling', 4]] },
        { name: 'Throne Approach',size: [38, 26], density: 0.12, hazard: 0.1,  enemies: [['shade', 7], ['boomer', 5], ['golemling', 5], ['wisp', 4]] },
        { name: "Void King's Throne", size: [28, 20], density: 0.04, hazard: 0.05, enemies: [], boss: 'voidking' },
      ],
    },
  ];

  // Credits per correct answer by world, streak bonus every 3 in a row, stage/boss clear bonuses
  const NIGHTMARE = { cleanRuns: 3, chance: 0.6, delayMin: 10, delayMax: 20, duration: 45 };
  const CREDITS = { perCorrect: { 1: 10, 2: 15, 3: 20, 4: 25 }, streakBonus: 15, stageClear: { 1: 10, 2: 15, 3: 20, 4: 25 }, bossClear: 60, riddleCount: 3 };

  // Character customisation palettes
  const LOOK = {
    skin: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#5c3a1e'],
    hair: ['#4a2e14', '#1a1a1a', '#e2b04a', '#b5522a', '#7a5a3a', '#f0e6ff'],
    shirt: ['#4fd1ff', '#ff5f5f', '#5fcf5f', '#ffd84a', '#c77dff', '#ff9ad5'],
  };

  window.GameData = { WEAPONS, ARMORS, ITEMS, ENEMIES, WORLDS, worldScale, stageScale, CREDITS, LOOK, NIGHTMARE };
})();
