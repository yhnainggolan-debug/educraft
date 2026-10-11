/* =====================================================================
   EduCraft — Math problem generator
   Target: Cambridge Primary Stage 2 / Grade 2 (age 7)
     + and − within 100 (regrouping from World 2)
     × and ÷ with 2, 5, 10 (World 3+), 3 and 4 as stretch (World 4)
   Each world unlocks a wider mix; each operation has an adaptive
   level 1–3 that moves with the player's recent accuracy.
   Every problem returns { text, answer, op, explain, kind }.
   ===================================================================== */
(function () {
  'use strict';

  const R = {
    int(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    chance(p) { return Math.random() < p; },
  };

  // Minecraft-flavoured nouns for word problems (singular, plural)
  const THINGS = [
    ['emerald', 'emeralds'], ['torch', 'torches'], ['arrow', 'arrows'],
    ['apple', 'apples'], ['cookie', 'cookies'], ['diamond', 'diamonds'],
    ['wooden plank', 'wooden planks'], ['fish', 'fish'], ['carrot', 'carrots'],
    ['gold coin', 'gold coins'], ['stone block', 'stone blocks'], ['egg', 'eggs'],
    ['bone', 'bones'], ['melon slice', 'melon slices'], ['feather', 'feathers'],
  ];
  const CONTAINERS = [
    ['chest', 'chests'], ['bag', 'bags'], ['barrel', 'barrels'], ['basket', 'baskets'],
  ];
  const ANIMALS = [
    ['sheep', 'sheep'], ['cow', 'cows'], ['chicken', 'chickens'], ['pig', 'pigs'], ['wolf', 'wolves'],
  ];
  const MOBS = [['zombie', 'zombies'], ['skeleton', 'skeletons'], ['spider', 'spiders'], ['slime', 'slimes']];
  const NAMES = ['Alex', 'Finn', 'Mia', 'Leo', 'Zara', 'Kai'];

  function plural(pair, n) { return n === 1 ? pair[0] : pair[1]; }

  // ---------- explanation helpers ----------
  function explainAdd(a, b) {
    const c = a + b;
    if (a < 10 && b < 10) return `Start at ${a} and count on ${b}: that lands on ${c}.`;
    if (b < 10) return `${a} + ${b}: count on ${b} from ${a} → ${c}.`;
    const at = Math.floor(a / 10) * 10, ao = a % 10, bt = Math.floor(b / 10) * 10, bo = b % 10;
    if (ao + bo < 10) return `Add the tens: ${at} + ${bt} = ${at + bt}. Add the ones: ${ao} + ${bo} = ${ao + bo}. Together: ${c}.`;
    return `Add the tens: ${at} + ${bt} = ${at + bt}. Add the ones: ${ao} + ${bo} = ${ao + bo}. Then ${at + bt} + ${ao + bo} = ${c}.`;
  }
  function explainSub(a, b) {
    const c = a - b;
    if (b <= 10) return `Start at ${a} and count back ${b}: that lands on ${c}.`;
    if (c <= 10) return `Count up from ${b} to ${a}: that is ${c} steps. So ${a} − ${b} = ${c}.`;
    const bt = Math.floor(b / 10) * 10, bo = b % 10;
    return `Take away the tens first: ${a} − ${bt} = ${a - bt}. Then take away the ones: ${a - bt} − ${bo} = ${c}.`;
  }
  function explainMul(a, b) {
    // a groups of b
    const parts = Array(a).fill(b).join(' + ');
    if (a <= 5) return `${a} groups of ${b} means ${parts} = ${a * b}.`;
    if (b === 10) return `${a} tens is ${a * 10}. Just put a 0 after the ${a}.`;
    if (b === 5) return `Count in 5s ${a} times: ${Array.from({ length: a }, (_, i) => (i + 1) * 5).join(', ')}.`;
    if (b === 2) return `Double ${a}: ${a} + ${a} = ${a * 2}.`;
    return `Count in ${b}s ${a} times: ${Array.from({ length: a }, (_, i) => (i + 1) * b).join(', ')}.`;
  }
  function explainDiv(a, b) {
    const c = a / b;
    return `Ask: how many ${b}s make ${a}? ${b} × ${c} = ${a}, so the answer is ${c}.`;
  }

  // ---------- adaptive level store ----------
  // level per op: 1 (gentle) .. 3 (stretch). History holds last 8 results.
  const skill = { add: { lvl: 1, hist: [] }, sub: { lvl: 1, hist: [] }, mul: { lvl: 1, hist: [] }, div: { lvl: 1, hist: [] } };

  function record(op, correct) {
    const s = skill[op]; if (!s) return;
    s.hist.push(correct ? 1 : 0);
    if (s.hist.length > 8) s.hist.shift();
    if (s.hist.length >= 6) {
      const acc = s.hist.reduce((x, y) => x + y, 0) / s.hist.length;
      if (acc >= 0.85 && s.lvl < 3) { s.lvl++; s.hist = []; }
      else if (acc <= 0.45 && s.lvl > 1) { s.lvl--; s.hist = []; }
    }
  }
  function getSkill() { return JSON.parse(JSON.stringify(skill)); }
  function setSkill(obj) {
    if (!obj) return;
    for (const k of Object.keys(skill)) if (obj[k]) { skill[k].lvl = obj[k].lvl || 1; skill[k].hist = obj[k].hist || []; }
  }

  // ---------- number pickers by level ----------
  function addPair(lvl, world) {
    // returns [a,b] with a+b <= 100
    if (lvl === 1) { // within 20, no crossing 10 half the time
      const a = R.int(2, 12), b = R.int(1, 8);
      return [a, b];
    }
    if (lvl === 2) { // two-digit + one-digit, or tens
      if (R.chance(0.5)) { const a = R.int(11, 85), b = R.int(2, 9); return [a, b]; }
      const a = R.int(1, 7) * 10 + R.int(0, 9), b = R.int(1, 5) * 10; return [Math.min(a, 100 - b), b];
    }
    // lvl 3: two-digit + two-digit within 100 (regrouping allowed from world 2)
    let a = R.int(12, 60), b = R.int(12, 100 - a);
    if (world < 2) { // avoid regrouping in world 1
      const ao = a % 10, bo = b % 10; if (ao + bo >= 10) b -= (ao + bo) - 9;
      if (b < 10) b = 10;
    }
    return [a, b];
  }
  function subPair(lvl, world) {
    if (lvl === 1) { const a = R.int(5, 20), b = R.int(1, Math.min(9, a - 1)); return [a, b]; }
    if (lvl === 2) {
      if (R.chance(0.5)) { const a = R.int(15, 99), b = R.int(2, 9); return [a, b]; }
      const a = R.int(3, 9) * 10 + R.int(0, 9), b = R.int(1, Math.floor(a / 10) - 1) * 10; return [a, b];
    }
    let a = R.int(30, 99), b = R.int(11, a - 5);
    if (world < 2 && (a % 10) < (b % 10)) b = b - (b % 10) + (a % 10); // no regrouping in world 1
    return [a, b];
  }
  function mulPair(lvl, world) {
    const tables = lvl === 1 ? [2, 10] : lvl === 2 ? [2, 5, 10] : (world >= 4 ? [2, 3, 4, 5, 10] : [2, 5, 10]);
    const b = R.pick(tables);
    const a = R.int(lvl === 1 ? 1 : 2, lvl === 1 ? 6 : lvl === 2 ? 10 : 12);
    return [a, b]; // a groups of b
  }
  function divPair(lvl, world) {
    const tables = lvl === 1 ? [2, 10] : lvl === 2 ? [2, 5, 10] : (world >= 4 ? [2, 3, 4, 5, 10] : [2, 5, 10]);
    const b = R.pick(tables);
    const c = R.int(1, lvl === 1 ? 6 : lvl === 2 ? 10 : 12);
    return [b * c, b]; // a ÷ b = c
  }

  // ---------- problem builders ----------
  function notation(op, lvl, world) {
    if (op === 'add') {
      const [a, b] = addPair(lvl, world);
      if (lvl >= 2 && R.chance(0.25)) { // missing addend
        return { kind: 'notation', op, text: `${a} + ? = ${a + b}`, answer: b, explain: `What do you add to ${a} to make ${a + b}? Count up from ${a}: ${b}.` };
      }
      return { kind: 'notation', op, text: `${a} + ${b} = ?`, answer: a + b, explain: explainAdd(a, b) };
    }
    if (op === 'sub') {
      const [a, b] = subPair(lvl, world);
      if (lvl >= 2 && R.chance(0.2)) {
        return { kind: 'notation', op, text: `? − ${b} = ${a - b}`, answer: a, explain: `If taking away ${b} leaves ${a - b}, add them back: ${a - b} + ${b} = ${a}.` };
      }
      return { kind: 'notation', op, text: `${a} − ${b} = ?`, answer: a - b, explain: explainSub(a, b) };
    }
    if (op === 'mul') {
      const [a, b] = mulPair(lvl, world);
      const flip = R.chance(0.5);
      return { kind: 'notation', op, text: flip ? `${b} × ${a} = ?` : `${a} × ${b} = ?`, answer: a * b, explain: explainMul(a, b) };
    }
    const [a, b] = divPair(lvl, world);
    return { kind: 'notation', op, text: `${a} ÷ ${b} = ?`, answer: a / b, explain: explainDiv(a, b) };
  }

  function story(op, lvl, world) {
    const name = R.pick(NAMES);
    const thing = R.pick(THINGS);
    if (op === 'add') {
      const [a, b] = addPair(lvl, world);
      const t = R.pick([
        `You have ${a} ${plural(thing, a)}. You find ${b} more in a cave. How many ${thing[1]} do you have now?`,
        `${name} mined ${a} ${plural(thing, a)} in the morning and ${b} in the afternoon. How many altogether?`,
        `A chest holds ${a} ${plural(thing, a)}. You add ${b} more. How many are in the chest?`,
        `There are ${a} ${plural(R.pick(ANIMALS), a)} in the field and ${b} more arrive. How many animals are there?`,
      ]);
      return { kind: 'story', op, text: t, answer: a + b, explain: `"More", "altogether" and "add" mean we add. ${explainAdd(a, b)}` };
    }
    if (op === 'sub') {
      const [a, b] = subPair(lvl, world);
      const t = R.pick([
        `You had ${a} ${plural(thing, a)}. You used ${b} to build a shelter. How many are left?`,
        `${name} has ${a} ${plural(thing, a)}. A ${R.pick(MOBS)[0]} steals ${b}! How many does ${name} have now?`,
        `There were ${a} ${plural(MOBS[0], a)} in the cave. You defeated ${b}. How many are still there?`,
        `You need ${a} ${plural(thing, a)} for a crafting recipe and you already have ${b}. How many more do you need?`,
      ]);
      return { kind: 'story', op, text: t, answer: a - b, explain: `"Left", "stole", "still there" and "how many more" mean we take away. ${explainSub(a, b)}` };
    }
    if (op === 'mul') {
      const [a, b] = mulPair(lvl, world);
      const cont = R.pick(CONTAINERS);
      const t = R.pick([
        `There are ${a} ${plural(cont, a)}. Each ${cont[0]} has ${b} ${plural(thing, b)}. How many ${thing[1]} altogether?`,
        `${name} plants ${a} rows of carrots with ${b} carrots in each row. How many carrots is that?`,
        `Each ${R.pick(ANIMALS)[0]} drops ${b} ${plural(thing, b)}. You have ${a} of them. How many ${thing[1]} do you get?`,
        `A torch costs ${b} ${plural(thing, b)}. How many ${thing[1]} do ${a} torches cost?`,
      ]);
      return { kind: 'story', op, text: t, answer: a * b, explain: `"${a} groups of ${b}" means multiply. ${explainMul(a, b)}` };
    }
    const [a, b] = divPair(lvl, world);
    const c = a / b;
    const t = R.pick([
      `You have ${a} ${plural(thing, a)} to share equally between ${b} friends. How many does each friend get?`,
      `${a} ${plural(thing, a)} are packed into ${plural(CONTAINERS[0], b)} of ${b}. How many ${CONTAINERS[0][1]} are needed?`,
      `A ${R.pick(MOBS)[0]} has ${a} health. Your sword does ${b} damage each hit. How many hits to defeat it?`,
      `${name} puts ${a} ${plural(thing, a)} into rows of ${b}. How many rows are there?`,
    ]);
    return { kind: 'story', op, text: t, answer: c, explain: `"Share equally" and "how many groups" mean divide. ${explainDiv(a, b)}` };
  }

  function twoStep(world) {
    // World 2+: two operations in a narrative, answer within 100
    const name = R.pick(NAMES), thing = R.pick(THINGS);
    const a = R.int(15, 60), b = R.int(3, 12), c = R.int(3, 12);
    const type = R.pick(['add-add', 'sub-add', 'add-sub', ...(world >= 3 ? ['mul-add', 'mul-sub'] : [])]);
    if (type === 'add-add') {
      return { kind: 'twostep', op: 'add', text: `${name} had ${a} ${plural(thing, a)}, found ${b} more, then found another ${c}. How many now?`, answer: a + b + c, explain: `Two steps. First ${a} + ${b} = ${a + b}. Then ${a + b} + ${c} = ${a + b + c}.` };
    }
    if (type === 'sub-add') {
      return { kind: 'twostep', op: 'sub', text: `You had ${a} ${plural(thing, a)}. You used ${b} to build, then found ${c} more. How many now?`, answer: a - b + c, explain: `Two steps. First ${a} − ${b} = ${a - b}. Then ${a - b} + ${c} = ${a - b + c}.` };
    }
    if (type === 'add-sub') {
      return { kind: 'twostep', op: 'sub', text: `${name} had ${a} ${plural(thing, a)} and got ${b} more. Then a ${R.pick(MOBS)[0]} took ${c}. How many are left?`, answer: a + b - c, explain: `Two steps. First ${a} + ${b} = ${a + b}. Then ${a + b} − ${c} = ${a + b - c}.` };
    }
    const g = R.int(2, 5), each = R.pick([2, 5, 10]), extra = R.int(1, 9);
    if (type === 'mul-add') {
      return { kind: 'twostep', op: 'mul', text: `There are ${g} chests with ${each} ${plural(thing, each)} in each, plus ${extra} loose ${plural(thing, extra)} on the floor. How many altogether?`, answer: g * each + extra, explain: `First the chests: ${g} × ${each} = ${g * each}. Then add the loose ones: ${g * each} + ${extra} = ${g * each + extra}.` };
    }
    const give = Math.min(extra, g * each - 1);
    return { kind: 'twostep', op: 'mul', text: `${name} crafts ${g} sets of ${each} ${plural(thing, each)}, then gives ${give} away. How many are left?`, answer: g * each - give, explain: `First ${g} × ${each} = ${g * each}. Then take away ${give}: ${g * each} − ${give} = ${g * each - give}.` };
  }

  // Which ops and which flavours a world allows
  const WORLD_MIX = {
    1: { ops: ['add', 'add', 'sub'], story: 0.35, twostep: 0 },
    2: { ops: ['add', 'sub', 'sub'], story: 0.5, twostep: 0.2 },
    3: { ops: ['mul', 'mul', 'div', 'add', 'sub'], story: 0.5, twostep: 0.2 },
    4: { ops: ['mul', 'div', 'div', 'add', 'sub'], story: 0.6, twostep: 0.25 },
  };

  function generate(world) {
    world = Math.max(1, Math.min(4, world | 0));
    const mix = WORLD_MIX[world];
    if (R.chance(mix.twostep)) return twoStep(world);
    const op = R.pick(mix.ops);
    const lvl = skill[op].lvl;
    return R.chance(mix.story) ? story(op, lvl, world) : notation(op, lvl, world);
  }

  window.MathGen = { generate, record, getSkill, setSkill };
})();
