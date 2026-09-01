// 平衡性仿真：用游戏引擎本体在 Node 中跑阵营默认卡组两两对战，输出胜率表
// 用法：node tools/simulate.js [局数=20] [阵营过滤,逗号分隔]
// 加载方式：plain script（js/*.js）+ DOM/浏览器 stub 注入 vm 共享上下文（与浏览器全局词法作用域等效）
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const GAMES = parseInt(process.argv[2], 10) || 20;
const RACE_FILTER = process.argv[3] ? process.argv[3].split(',') : null;

// ---------- DOM / 浏览器 stub ----------
const mem = {};
const storage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; },
};
const stubEl = () => ({
  innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  addEventListener: () => {}, removeEventListener: () => {},
  appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [],
  setAttribute: () => {}, removeAttribute: () => {}, remove: () => {},
});
const timeouts = [];
const ctx = {
  console, performance: { now: () => Date.now() },
  setTimeout: (fn) => timeouts.push(fn),
  clearTimeout: () => {},
  requestAnimationFrame: () => {},
  localStorage: storage,
  navigator: { userAgent: 'sim' },
};
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.document = {
  getElementById: id => (id === 'cards-json'
    ? { textContent: fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
        .match(/<script type="application\/json" id="cards-json">([\s\S]*?)<\/script>/)[1] }
    : stubEl()),
  createElement: () => ({ getContext: () => ({}), width: 0, height: 0, toDataURL: () => '' }),
  addEventListener: () => {},
  querySelector: () => null, querySelectorAll: () => [],
  documentElement: { dataset: {} },
  body: stubEl(),
};
vm.createContext(ctx);
ctx.RUN = null;
ctx.render = () => {};
ctx.confirmPass = () => {}; // net.js 未加载时的兜底
const run = f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
run('tools/rating.js');
run('js/core-data.js');
run('js/net.js'); // uid/logLines/快照声明
run('js/economy.js');
run('js/engine.js');
run('js/render.js'); // PRESET_DECKS 与 render() 所在（DOM 经 stub 兼容）
const vtText = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
  .match(/<script>window\.VIEWER_TEXT = ([\s\S]*?)<\/script>/)[1];
vm.runInContext('window.VIEWER_TEXT = ' + vtText, ctx);

