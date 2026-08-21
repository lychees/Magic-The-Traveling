#!/usr/bin/env node
/**
 * 卡牌数据同步工具（无依赖）
 * 用法：node tools/sync-cards.js
 *
 * 流程：读取 cards.json → 全量校验 → 通过后注入 index.html 内嵌
 * <script type="application/json" id="cards-json"> 块（不存在则自动创建）。
 * 校验失败：打印全部错误并以非 0 退出，index.html 不被修改。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CARDS_JSON = path.join(ROOT, 'cards.json');
const INDEX_HTML = path.join(ROOT, 'index.html');
const VALID_TARGETS = ['enemyUnit', 'friendlyUnit', 'graveUnit', 'none'];

function isNum(v) { return typeof v === 'number' && isFinite(v); }

function validate(data) {
  const errors = [];
  if (!data || typeof data !== 'object') { errors.push('cards.json 根节点必须是对象'); return errors; }
  if (!isNum(data.version)) errors.push('缺少 version 字段（数值）');
  if (!Array.isArray(data.races) || data.races.some(r => typeof r !== 'string')) {
    errors.push('races 必须是字符串数组');
  }
  if (!data.schools || typeof data.schools !== 'object') errors.push('schools 必须是对象');
  if (!Array.isArray(data.tokens)) errors.push('tokens 必须是数组');
  if (!Array.isArray(data.cards)) { errors.push('cards 必须是数组'); return errors; }

  const races = Array.isArray(data.races) ? data.races : [];
  const names = new Set();
  data.cards.forEach((c, i) => {
    const at = 'cards[' + i + ']' + (c && c.name ? '(' + c.name + ')' : '');
    if (!c || typeof c !== 'object') { errors.push(at + ': 必须是对象'); return; }
    if (!c.name || typeof c.name !== 'string') errors.push(at + ': 缺少必填字段 name（非空字符串）');
    else if (names.has(c.name)) errors.push(at + ': name 重复');
    else names.add(c.name);
    if (!c.race || races.indexOf(c.race) < 0) errors.push(at + ': race 必填且必须属于 races（实际 ' + JSON.stringify(c.race) + '）');
    if (!isNum(c.cost) || c.cost < 0) errors.push(at + ': cost 必填且为非负数值');
    if (c.type === 'spell') {
      if (!c.spellEffect || typeof c.spellEffect !== 'string') errors.push(at + ': 法术卡缺少 spellEffect');
      if (VALID_TARGETS.indexOf(c.target) < 0) errors.push(at + ': 法术卡 target 必须是 ' + VALID_TARGETS.join('/') + '（实际 ' + JSON.stringify(c.target) + '）');
      if (!c.school || typeof c.school !== 'string') errors.push(at + ': 法术卡缺少 school');
    } else {
      ['atk', 'arm', 'hp'].forEach(f => { if (!isNum(c[f])) errors.push(at + ': 单位卡 ' + f + ' 必须为有限数值'); });
    }
    ['atk', 'arm', 'hp', 'rating'].forEach(f => {
      if (c[f] !== undefined && !isNum(c[f])) errors.push(at + ': ' + f + ' 必须为有限数值');
    });
    if (c.traits !== undefined) {
      if (!Array.isArray(c.traits) || c.traits.some(t => typeof t !== 'string')) errors.push(at + ': traits 必须为字符串数组');
    }
    if (c.actSpells !== undefined) {
      if (!Array.isArray(c.actSpells)) errors.push(at + ': actSpells 必须为数组');
      else c.actSpells.forEach((s, j) => {
        if (!s || typeof s.key !== 'string' || !isNum(s.cost)) errors.push(at + ': actSpells[' + j + '] 必须含 key(字符串)/cost(数值)');
      });
    }
    if (c.actSpell !== undefined) {
      ['spellCost', 'spellMana0', 'spellManaMax'].forEach(f => { if (!isNum(c[f])) errors.push(at + ': 带 actSpell 的卡 ' + f + ' 必须为数值'); });
    }
    if (!c.art || typeof c.art.icon !== 'string' || !isNum(c.art.hue)) errors.push(at + ': art 必须含 icon(字符串)/hue(数值)');
  });
  return errors;
}

function inject(data) {
  let html = fs.readFileSync(INDEX_HTML, 'utf8');
  const blockRe = /<script type="application\/json" id="cards-json">[\s\S]*?<\/script>/;
  const payload = JSON.stringify(data, null, 2);
  if (blockRe.test(html)) {
    html = html.replace(blockRe, '<script type="application/json" id="cards-json">\n' + payload + '\n</script>');
  } else {
    // 在主 <script>（含 'use strict' 的那个）前创建
    const anchor = /<script>\s*\r?\n'use strict';/;
    if (!anchor.test(html)) { console.error('ERROR: index.html 中找不到主 <script> 锚点，无法创建 cards-json 块'); process.exit(1); }
    html = html.replace(anchor, '<script type="application/json" id="cards-json">\n' + payload + '\n</script>\n' + html.match(anchor)[0]);
  }
  fs.writeFileSync(INDEX_HTML, html);
}

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(CARDS_JSON, 'utf8'));
  } catch (e) {
    console.error('ERROR: cards.json 解析失败: ' + e.message);
    process.exit(1);
  }
  // 忽略 '_' 开头的顶层字段（注释/文档字段）
  const errors = validate(data);
  if (errors.length > 0) {
    console.error('校验失败，共 ' + errors.length + ' 个错误（index.html 未修改）：');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  }
  inject(data);
  console.log('OK: cards.json 校验通过（' + data.cards.length + ' 张卡），已注入 index.html');
}

main();
