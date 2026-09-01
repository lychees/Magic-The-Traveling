'use strict';
// card-editor.js — 从 index.html 按域拆分（plain script，共享全局词法作用域）
// ---------- 卡牌编辑器（玩家自建/编辑卡牌） ----------
// 存储：mtcg-card-overrides {原名: def}（覆盖内置卡，名称锁定）；mtcg-custom-cards [def]（玩家新卡）
const CARD_ORIG = CARD_DEFS.map(d => JSON.parse(JSON.stringify(d))); // 内置卡原始快照（重置用）
function getOverrides() { try { return JSON.parse(storage.getItem('mtcg-card-overrides') || '{}') || {}; } catch (e) { return {}; } }
function getCustoms() { try { return JSON.parse(storage.getItem('mtcg-custom-cards') || '[]') || []; } catch (e) { return []; } }
function saveOverrides(o) { try { storage.setItem('mtcg-card-overrides', JSON.stringify(o)); } catch (e) {} }
function saveCustoms(c) { try { storage.setItem('mtcg-custom-cards', JSON.stringify(c)); } catch (e) {} }

// 启动与每次保存后：把覆盖层与自定义卡合并进 CARD_DEFS
function applyCardEdits() {
  const ov = getOverrides(), cu = getCustoms();
  CARD_DEFS.length = 0;
  CARD_ORIG.forEach(d => {
    if (ov[d.name]) CARD_DEFS.push(Object.assign({}, d, ov[d.name], { name: d.name, _edited: true }));
    else CARD_DEFS.push(d);
  });
  cu.forEach(c => { if (!CARD_DEFS.some(d => d.name === c.name)) CARD_DEFS.push(Object.assign({ _custom: true }, c)); });
}

const ED = { origName: null, isCustom: false, isNew: true, filter: 'all', def: null };
const ED_PARAM_TRAITS = ['法术护盾', '再生', '毒Lv', '护甲穿透', '复仇', '威吓', '鼓舞', '觉醒', '反击', '法力燃烧']; // 可自定义 X 的词条家族
const ED_TRAITS = [...new Set(CARD_ORIG.flatMap(d => d.traits || []))].filter(t => !ED_PARAM_TRAITS.some(f => t.startsWith(f))).sort((a, b) => a.localeCompare(b));
const ED_SPELL_KEYS = Object.keys((window.VIEWER_TEXT || {}).spell || {});
const ED_ACT_KEYS = Object.keys((window.VIEWER_TEXT || {}).unitSpell || {});
const ED_FX_KEYS = Object.keys((window.VIEWER_TEXT || {}).spellFx || {});
const ED_SCHOOLS = ['土', '水', '火', '气'];
const ED_TARGETS = [['none', '无目标'], ['friendlyUnit', '友方单位'], ['enemyUnit', '敌方单位'], ['graveUnit', '墓地单位']];

function edRating(def) { return MTCG_RATING.computeRating(def); } // 公式唯一数据源：tools/rating.js

function edNewDef() {
  return { name: '', type: 'unit', race: RACES[0], cost: 1, atk: 1, arm: 0, hp: 1, traits: [], art: { icon: '✨', hue: 200 } };
}

function openCardEditor() {
  document.getElementById('game').style.display = 'none';
  document.getElementById('deckbuilder').style.display = 'none';
  document.getElementById('roguelike').style.display = 'none';
  document.getElementById('card-editor').style.display = 'flex';
  ED.isNew = true; ED.origName = null; ED.isCustom = false; ED.def = edNewDef();
  renderCardEditor();
}

function closeCardEditor() {
  document.getElementById('card-editor').style.display = 'none';
  showBuilder();
}

function edLoadDef(name) {
  const custom = getCustoms().find(c => c.name === name);
  const base = CARD_DEFS.find(d => d.name === name);
  const src = custom || base;
  if (!src) return;
  ED.def = JSON.parse(JSON.stringify(src));
  ED.origName = name;
  ED.isCustom = !!custom;
  ED.isNew = false;
  renderCardEditor();
}