// ---------- 玩家侧 AI（镜像 enemy 侧实现，side 参数化） ----------
vm.runInContext(`
function simSpellDecision(side, def) {
  const me = state[side], foe = state[otherSide(side)];
  const highest = arr => arr.slice().sort((a, b) => b.atk - a.atk)[0] || null;
  const AOE = ['deathRipple', 'doom', 'hellfire', 'earthSpikes', 'meteorShower', 'warShout', 'backRowSpikes'];
  if (AOE.includes(def.spellEffect) && foe.board.filter(x => isTargetable(x)).length < 2) return null;
  switch (def.spellEffect) {
    case 'stoneSkin': case 'fireShield': case 'mirror': case 'frenzy': case 'airShield': case 'lifeBoon':
      return me.board.length ? highest(me.board).uid : null;
    case 'bless': case 'bloodlust':
      return me.board.some(x => x.atk >= 3) ? true : null;
    case 'slow': case 'iceBolt': case 'fireballSpell': case 'lightningBolt': case 'dispel': case 'powerWordKill': case 'entangle': case 'feint':
    case 'sear': case 'meteor': case 'thunderBolt':
      return foe.board.length ? highest(foe.board).uid : null;
    case 'confuse': case 'forget': case 'blind': {
      const mindPool = foe.board.filter(x => !mindImmune(x) && (def.spellEffect !== 'blind' || !x.traits.includes('无目')));
      return mindPool.length ? highest(mindPool).uid : null;
    }
    case 'heal':
      if (me.hp <= me.maxHp - 6) return { hero: true };
      const wounded = me.board.filter(m => m.maxHp - m.curHp >= 6).sort((a, b) => (b.maxHp - b.curHp) - (a.maxHp - a.curHp))[0];
      return wounded ? wounded.uid : null;
    case 'slimeSwarm': return me.mana >= 6 ? true : null;
    case 'arcaneDraw': return me.hand.length <= 7 ? true : null;
    case 'darkSacrifice': {
      if (me.board.filter(x => !x.isSpellShell).length === 0) return null;
      const weakest = me.board.filter(x => !x.isSpellShell).sort((a, b) => a.atk - b.atk || a.curHp - b.curHp)[0];
      return { sacUid: weakest.uid };
    }
    case 'animateDead': {
      const budget = Math.max(0, me.mana - def.cost) * 2;
      const units = [];
      ['player', 'enemy'].forEach(sd => state[sd].graveyard.forEach((g, i) => {
        const gd = !g._isSpell && findDef(g.name);
        if (gd && gd.race === '墓园') units.push({ graveSide: sd, graveIndex: i, cost: g.cost || 0 });
      }));
      units.sort((a, b) => b.cost - a.cost);
      const picks = [];
      let total = 0;
      units.forEach(u => { if (total + u.cost <= budget) { picks.push({ graveSide: u.graveSide, graveIndex: u.graveIndex }); total += u.cost; } });
      return picks.length ? { picks: picks } : null;
    }
    case 'raiseSkeletons': {
      let best = null;
      ['player', 'enemy'].forEach(sd => state[sd].graveyard.forEach((g, i) => {
        if (g._isSpell) return;
        if (!best || (g.cost || 0) > (best.g.cost || 0)) best = { g: g, sd: sd, i: i };
      }));
      return best ? { graveSide: best.sd, graveIndex: best.i } : null;
    }
    case 'doom': return foe.board.length > me.board.length ? true : null;
    case 'forbiddenFlame': {
      const x = me.mana - def.cost;
      return x >= 3 && foe.board.length >= 2 && me.hp > x + 3 ? true : null;
    }
    case 'teleport': return null;
    default: return true;
  }
}
function simPlayStep(side) {
  const e = state[side];
  if (e.board.length >= BOARD_CAP) return false;
  const affordable = e.hand
    .map((c, i) => ({ c, i }))
    .filter(x => effCost(side, x.c) <= e.mana)
    .sort((a, b) => (b.c.rating - a.c.rating) || (effCost(side, b.c) - effCost(side, a.c)));
  if (affordable.length === 0) return false;
  for (let k = 0; k < affordable.length; k++) {
    const x = affordable[k];
    if (x.c.type === 'spell') {
      const decision = simSpellDecision(side, x.c);
      if (decision == null) continue;
      if (playSpellCard(side, x.i, decision === true ? null : decision)) return true;
      continue;
    }
    return playCard(side, x.i);
  }
  return false;
}
function simCastSpells(side) {
  const me = state[side], foe = state[otherSide(side)];
  let guard = 0;
  while (guard++ < 200) {
    let found = null;
    for (const m of me.board) {
      const entries = unitSpellEntries(m);
      for (const en of entries) {
        if (m.spellMana < en.cost) continue;
        const key = en.key;
        if (!unitSpellBoardCond(m, key, side)) continue;
        if (key === 'iceBolt' && foe.board.length === 0) continue;
        if (key === 'bless' && !me.board.some(x => isTargetable(x))) continue;
        if (key === 'repair' && !me.board.some(x => isTargetable(x) && x.traits.includes('机械') && x.curHp < x.maxHp)) continue;
        found = { m: m, en: en };
        break;
      }
      if (found) break;
    }
    if (!found) return;
    const m = found.m, en = found.en;
    if (en.key === 'summonDemon') {
      let best = -1;
      me.graveyard.forEach((g, i) => {
        if (g._isSpell) return;
        if (best < 0 || (g.cost || 0) > (me.graveyard[best].cost || 0)) best = i;
      });
      castUnitSpell(side, m.uid, { key: en.key, graveIndex: best });
    } else if (en.key === 'bless') {
      const t = me.board.filter(x => isTargetable(x)).sort((a, b) => unitPower(b) - unitPower(a))[0];
      castUnitSpell(side, m.uid, { key: en.key, targetUid: t.uid });
    } else if (en.key === 'iceBolt') {
      const t = foe.board.filter(x => isTargetable(x)).sort((a, b) => b.atk - a.atk)[0];
      castUnitSpell(side, m.uid, { key: en.key, targetUid: t.uid });
    } else if (en.key === 'repair') {
      const t = me.board.filter(x => isTargetable(x) && x.traits.includes('机械') && x.curHp < x.maxHp).sort((a, b) => (b.maxHp - b.curHp) - (a.maxHp - a.curHp))[0];
      if (t) castUnitSpell(side, m.uid, { key: en.key, targetUid: t.uid });
    } else {
      castUnitSpell(side, m.uid, { key: en.key });
    }
  }
}
`, ctx, { filename: 'sim-player-ai.js' });

