/* =====================================================================
   EduCraft — Game data: worlds, enemies, gear
   Everything here is tunable without touching engine code.
   Damage and HP are in HEARTS (player has 10 hearts by default).
   ===================================================================== */
(function () {
  'use strict';

  // ---------- Weapons ----------
  // atk = hearts of damage per hit, range = px, cd = seconds between swings
  const WEAPONS = [
    { id: 'w_wood',    name: 'Wooden Sword',   atk: 1,  range: 44, cd: 0.45, price: 0,   color: '#9c6b3c', desc: 'Starter sword. Better than fists.' },
    { id: 'w_stone',   name: 'Stone Sword',    atk: 2,  range: 44, cd: 0.45, price: 40,  color: '#8a8a8a', desc: 'Twice the hit. Still a bit heavy.' },
    { id: 'w_iron',    name: 'Iron Sword',     atk: 3,  range: 48, cd: 0.42, price: 100, color: '#d8d8d8', desc: 'Sharp, shiny, reliable.' },
    { id: 'w_gold',    name: 'Golden Axe',     atk: 4,  range: 52, cd: 0.5,  price: 180, color: '#f2c14e', desc: 'Big swing, big damage.' },
    { id: 'w_diamond', name: 'Diamond Sword',  atk: 6,  range: 50, cd: 0.38, price: 320, color: '#5fe3e0', desc: 'Fast and deadly.' },
    { id: 'w_ench',    name: 'Enchanted Blade',atk: 9,  range: 56, cd: 0.35, price: 600, color: '#c77dff', desc: 'Glows purple. Bosses fear it.' },
  ];

  // ---------- Armor ----------
  // def = fraction of damage blocked, hp = bonus max hearts
  const ARMORS = [
    { id: 'a_none',    name: 'No Armor',        def: 0,    hp: 0, price: 0,   color: '#4fd1ff', desc: 'Just a t-shirt.' },
    { id: 'a_leather', name: 'Leather Armor',   def: 0.15, hp: 1, price: 50,  color: '#b5651d', desc: 'Soft but it helps.' },
    { id: 'a_chain',   name: 'Chainmail',       def: 0.3,  hp: 2, price: 120, color: '#a0a8b0', desc: 'Clinks when you walk.' },
    { id: 'a_iron',    name: 'Iron Armor',      def: 0.45, hp: 3, price: 240, color: '#e0e0e0', desc: 'Heavy-duty protection.' },
    { id: 'a_diamond', name: 'Diamond Armor',   def: 0.6,  hp: 4, price: 420, color: '#6ef0ee', desc: 'Sparkles. Blocks most hits.' },
    { id: 'a_ench',    name: 'Enchanted Armor', def: 0.75, hp: 6, price: 700, color: '#d59bff', desc: 'Almost unbreakable.' },
  ];

  // ---------- Consumables ----------
  const ITEMS = [
    { id: 'i_apple',  name: 'Golden Apple', price: 25, desc: 'Heals all hearts. Use from the pause menu or auto-use when you faint.' },
  ];

  // ---------- Enemy archetypes ----------
  // behaviour: chase | shoot | dash | boomer | boss
  // Stats scale with world via worldScale below.
  const ENEMIES = {
    zombie:   { name: 'Zombie',     behaviour: 'chase',  hp: 3,  dmg: 1,   speed: 38,  size: 26, sprite: 'zombie' },
    skeleton: { name: 'Skeleton',   behaviour: 'shoot',  hp: 2,  dmg: 1,   speed: 30,  size: 26, sprite: 'skeleton', shotCd: 2.2, shotSpeed: 120, keepDist: 150 },
    spider:   { name: 'Cave Spider',behaviour: 'dash',   hp: 2,  dmg: 1,   speed: 55,  size: 24, sprite: 'spider', dashSpeed: 190, dashCd: 1.8 },
    boomer:   { name: 'Boomer',     behaviour: 'boomer', hp: 2,  dmg: 3,   speed: 42,  size: 26, sprite: 'boomer', fuse: 1.1, blast: 60 },
    wisp:     { name: 'Fire Wisp',  behaviour: 'shoot',  hp: 3,  dmg: 1.5, speed: 48,  size: 24, sprite: 'wisp', shotCd: 1.8, shotSpeed: 140, keepDist: 130, flying: true },
    golemling:{ name: 'Golemling',  behaviour: 'chase',  hp: 6,  dmg: 2,   speed: 28,  size: 30, sprite: 'golemling' },
    shade:    { name: 'Shade',      behaviour: 'dash',   hp: 4,  dmg: 2,   speed: 60,  size: 26, sprite: 'shade', dashSpeed: 220, dashCd: 1.5 },
    // Bosses
    bigslime: { name: 'King Slime',  behaviour: 'boss', hp: 30,  dmg: 2, speed: 34, size: 56, sprite: 'bigslime', boss: true, pattern: 'hop',    summon: 'zombie' },
    golem:    { name: 'Stone Golem', behaviour: 'boss', hp: 60,  dmg: 3, speed: 30, size: 60, sprite: 'golem',    boss: true, pattern: 'charge', summon: 'spider' },
    wyrm:     { name: 'Magma Wyrm',  behaviour: 'boss', hp: 100, dmg: 3, speed: 40, size: 64, sprite: 'wyrm',     boss: true, pattern: 'fire',   summon: 'wisp' },
    voidking: { name: 'Void King',   behaviour: 'boss', hp: 160, dmg: 4, speed: 44, size: 64, sprite: 'voidking', boss: true, pattern: 'all',    summon: 'shade' },
  };

  // HP / damage multipliers per world
  const worldScale = { 1: { hp: 1, dmg: 1 }, 2: { hp: 1.6, dmg: 1.3 }, 3: { hp: 2.4, dmg: 1.6 }, 4: { hp: 3.2, dmg: 2 } };

  // ---------- Worlds ----------
  // tiles: floor[] (weighted by repetition), wall[] (solid), hazard (damage tile) or null
  // stages: 3 normal + 1 boss. Each stage: enemies list [type, count], size, obstacleDensity
  const WORLDS = [
    {
      id: 1, name: 'Green Meadows', subtitle: 'Where every adventure begins',
      sky: '#7ec8ff', tiles: { floor: ['grass', 'grass', 'grass', 'flower', 'dirt'], wall: ['tree', 'tree', 'rock'], hazard: 'water' },
      mathNote: 'Adding and taking away. Numbers up to 20, then up to 100.',
      stages: [
        { name: 'Sunny Field',   size: [28, 20], density: 0.07, hazard: 0.02, enemies: [['zombie', 4]] },
        { name: 'Dark Forest',   size: [32, 22], density: 0.1,  hazard: 0.02, enemies: [['zombie', 5], ['spider', 2]] },
        { name: 'Old Mine Mouth',size: [34, 24], density: 0.09, hazard: 0.03, enemies: [['zombie', 5], ['skeleton', 3], ['spider', 2]] },
        { name: 'Slime Pit',     size: [26, 20], density: 0.03, hazard: 0.0,  enemies: [], boss: 'bigslime' },
      ],
    },
    {
      id: 2, name: 'Deep Caves', subtitle: 'Watch your step in the dark',
      sky: '#1a1a24', tiles: { floor: ['stone', 'stone', 'cobble', 'gravel'], wall: ['rockwall', 'rockwall', 'ore'], hazard: 'water' },
      mathNote: 'Bigger adding and taking away, with regrouping and two-step stories.',
      stages: [
        { name: 'Crystal Tunnel', size: [30, 22], density: 0.12, hazard: 0.03, enemies: [['spider', 5], ['zombie', 3]] },
        { name: 'Bat Cavern',     size: [34, 24], density: 0.12, hazard: 0.03, enemies: [['skeleton', 4], ['spider', 4], ['boomer', 2]] },
        { name: 'Abandoned Mine', size: [36, 26], density: 0.13, hazard: 0.04, enemies: [['boomer', 4], ['skeleton', 4], ['golemling', 2]] },
        { name: 'Golem Hall',     size: [26, 20], density: 0.04, hazard: 0.0,  enemies: [], boss: 'golem' },
      ],
    },
    {
      id: 3, name: 'Lava Realm', subtitle: 'Hot. Very hot.',
      sky: '#3a0b0b', tiles: { floor: ['netherrack', 'netherrack', 'netherrack', 'basalt'], wall: ['obsidian', 'basaltwall', 'glowstone'], hazard: 'lava' },
      mathNote: 'Times tables 2, 5 and 10 — and sharing (division).',
      stages: [
        { name: 'Ash Plains',     size: [32, 22], density: 0.1,  hazard: 0.06, enemies: [['wisp', 4], ['zombie', 4]] },
        { name: 'Fire Bridge',    size: [36, 24], density: 0.11, hazard: 0.08, enemies: [['wisp', 5], ['boomer', 3], ['golemling', 2]] },
        { name: 'Magma Fortress', size: [38, 26], density: 0.12, hazard: 0.08, enemies: [['wisp', 6], ['skeleton', 4], ['golemling', 3]] },
        { name: 'Wyrm Lair',      size: [28, 20], density: 0.04, hazard: 0.04, enemies: [], boss: 'wyrm' },
      ],
    },
    {
      id: 4, name: 'Sky Fortress', subtitle: 'The final climb',
      sky: '#dfe9ff', tiles: { floor: ['cloud', 'cloud', 'quartz', 'quartz'], wall: ['quartzwall', 'quartzwall', 'crystal'], hazard: 'void' },
      mathNote: 'Everything mixed together. Read carefully and choose the right operation!',
      stages: [
        { name: 'Cloud Steps',    size: [32, 22], density: 0.1,  hazard: 0.08, enemies: [['shade', 4], ['skeleton', 4]] },
        { name: 'Crystal Garden', size: [36, 24], density: 0.11, hazard: 0.08, enemies: [['shade', 5], ['wisp', 4], ['golemling', 3]] },
        { name: 'Throne Approach',size: [38, 26], density: 0.12, hazard: 0.1,  enemies: [['shade', 6], ['boomer', 4], ['golemling', 4], ['wisp', 3]] },
        { name: "Void King's Throne", size: [28, 20], density: 0.04, hazard: 0.05, enemies: [], boss: 'voidking' },
      ],
    },
  ];

  // Credits per correct answer by world, plus streak bonus every 3 in a row
  const CREDITS = { perCorrect: { 1: 10, 2: 15, 3: 20, 4: 25 }, streakBonus: 15, stageClear: { 1: 20, 2: 30, 3: 40, 4: 50 }, bossClear: 100 };

  window.GameData = { WEAPONS, ARMORS, ITEMS, ENEMIES, WORLDS, worldScale, CREDITS };
})();