function edListHtml() {
  const ov = getOverrides(), cu = getCustoms();
  const se = document.getElementById('ce-search');
  const q = (se && se.value || '').trim();
  let list = CARD_DEFS.slice();
  if (ED.filter === 'custom') list = list.filter(d => d._custom);
  if (ED.filter === 'edited') list = list.filter(d => ov[d.name]);
  if (q) list = list.filter(d => d.name.indexOf(q) >= 0);
  list.sort((a, b) => (a._custom === b._custom ? (a.cost - b.cost || a.name.localeCompare(b.name)) : a._custom ? -1 : 1));
  return list.map(d => {
    const mark = d._custom ? '🛠 ' : ov[d.name] ? '✏️ ' : '';
    return '<div class="ce-item' + (ED.origName === d.name ? ' cur' : '') + '" data-ce="load" data-name="' + d.name + '">' +
      mark + d.name + '<span class="ce-item-sub">' + d.cost + '费 · ' + d.race + '</span></div>';
  }).join('');
}

function edFormHtml() {
  const d = ED.def, isSpell = d.type === 'spell';
  const lockName = !ED.isNew && !ED.isCustom; // 内置卡名称锁定
  const vt = (window.VIEWER_TEXT || { traits: {}, spell: {}, unitSpell: {}, spellFx: {} });
  const sel = (id, opts, cur) => '<select id="' + id + '">' + opts.map(o => {
    const v = Array.isArray(o) ? o[0] : o, label = Array.isArray(o) ? o[1] : o;
    return '<option value="' + v + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + label + '</option>';
  }).join('') + '</select>';
  const num = (id, v, min, max) => '<input type="number" id="' + id + '" value="' + (v == null ? '' : v) + '" min="' + min + '" max="' + max + '" style="width:64px">';
  let h = '<div class="ce-grid">';
  h += '<label>名称</label><input id="ce-name" value="' + (d.name || '') + '"' + (lockName ? ' disabled' : '') + ' placeholder="必填，不能与现有卡重名">';
  h += '<label>类型</label>' + sel('ce-type', [['unit', '单位'], ['spell', '法术']], d.type);
  h += '<label>阵营</label>' + sel('ce-race', RACES, d.race);
  h += '<label>费用</label>' + num('ce-cost', d.cost, 0, 15);
  if (!isSpell) {
    h += '<label>攻/甲/血</label><span>' + num('ce-atk', d.atk, 0, 30) + ' ' + num('ce-arm', d.arm, 0, 10) + ' ' + num('ce-hp', d.hp, 1, 40) + '</span>';
    h += '<label>传说</label><span><input type="checkbox" id="ce-legend"' + (d.legend ? ' checked' : '') + '> 每牌组限 1 张</span>';
    h += '<label>初始士气</label>' + num('ce-morale0', d.morale0, -10, 10);
    h += '<label>卡牌特效<br><small>战吼/亡语</small></label><span>' + sel('ce-spell', [['', '无']].concat(ED_SPELL_KEYS.map(k => [k, (vt.spell[k] || k).slice(0, 18)])), d.spell || '') +
      ' 参数 ' + num('ce-spellParam', d.spellParam || 0, 0, 10) + '</span>';
    h += '<label>单位法术</label><span id="ce-acts">' +
      (d.actSpells || []).map((s, i) => '<div class="ce-act">' + sel('ce-act-key-' + i, ED_ACT_KEYS, s.key) + ' 费 ' + num('ce-act-cost-' + i, s.cost, 0, 10) +
        ' <button class="btn ce-mini" data-ce="act-del" data-i="' + i + '">删</button></div>').join('') +
      '<button class="btn ce-mini" data-ce="act-add">+ 添加单位法术</button></span>';
    if ((d.actSpells || []).length) {
      h += '<label>法术法力<br><small>初始/上限</small></label><span>' + num('ce-spellMana0', d.spellMana0 || 0, 0, 10) + ' / ' + num('ce-spellManaMax', d.spellManaMax || 0, 0, 10) + '</span>';
    }
    h += '<label>参数词条<br><small>自定 X 数值</small></label><div class="ce-traits">' + ED_PARAM_TRAITS.map(fam => {
      const cur = (d.traits || []).find(t => t.startsWith(fam));
      const x = cur ? (parseInt(cur.slice(fam.length), 10) || 1) : 1;
      return '<label class="ce-trait" title="' + (vt.traits[fam] || '') + '"><input type="checkbox" data-ptrait="' + fam + '"' + (cur ? ' checked' : '') + '> ' + fam + ' <input type="number" data-pnum="' + fam + '" value="' + x + '" min="1" max="9" style="width:44px"></label>';
    }).join('') + '</div>';
    h += '<label>词条</label><div class="ce-traits">' + ED_TRAITS.map(t =>
      '<label class="ce-trait" title="' + (vt.traits[t] || '') + '"><input type="checkbox" data-trait="' + t + '"' + ((d.traits || []).indexOf(t) >= 0 ? ' checked' : '') + '> ' + t + '</label>').join('') + '</div>';
  } else {
    h += '<label>系别</label>' + sel('ce-school', ED_SCHOOLS, d.school || '土');
    h += '<label>效果</label>' + sel('ce-fx', ED_FX_KEYS.map(k => [k, (vt.spellFx[k] || k).slice(0, 22)]), d.spellEffect || ED_FX_KEYS[0]);
    h += '<label>目标</label>' + sel('ce-target', ED_TARGETS, d.target || 'none');
    h += '<label>参数</label>' + num('ce-spellParam', d.spellParam || 0, 0, 10);
  }
  h += '<label>卡面图标<br><small>emoji</small></label><input id="ce-icon" value="' + (d.art && d.art.icon || '✨') + '" style="width:80px"> 色相 ' + num('ce-hue', d.art && d.art.hue != null ? d.art.hue : 200, 0, 360);
  h += '</div>';
  // 预览与操作
  const rating = edRating(collectEdForm(false) || d);
  h += '<div class="ce-side">';
  h += '<div id="ce-preview"></div>';
  h += '<div class="ce-rating">战斗力评分（自动）：<b>' + rating + '</b></div>';
  h += '<div class="ce-ops">';
  h += '<button class="btn btn-primary" data-ce="save">' + (ED.isNew ? '创建卡牌' : '保存修改') + '</button>';
  if (!ED.isNew && ED.isCustom) h += '<button class="btn btn-danger" data-ce="delete">删除此卡</button>';
  if (!ED.isNew && !ED.isCustom && getOverrides()[ED.origName]) h += '<button class="btn" data-ce="reset">恢复原始</button>';
  h += '<button class="btn" data-ce="new">新建空白</button>';
  h += '</div>';
  if (!ED.isNew && !ED.isCustom && getOverrides()[ED.origName]) h += '<div class="ce-note">此卡已被你修改（✏️），恢复原始可撤销。</div>';
  if (ED.isCustom) h += '<div class="ce-note">🛠 自定义卡牌，已自动拥有 4 张。</div>';
  h += '</div>';
  return h;
}

