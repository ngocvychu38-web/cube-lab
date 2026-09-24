/* Step 2: plan corner insertions while preserving the bottom cross. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cross-planner.js'));
  else root.CornerPlanner = factory(root.CrossPlanner);
})(typeof globalThis === 'object' ? globalThis : this, function (Cube) {
  'use strict';
  const { NORMALS, COLORS, move, key, clone } = Cube;
  const equal = (a, b) => a.every((v, i) => v === b[i]);
  const TARGETS = [['F','R'], ['R','B'], ['B','L'], ['L','F']].map(sides => ({
    id: 'D' + sides.join(''), sides,
    name: '黄' + sides.map(f => COLORS[f]).join('') + '角块',
    position: NORMALS.D.map((v, i) => v + sides.reduce((sum, f) => sum + NORMALS[f][i], 0))
  }));
  const STAGE = { number: 2, name: '底层一面', itemName: '底角',
    completion: '底层十字保持正确，四个底角位置和三色朝向全部对齐。自动停止于第2步。' };

  function status(state) {
    const cross = Cube.status(state);
    const corners = TARGETS.map(target => {
      const p = state.find(p => p.stickers.length === 3 && ['D', ...target.sides].every(f => p.stickers.some(s => s.homeFace === f)));
      if (!p) throw new Error('魔方状态缺少 ' + target.name);
      const yellow = p.stickers.find(s => s.homeFace === 'D');
      const positionCorrect = equal(p.position, target.position);
      const yellowDown = equal(yellow.normal, NORMALS.D);
      const sidesAligned = target.sides.every(f => equal(p.stickers.find(s => s.homeFace === f).normal, NORMALS[f]));
      return { ...target, position: p.position.slice(), targetPosition: target.position.slice(),
        yellowNormal: yellow.normal.slice(), stickers: clone(p.stickers),
        positionCorrect, yellowDown, sidesAligned, solved: positionCorrect && yellowDown && sidesAligned };
    });
    return { corners, items: corners, cross, prerequisiteComplete: cross.complete,
      count: corners.filter(c => c.solved).length, complete: cross.complete && corners.every(c => c.solved) };
  }
  function validate(state) { Cube.validate(state); status(state); }
  function ready(state) {
    if (!Cube.status(state).complete) throw new Error('请先完成第1步底层十字，再开始底层一面');
  }

  // U turns and S U^n S' / S' U^n S preserve all four bottom edges.
  // Each insertion affects just one bottom corner at the end of its three turns.
  const MACROS = ['U', "U'", 'U2'].map(m => ({ name: '顶层对位 ' + m, moves: [m] }));
  for (const side of ['R', 'B', 'L', 'F']) for (const prime of [false, true]) {
    for (const up of ['U', "U'", 'U2']) {
      const moves = [side + (prime ? "'" : ''), up, side + (prime ? '' : "'")];
      MACROS.push({ name: '角块取出 / 插入 ' + moves.join(' '), moves });
    }
  }
  // A corner has eight positions and three possible yellow-sticker directions.
  // Its other two sticker directions follow from its identity and handedness.
  const cornerStates = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const position = [x, y, z];
    position.forEach((v, i) => { const normal = [0, 0, 0]; normal[i] = v; cornerStates.push({ position, normal }); });
  }
  const codeOf = (position, normal) => cornerStates.findIndex(s => equal(s.position, position) && equal(s.normal, normal));
  const transitions = cornerStates.map(s => MACROS.map(macro => {
    const [after] = macro.moves.reduce((state, m) => move(state, m), [{ position: s.position, stickers: [{ homeFace: 'D', normal: s.normal }] }]);
    return codeOf(after.position, after.stickers[0].normal);
  }));
  const goals = TARGETS.map(t => codeOf(t.position, NORMALS.D));
  function abortIfNeeded(signal) {
    if (signal?.aborted) { const error = new Error('操作已停止'); error.name = 'AbortError'; throw error; }
  }

  function route(start, goal, allowed) {
    // Weighted Dijkstra on 24 states: minimize physical turns, not macro count.
    const distance = Array(24).fill(Infinity), visited = new Set(), previous = [];
    distance[start] = 0;
    for (let pass = 0; pass < 24; pass++) {
      let current = -1;
      for (let i = 0; i < 24; i++) if (!visited.has(i) && Number.isFinite(distance[i]) && (current === -1 || distance[i] < distance[current])) current = i;
      if (current === -1) break;
      if (current === goal) {
        const path = [];
        while (current !== start) { const prev = previous[current]; path.unshift(prev.macro); current = prev.code; }
        return path;
      }
      visited.add(current);
      for (const macro of allowed) {
        const next = transitions[current][macro], cost = distance[current] + MACROS[macro].moves.length;
        if (cost < distance[next]) { distance[next] = cost; previous[next] = { code: current, macro }; }
      }
    }
    throw new Error('当前角块状态无法用保留已有底层的插入公式归位');
  }

  async function plan(state, { signal } = {}) {
    validate(state); ready(state); abortIfNeeded(signal);
    const before = status(state); if (before.complete) return [];
    const protectedIndices = before.corners.flatMap((c, i) => c.solved ? [i] : []);
    const allowed = MACROS.flatMap((_, m) => protectedIndices.every(i => transitions[goals[i]][m] === goals[i]) ? [m] : []);
    const plans = [];
    for (let target = 0; target < 4; target++) {
      if (before.corners[target].solved) continue;
      abortIfNeeded(signal);
      const corner = before.corners[target];
      const path = route(codeOf(corner.position, corner.yellowNormal), goals[target], allowed);
      let predicted = state, turns = 0;
      const segments = [], safeStops = [];
      for (const m of path) {
        const macro = MACROS[m];
        predicted = macro.moves.reduce((s, notation) => move(s, notation), predicted);
        const checkpoint = status(predicted);
        if (!checkpoint.cross.complete || protectedIndices.some(i => !checkpoint.corners[i].solved)) throw new Error('插入公式未通过底层十字和已有角块保护检查');
        turns += macro.moves.length; safeStops.push(turns);
        segments.push({ name: macro.name, moves: macro.moves.slice(), endsAt: turns });
      }
      const after = status(predicted);
      if (!after.corners[target].solved || after.count <= before.count) throw new Error('候选方案没有使底层角块取得进展');
      const sequence = segments.flatMap(s => s.moves);
      if (plans.some(p => p.moves.join(' ') === sequence.join(' '))) continue;
      plans.push({ id: 'corner_plan_' + (plans.length + 1), targetId: corner.id, target: corner.name,
        moves: sequence, segments, safeStops, beforeCount: before.count, afterCount: after.count,
        protected: protectedIndices.map(i => TARGETS[i].id), protectedCross: ['DF', 'DR', 'DB', 'DL'],
        completed: after.corners.filter(c => c.solved).map(c => c.id), expectedKey: key(predicted) });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    abortIfNeeded(signal); return plans;
  }

  const RULES = [
    '只执行七步法第2步：底层一面。前提是第1步底层十字及四个侧色已经对齐。D黄、U白、F绿、R红、B蓝、L橙；中心定义面，视角不改变面定义。',
    '标准Singmaster记号：正对该面，字母为顺时针90°，撇号为逆时针90°，2为180°。只能执行U D L R F B及其撇号、2形式的外层转动。',
    '目标是DFR、DRB、DBL、DLF四个底角分别处于三个颜色对应的槽位，黄色朝D，两个侧色分别对齐中心；同时DF、DR、DB、DL底棱全部正确。底面同色而侧色不齐不算完成。',
    '先识别目标底角的位置和黄色朝向；在错误底槽或原槽扭转的角块需先取到U层，再用U对位，插入正确底槽并调整朝向。不要转动整个D层来凑底面。',
    '候选由U层对位和S U^n S\' / S\' U^n S取出、插入公式组成，S为R/B/L/F。已根据54张真实贴纸逐步模拟：每段结束都保持底层十字和已有正确底角，完整方案后正确底角至少增加一个。',
    '单次转动途中允许临时打破已完成部分；不在公式中途重新决策。程序执行完整候选后重新读取实际状态。停止请求将在当前短公式结束、十字恢复后生效。',
    '只选择候选ID；优先afterCount更大，其次moves更少。不得自行编造公式、倒放打乱或开始第3步。上两层不要求复原。',
    'PAUSE表示暂停而不是完成。以程序检查的真实贴纸状态作为完成依据，模型置信度不能代替检查。'
  ].join('\n');
  function request(state, plans, { revision, model, recent = [] } = {}) {
    return { model, state: JSON.stringify({ rules: RULES, stage: { number: 2, name: STAGE.name }, revision,
      coordinates: 'x向右，y向上，z向前；position和normal为整数坐标',
      prerequisite: { stage: 1, name: '底层十字', progress: Cube.status(state), mustPreserve: true },
      progress: status(state), cube: state, recentPlans: recent.slice(-4),
      candidates: plans.map(({ expectedKey, ...p }) => p) }),
      questions: { plan: { type: 'choice', instructions: '选择一个已经模拟验证的底层角块方案；优先完成更多底角，其次转动更少。需要中止才选择PAUSE。',
        criteria: Object.fromEntries([...plans.map(p => [p.id, `${p.target}：${p.moves.join(' ')}；底角 ${p.beforeCount}/4 → ${p.afterCount}/4；${p.moves.length} 次转动；保留十字及 ${p.protected.join(',') || '无已有正确底角'}。`]), ['PAUSE', '暂停本轮操作（不是完成）']]) } } };
  }
  return { STAGE, TARGETS, MOVES: Cube.MOVES, NORMALS, COLORS, move, key, clone, status, validate, ready, plan, request, RULES };
});
