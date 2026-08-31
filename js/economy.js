'use strict';
// economy.js — 从 index.html 按域拆分（plain script，共享全局词法作用域）
// ---------- 开卡包 ----------
let packCards = null;    // 当前开包未入库的卡
let packRevealed = [];

function updateGoldUi() {
  const el = document.getElementById('gold-display');
  if (el) el.textContent = '🪙 ' + gold;
  const btn = document.getElementById('open-pack');
  if (btn) {
    btn.disabled = gold < PACK_PRICE;
    btn.title = gold < PACK_PRICE ? '金币不足（需要 ' + PACK_PRICE + '）' : '开一包 ' + PACK_SIZE + ' 张随机卡';
  }
  // 阵营商店：填充阵营下拉 + 按金币禁用
  const fr = document.getElementById('shop-race');
  if (fr && fr.options.length === 0) RACES.forEach(r => {
    const o = document.createElement('option');
    o.value = r; o.textContent = r;
    fr.appendChild(o);
  });
  const fb1 = document.getElementById('buy-fpack'), fb2 = document.getElementById('buy-fbox');
  if (fb1) fb1.disabled = gold < FACTION_PACK_PRICE;
  if (fb2) fb2.disabled = gold < FACTION_BOX_PRICE;

}
// 3D 开卡包：扣金币 roll 5 张 → 3D 卡包撕开 → 扇出 → 自动入库（3D 检视可用时的默认路径）
// 入库：把卡牌加入收藏并持久化（阵营包/卡盒共用）
function grantCards(defs) {
  defs.forEach(d => { collection[d.name] = (collection[d.name] || 0) + 1; });
  saveEconomy();
}

// 阵营卡包：150 金币，5 张同阵营随机卡，走 3D 撕包
function buyFactionPack(race) {
  if (gold < FACTION_PACK_PRICE || packCards || !window.__holo) return false;
  const pool = CARD_DEFS.filter(d => d.race === race);
  if (pool.length === 0) return false;
  gold -= FACTION_PACK_PRICE;
  const defs = [];
  for (let i = 0; i < PACK_SIZE; i++) defs.push(pool[Math.floor(Math.random() * pool.length)]);
  saveEconomy();
  sfx('pack');
  window.__packCommit = () => {
    grantCards(defs);
    log('【' + race + '卡包】已收入收藏：' + defs.map(d => d.name).join('、'));
    window.__packCommit = null;
  };
  window.__packClosed = () => { renderBuilder(); window.__packClosed = null; };
  window.__holo.openPack(defs, race + '卡包', 'pack', race);
  updateGoldUi();
  return true;
}

// 阵营卡盒：600 金币（8 折），连续开 5 包同阵营卡包（每包独立入库）
function buyFactionBox(race) {
  if (gold < FACTION_BOX_PRICE || packCards || !window.__holo) return false;
  const pool = CARD_DEFS.filter(d => d.race === race);
  if (pool.length === 0) return false;
  gold -= FACTION_BOX_PRICE;
  // 保底：每包至少 1 张评分 ≥10；第一包至少 1 张评分 ≥15（卡盒与卡包的内容差异）
  const rollFive = () => {
    const defs = [];
    for (let i = 0; i < PACK_SIZE; i++) defs.push(pool[Math.floor(Math.random() * pool.length)]); // 卡盒每包 5 张
    return defs;
  };
  const guarantee = (defs, minR) => {
    let guard = 0;
    while (!defs.some(d => (d.rating || 0) >= minR) && guard++ < 20) {
      defs[Math.floor(Math.random() * defs.length)] = pool[Math.floor(Math.random() * pool.length)];
    }
    return defs;
  };
  const queue = [];
  for (let k = 0; k < FACTION_BOX_PACKS; k++) {
    queue.push(guarantee(rollFive(), k === 0 ? 15 : 10));
  }
  saveEconomy();
  sfx('pack');
  // 卡盒：先开盒出 5 个卡包，逐个撕开（每包入库由批次钩子结算）
  window.__packCommit = () => {
    const defs = window.__packBatchDefs || queue[0] || [];
    grantCards(defs);
    log('【' + race + '卡盒】入库：' + defs.map(d => d.name).join('、'));
    window.__packCommit = null;
  };
  window.__packNext = null;
  window.__packClosed = () => { renderBuilder(); window.__packClosed = null; };
  window.__holo.openBox(queue.slice(), race);
  updateGoldUi();
  return true;
}