function collectEdForm(strict) {
  const g = id => document.getElementById(id);
  if (!g('ce-name')) return null;
  const name = g('ce-name').value.trim();
  const type = g('ce-type').value;
  const def = { name: name, race: g('ce-race').value, cost: Math.max(0, Math.min(15, parseInt(g('ce-cost').value, 10) || 0)) };
  if (type === 'spell') def.type = 'spell';
  const nv = (id, dflt) => { const v = parseInt(g(id) && g(id).value, 10); return isNaN(v) ? (dflt || 0) : v; };
  if (type === 'unit') {
    def.atk = nv('ce-atk'); def.arm = nv('ce-arm'); def.hp = Math.max(1, nv('ce-hp', 1));
    if (g('ce-legend').checked) def.legend = true;
    const m0 = nv('ce-morale0', null);
    if (m0 != null && m0 !== 0) def.morale0 = m0;
    if (g('ce-spell').value) { def.spell = g('ce-spell').value; const sp = nv('ce-spellParam'); if (sp) def.spellParam = sp; }
    const acts = [];
    (ED.def.actSpells || []).forEach((s, i) => {
      const k = g('ce-act-key-' + i);
      if (k) acts.push({ key: k.value, cost: Math.max(0, nv('ce-act-cost-' + i)) });
    });
    if (acts.length) {
      def.actSpells = acts;
      def.spellMana0 = nv('ce-spellMana0'); def.spellManaMax = nv('ce-spellManaMax');
    }
    def.traits = ED_PARAM_TRAITS.filter(fam => { const cb = document.querySelector('input[data-ptrait="' + fam + '"]'); return cb && cb.checked; }).map(fam => {
      const numEl = document.querySelector('input[data-pnum="' + fam + '"]');
      return fam + Math.max(1, Math.min(9, parseInt(numEl && numEl.value, 10) || 1));
    });
    def.traits = def.traits.concat([...document.querySelectorAll('#ce-form input[data-trait]:checked')].map(x => x.dataset.trait));
  } else {
    def.school = g('ce-school').value;
    def.spellEffect = g('ce-fx').value;
    def.target = g('ce-target').value;
    const sp = nv('ce-spellParam');
    if (sp) def.spellParam = sp;
  }
  def.art = { icon: (g('ce-icon').value.trim() || '❔'), hue: Math.max(0, Math.min(360, nv('ce-hue', 200))) };
  if (strict) {
    if (!name) { alert('名称不能为空'); return null; }
    if (/[<>&"']/.test(name)) { alert('名称不能包含尖括号或引号'); return null; }
    const dup = CARD_DEFS.some(d => d.name === name && d.name !== ED.origName);
    if (dup) { alert('已存在同名卡牌【' + name + '】'); return null; }
  }
  def.rating = edRating(def);
  return def;
}

function edRefreshPreview() {
  const def = collectEdForm(false);
  const el = document.getElementById('ce-preview');
  if (!def || !el) return;
  let url = '';
  if (window.__drawCardFace) { try { url = window.__drawCardFace(def, -1).toDataURL('image/jpeg', 0.85); } catch (e) {} }
  el.innerHTML = url ? '<img src="' + url + '" style="width:150px;border-radius:8px">' : '';
  const r = document.querySelector('.ce-rating b');
  if (r) r.textContent = edRating(def);
}

function renderCardEditor() {
  const body = document.getElementById('ce-body');
  const ov = getOverrides();
  const tabs = [['all', '全部'], ['custom', '🛠 自定义'], ['edited', '✏️ 已修改']];
  body.innerHTML =
    '<div id="ce-left">' +
      '<input id="ce-search" placeholder="搜索卡名…">' +
      '<div class="ce-tabs">' + tabs.map(t => '<button class="btn ce-mini' + (ED.filter === t[0] ? ' active' : '') + '" data-ce="filter" data-f="' + t[0] + '">' + t[1] + '</button>').join('') + '</div>' +
      '<div id="ce-list">' + edListHtml() + '</div><div class="ce-note" style="padding:4px 6px">双击卡牌可 3D 检视</div>' +
    '</div>' +
    '<div id="ce-form">' + edFormHtml() + '</div>';
  edRefreshPreview();
}

function edSave() {
  const def = collectEdForm(true);
  if (!def) return;
  if (ED.isNew) {
    const cu = getCustoms();
    cu.push(def);
    saveCustoms(cu);
    collection[def.name] = 4; // 新卡自动拥有 4 张
    saveEconomy();
    ED.origName = def.name; ED.isCustom = true; ED.isNew = false;
  } else if (ED.isCustom) {
    const cu = getCustoms();
    const i = cu.findIndex(c => c.name === ED.origName);
    if (i >= 0) {
      if (def.name !== ED.origName) { // 重命名：收藏数量随迁
        collection[def.name] = collection[ED.origName] || 4;
        delete collection[ED.origName];
        saveEconomy();
      }
      cu[i] = def;
      saveCustoms(cu);
    }
    ED.origName = def.name;
  } else {
    const ov = getOverrides();
    def.name = ED.origName; // 内置卡名称锁定
    ov[ED.origName] = def;
    saveOverrides(ov);
  }
  ED.def = def;
  applyCardEdits();
  renderBuilder();
  renderCardEditor();
  sfx('heal');
}

function edAction(act, ds) {
  if (act === 'load') {
    const now = performance.now();
    if (ED._lastLoad && ED._lastLoad.name === ds.name && now - ED._lastLoad.t < 350) { // 双击同名卡 → 3D 检视
      ED._lastLoad = null;
      if (window.__holo) { window.__holo.open(ds.name); return; }
    } else ED._lastLoad = { name: ds.name, t: now };
    edLoadDef(ds.name);
    return;
  }
  if (act === 'filter') { ED.filter = ds.f; renderCardEditor(); return; }
  if (act === 'new') { ED.isNew = true; ED.origName = null; ED.isCustom = false; ED.def = edNewDef(); renderCardEditor(); return; }
  if (act === 'save') { edSave(); return; }
  if (act === 'delete') {
    if (!ED.isCustom || !confirm('确定删除自定义卡【' + ED.origName + '】？（收藏中的也会移除）')) return;
    saveCustoms(getCustoms().filter(c => c.name !== ED.origName));
    delete collection[ED.origName];
    saveEconomy();
    applyCardEdits();
    ED.isNew = true; ED.origName = null; ED.isCustom = false; ED.def = edNewDef();
    renderBuilder();
    renderCardEditor();
    return;
  }
  if (act === 'reset') {
    if (!confirm('恢复【' + ED.origName + '】为原始数值？')) return;
    const ov = getOverrides();
    delete ov[ED.origName];
    saveOverrides(ov);
    applyCardEdits();
    ED.def = JSON.parse(JSON.stringify(CARD_DEFS.find(d => d.name === ED.origName)));
    renderBuilder();
    renderCardEditor();
    return;
  }
  if (act === 'act-add') {
    const cur = collectEdForm(false);
    if (cur) ED.def = cur;
    ED.def.actSpells = (ED.def.actSpells || []).concat([{ key: ED_ACT_KEYS[0], cost: 1 }]);
    ED.def.spellMana0 = ED.def.spellMana0 || 0; ED.def.spellManaMax = ED.def.spellManaMax || 1;
    renderCardEditor();
    return;
  }
  if (act === 'act-del') {
    const cur = collectEdForm(false);
    if (cur) ED.def = cur;
    ED.def.actSpells.splice(parseInt(ds.i, 10), 1);
    renderCardEditor();
    return;
  }
  if (act === 'export') {
    const data = JSON.stringify({ overrides: getOverrides(), customs: getCustoms() }, null, 2);
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);
    a.download = 'card-edits.json';
    a.click();
    return;
  }
  if (act === 'import') {
    const ta = document.getElementById('ce-import-text');
    ta.style.display = ta.style.display === 'none' ? '' : 'none';
    return;
  }
  if (act === 'import-apply') {
    let data;
    try { data = JSON.parse(document.getElementById('ce-import-json').value); } catch (e) { alert('JSON 解析失败'); return; }
    if (!data || typeof data !== 'object') { alert('格式不对'); return; }
    if (data.overrides) saveOverrides(Object.assign(getOverrides(), data.overrides));
    if (Array.isArray(data.customs)) {
      const cu = getCustoms();
      data.customs.forEach(c => { if (c && c.name && !cu.some(x => x.name === c.name)) { cu.push(c); collection[c.name] = collection[c.name] || 4; } });
      saveCustoms(cu);
      saveEconomy();
    }
    applyCardEdits();
    renderBuilder();
    renderCardEditor();
    return;
  }
}

document.getElementById('ce-body').addEventListener('click', e => {
  const el = e.target.closest('[data-ce]');
  if (el) edAction(el.dataset.ce, el.dataset);
});
document.getElementById('ce-export').addEventListener('click', () => edAction('export', {}));
document.getElementById('ce-import').addEventListener('click', () => edAction('import', {}));
document.getElementById('ce-import-apply').addEventListener('click', () => edAction('import-apply', {}));
// 双击卡牌条目 / 预览图：3D 检视
document.getElementById('ce-body').addEventListener('dblclick', e => {
  if (!window.__holo) return;
  const item = e.target.closest('.ce-item');
  if (item && item.dataset.name) { window.__holo.open(item.dataset.name); return; }
  if (e.target.closest('#ce-preview') && ED.origName) window.__holo.open(ED.origName);
});
document.getElementById('ce-body').addEventListener('input', e => {
  if (e.target.id === 'ce-search') { document.getElementById('ce-list').innerHTML = edListHtml(); return; }
  if (e.target.id === 'ce-type') { // 切换类型时先收集当前表单，避免已填内容丢失
    const cur = collectEdForm(false);
    if (cur) ED.def = cur;
    renderCardEditor();
    return;
  }
  edRefreshPreview();
});
document.getElementById('open-card-editor').addEventListener('click', openCardEditor);
document.getElementById('ce-close').addEventListener('click', closeCardEditor);

// 启动时合并玩家的修改与自定义卡
applyCardEdits();