// ---------- 单局对战 ----------
function simGame(deckA, deckB, maxRounds) {
  vm.runInContext('initGame(' + JSON.stringify(deckA) + '.map(n => findDef(n)), "ai", ' +
    JSON.stringify(deckB) + '.map(n => findDef(n)))', ctx, { filename: 'sim-game.js' });
  const st = vm.runInContext('state', ctx);
  let rounds = 0;
  while (!st.gameOver && rounds < (maxRounds || 60) && st.phase) {
    rounds++;
    // 玩家侧（A）自动部署
    vm.runInContext('while (simPlayStep("player")) {}', ctx);
    vm.runInContext('simCastSpells("player")', ctx);
    vm.runInContext('aiSetDefense("player")', ctx);
    // startCombat 内部：敌方（B）自动部署+施法+守备，随后 combatTick 推进
    vm.runInContext('startCombat()', ctx);
    // 驱动 setTimeout 队列直到阶段回到 deploy 或游戏结束
    let guard = 0;
    while (timeouts.length && !st.gameOver && guard++ < 500) {
      const fn = timeouts.shift();
      fn();
      if (st.phase !== 'combat') break;
    }
    if (st.gameOver) break;
    if (st.phase !== 'deploy' && rounds >= (maxRounds || 60)) break;
  }
  const aHp = st.player.hp, bHp = st.enemy.hp;
  return aHp > bHp ? 'A' : bHp > aHp ? 'B' : 'draw';
}

// ---------- 阵营默认卡组 + 胜率表 ----------
const presetOf = race => vm.runInContext(
  'PRESET_DECKS.find(d => d.name === ' + JSON.stringify(race + ' · 标准') + ')', ctx);
const races = (RACE_FILTER || vm.runInContext('RACES.slice()', ctx)).filter(r => presetOf(r));
const table = {};
races.forEach(r => { table[r] = { w: 0, l: 0, d: 0 }; });
for (let i = 0; i < races.length; i++) {
  for (let j = 0; j < races.length; j++) {
    if (i === j) continue;
    const A = presetOf(races[i]), B = presetOf(races[j]);
    const deckA = Object.keys(A.cards).flatMap(n => Array(A.cards[n]).fill(n));
    const deckB = Object.keys(B.cards).flatMap(n => Array(B.cards[n]).fill(n));
    for (let g = 0; g < GAMES; g++) {
      const r = simGame(deckA, deckB);
      if (r === 'A') table[races[i]].w++, table[races[j]].l++;
      else if (r === 'B') table[races[j]].w++, table[races[i]].l++;
      else { table[races[i]].d++; table[races[j]].d++; }
    }
  }
}
console.log('\n===== 阵营胜率（每对阵 ' + GAMES + ' 局 ×2 方向）=====');
const rows = races.map(r => {
  const t = table[r], total = t.w + t.l + t.d;
  return { race: r, w: t.w, l: t.l, d: t.d, rate: total ? ((t.w + t.d / 2) / total * 100).toFixed(1) + '%' : '-' };
}).sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));
rows.forEach(r => console.log(
  r.race.padEnd(4, '　') + '  胜 ' + String(r.w).padStart(3) + '  负 ' + String(r.l).padStart(3) + '  平 ' + String(r.d).padStart(2) + '  胜率 ' + r.rate));
