// 战斗力评分统一公式（游戏与同步工具共用的唯一数据源）
// 战斗力 = 生命 + 攻击 + 护甲×3 + 词条/法术分值
// （飞行/远程/石像形态 3，法术护盾X/再生X = X 分，拒马 0.5，觉醒 0，其它每项 2；法术卡计 1 个法术）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MTCG_RATING = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function traitW(t) {
    if (t === '拒马') return 0.5;
    if (t === '飞行' || t === '远程' || t === '石像形态') return 3;
    if (t.startsWith('法术护盾')) return parseInt(t.slice(4), 10) || 1; // 法术护盾X = X 分
    if (t.startsWith('再生')) return parseInt(t.slice(2), 10) || 1; // 再生X = X 分
    if (t.startsWith('觉醒')) return 0; // 觉醒是限制词条，不计分
    return 2;
  }
  function computeRating(c) {
    if (c.type === 'spell') return 2;
    let r = (c.hp || 0) + (c.atk || 0) + (c.arm || 0) * 3;
    (c.traits || []).forEach(t => { r += traitW(t); });
    if (c.spell) r += 2;
    if (c.actSpell) r += 2;
    (c.actSpells || []).forEach(() => { r += 2; });
    return r;
  }
  return { traitW, computeRating };
});