function buyPack3D() {
  if (gold < PACK_PRICE || packCards || !window.__holo) return false;
  gold -= PACK_PRICE;
  packCards = [];
  for (let i = 0; i < PACK_SIZE; i++) packCards.push(CARD_DEFS[Math.floor(Math.random() * CARD_DEFS.length)]);
  packRevealed = packCards.map(() => true); // 3D 流程视为全部翻开，撕包完成即入库
  saveEconomy();
  sfx('pack');
  window.__packCommit = () => {
    commitPack();
    window.__packCommit = null;
  };
  window.__packClosed = () => {
    renderBuilder(); // 收藏已变化，刷新组牌界面
    window.__packClosed = null;
  };
  window.__holo.openPack(packCards, '扩充卡包', 'pack');
  updateGoldUi();
  return true;
}

function buyPack() {
  if (gold < PACK_PRICE || packCards) return false; // 金币不足或有未入库的包
  gold -= PACK_PRICE;
  packCards = [];
  for (let i = 0; i < PACK_SIZE; i++) packCards.push(CARD_DEFS[Math.floor(Math.random() * CARD_DEFS.length)]);
  packRevealed = packCards.map(() => false);
  saveEconomy();
  sfx('pack');
  document.getElementById('pack-summary').innerHTML = '';
  document.getElementById('pack-done').style.display = 'none';
  document.getElementById('pack-reveal-all').style.display = '';
  document.getElementById('pack-commit').style.display = '';
  renderPack();
  document.getElementById('pack-screen').classList.add('show');
  updateGoldUi();
  return true;
}

function renderPack() {
  if (!packCards) return;
  document.getElementById('pack-cards').innerHTML = packCards.map((d, i) => {
    if (!packRevealed[i]) {
      return '<div class="pack-slot" data-action="pack-reveal" data-idx="' + i + '"><div class="pack-back">🂠</div></div>';
    }
    return '<div class="pack-slot">' +
      '<div class="pack-face r' + rarityOf(d) + ' ' + raceClass(d) + '">' +
      '<div class="c-cost">' + d.cost + '</div>' +
      '<div class="c-name">' + d.name + '</div>' +
      artHtml(d) +
      cardStatsHtml(d) +
      '</div></div>';
  }).join('');
  const all = packRevealed.every(Boolean);
  document.getElementById('pack-reveal-all').disabled = all;
  document.getElementById('pack-commit').disabled = !all;
}

function revealPack(i) {
  if (!packCards || packRevealed[i]) return;
  packRevealed[i] = true;
  sfx('flip');
  renderPack();
}

function revealAll() {
  if (!packCards) return;
  packRevealed = packRevealed.map(() => true);
  sfx('flip');
  renderPack();
}

// 全部翻开后入库，显示每张卡的最新拥有数
function commitPack() {
  if (!packCards || !packRevealed.every(Boolean)) return false;
  packCards.forEach(d => { collection[d.name] = (collection[d.name] || 0) + 1; });
  saveEconomy();
  document.getElementById('pack-summary').innerHTML = '已收入收藏：' +
    packCards.map(d => d.name + ' ×' + ownedOf(d.name)).join('　');
  document.getElementById('pack-reveal-all').style.display = 'none';
  document.getElementById('pack-commit').style.display = 'none';
  document.getElementById('pack-done').style.display = '';
  packCards = null;
  return true;
}

function closePack() {
  document.getElementById('pack-screen').classList.remove('show');
  renderBuilder(); // 收藏已变化，刷新组牌界面
}

// ---------- 音效（WebAudio 程序化合成，无外部音频资源） ----------
let audioCtx = null; // 首次用户交互时才创建（浏览器自动播放策略）
let muted = false;
try { muted = localStorage.getItem('sfx-muted') === '1'; } catch (e) {}
const sfxThrottle = {}; // 同一 tick 内同名音效只播一次

// 在首次 click 时调用：创建 / resume AudioContext
function ensureAudio() {
  if (muted) return null;
  const AC = typeof AudioContext !== 'undefined' ? AudioContext
    : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
  if (!AC) return null;
  if (!audioCtx) {
    try { audioCtx = new AC(); } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, dur, opts) {
  const ctx = ensureAudio();
  if (!ctx) return;
  opts = opts || {};
  const t = ctx.currentTime + (opts.delay || 0);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = opts.type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.vol || 0.1, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

// 滤波噪声闷响（攻击命中等）；opts: {type 滤波类型, slideTo 截止频率扫频终点, delay 延迟}
function noiseBurst(cutoff, dur, vol, opts) {
  const ctx = ensureAudio();
  if (!ctx) return;
  opts = opts || {};
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = opts.type || 'lowpass';
  const t = ctx.currentTime + (opts.delay || 0);
  f.frequency.setValueAtTime(cutoff, t);
  if (opts.slideTo) f.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(t);
}

// 所有发声入口：静音 / 未初始化（尚无用户交互）/ 无 AudioContext 时静默返回
function sfx(name) {
  if (muted || !audioCtx) return;
  if (sfxThrottle[name]) return;
  sfxThrottle[name] = true;
  setTimeout(() => { sfxThrottle[name] = false; }, 80);
  switch (name) {
    case 'summon': tone(330, .14, { type: 'triangle', slideTo: 660, vol: .1 }); break;
    case 'hit': noiseBurst(750, .12, .3); tone(130, .1, { type: 'square', vol: .07 }); break;
    case 'counter': noiseBurst(1500, .09, .22); tone(240, .08, { type: 'square', vol: .06 }); break;
    case 'death': tone(210, .35, { type: 'sawtooth', slideTo: 52, vol: .09 }); break;
    case 'heal': [523, 659, 784].forEach((f, i) => tone(f, .16, { type: 'sine', delay: i * .06, vol: .06 })); break;
    case 'phase': tone(440, .14, { type: 'sine', vol: .07 }); tone(587, .18, { type: 'sine', delay: .09, vol: .07 }); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, { type: 'triangle', delay: i * .13, vol: .1 })); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => tone(f, .26, { type: 'triangle', delay: i * .15, vol: .09 })); break;
    case 'pack': [330, 415, 494, 660].forEach((f, i) => tone(f, .12, { type: 'triangle', delay: i * .07, vol: .08 })); break;
    case 'flip': noiseBurst(2200, .06, .15); tone(520, .08, { type: 'sine', vol: .06 }); break;
    case 'spellcast': tone(520, .16, { type: 'sine', slideTo: 880, vol: .08 }); noiseBurst(1800, .08, .12); break;
    // 高费单位降临：低音轰鸣 + 上行光辉
    case 'epic': tone(65, .5, { type: 'sawtooth', slideTo: 130, vol: .12 }); noiseBurst(300, .3, .25); [523, 784, 1047].forEach((f, i) => tone(f, .3, { type: 'triangle', delay: .18 + i * .1, vol: .07 })); break;
    // 士气高涨（额外行动）：明亮上扬的号角式琶音
    case 'moraleUp': [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, .12, { type: 'triangle', delay: i * .05, vol: .09 })); break;
    // 撕卡包：带通噪声下扫 + 三次短裂响（纸张撕裂）
    case 'tear': noiseBurst(3200, .16, .22, { type: 'bandpass', slideTo: 700 }); [0, .05, .1].forEach(d => noiseBurst(2600, .04, .16, { delay: d })); break;
    // 撕卡盒：低频闷响 + 更粗粝的长撕裂
    case 'boxOpen': noiseBurst(420, .18, .3); noiseBurst(2400, .3, .18, { type: 'bandpass', slideTo: 500 }); [0, .07, .15].forEach(d => noiseBurst(1800, .05, .14, { delay: d })); break;
    // 卡片扇形展开：带通噪声上扫（挥动）
    case 'whoosh': noiseBurst(600, .26, .18, { type: 'bandpass', slideTo: 2800 }); break;
    // 卡片散落：一串随机音高的短促碰撞
    case 'scatter': [0, .05, .11, .16, .22].forEach(d => noiseBurst(1500 + Math.random() * 1400, .05, .13, { delay: d })); break;
    // 集卡册翻页：纸张挥动上扫 + 延迟落地轻拍
    case 'pageTurn': noiseBurst(900, .2, .16, { type: 'bandpass', slideTo: 3200 }); noiseBurst(500, .07, .14, { delay: .45 }); break;
    // 打开集卡册：低鸣 + 皮革厚纸摩擦
    case 'albumOpen': tone(95, .3, { type: 'sawtooth', slideTo: 65, vol: .05 }); noiseBurst(700, .28, .13); break;
    // 领取传说奖励：华丽上行琶音 + 高频闪光
    case 'claim': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .24, { type: 'triangle', delay: i * .09, vol: .09 })); tone(2093, .5, { type: 'sine', delay: .5, vol: .04 }); noiseBurst(6000, .4, .05, { type: 'highpass' }); break;
    // 卡盒全部开完平铺：轻快三连上行
    case 'gridDone': [660, 880, 1175].forEach((f, i) => tone(f, .14, { type: 'triangle', delay: i * .08, vol: .08 })); break;
    // 士气低落（无法行动/反击失败）：低沉不协和的下坠音
    case 'moraleDown': tone(220, .3, { type: 'sawtooth', slideTo: 110, vol: .08 }); tone(233, .3, { type: 'sawtooth', slideTo: 116, vol: .06, delay: .05 }); break;
  }
}

function updateMuteBtn() {
  const el = document.getElementById('sfx-toggle');
  if (el) el.textContent = muted ? '🔇' : '🔊';
}
