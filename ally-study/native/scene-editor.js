// Runs inside engine 1.6's Editor closure and uses its existing native diff painter.
let allyBoard = null, allyRevision = 0;
const allyNames = Object.create(null), allyReceipts = new Map(), allyUndo = [], allyRedo = [];
const allyCopy = x => JSON.parse(JSON.stringify(x));
const allySafe = x => typeof x === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(x);
function allyIndexes() {
  const out = [];
  for (let i = 0; i < st.marks.length; i++) if (mark(i) && mark(i).do !== 'edit' && !mark(i).__dropped) out.push(i);
  for (const k of Object.keys(E.MK)) if (+k >= EDIT_BASE && !mark(+k).__dropped) out.push(+k);
  return out;
}
function allyState() {
  const indexes = allyIndexes();
  const geometry = m => {
    const out = {};
    for (const k of ['do','at','pts','r','rx','ry','w','h','text','tone','fill','size','style','dash','__xf']) if (m[k] !== undefined) out[k] = allyCopy(m[k]);
    return out;
  };
  const state = { version: 1, boardId: allyBoard, revision: allyRevision, undo: allyUndo.length, redo: allyRedo.length,
    groups: allyCopy(allyNames), objects: indexes.slice(0, 300).map(i => ({ id: 'm' + i,
      semanticIds: Object.keys(allyNames).filter(k => allyNames[k].includes(i)), visible: drawn(i),
      deleted: !!mark(i).__allyDeleted, geometry: geometry(mark(i)), box: box(i) })), truncated: indexes.length > 300,
    receipts: [...allyReceipts].slice(-12).map(([requestId, r]) => ({ requestId, revision: r.revision, touched: r.touched })),
    results: log.filter(r => r.op === 'allyScene').slice(-6).map(r => ({requestId:r.requestId,ok:r.ok,error:r.error || null,touched:r.touched || []})) };
  while (JSON.stringify(state).length > 24000 && state.objects.length) { state.objects.pop(); state.truncated = true; }
  return state;
}
function allyResolve(ids, includeHidden) {
  const list = Array.isArray(ids) ? ids : [ids], result = [];
  if (!list.length || list.length > 80) throw Error('Choose 1–80 exact object/group IDs.');
  for (const id of list) {
    const values = Object.hasOwn(allyNames, id) ? allyNames[id] : typeof id === 'string' && /^m\d+$/.test(id) ? [+id.slice(1)] : null;
    if (!values || !values.length) throw Error('Unknown scene ID ' + id);
    for (const i of values) {
      const m = mark(i);
      if (!m || m.do === 'edit' || m.__dropped || m.__allyDeleted || (!includeHidden && m.__erased)) throw Error('Unavailable scene object m' + i);
      result.push(i);
    }
  }
  const unique = [...new Set(result)];
  if (unique.length > 80) throw Error('A scene edit may target at most 80 marks.');
  return unique;
}
function allySnapshot(ms) { return { marks: ms.map(i => [i, allyCopy(mark(i))]), names: allyCopy(allyNames) }; }
function allyRestore(snap, at) {
  let end = at;
  for (const [i, value] of snap.marks) {
    const old = mark(i), wasVisible = drawn(i), hidden = !!value.__erased;
    if (wasVisible && hidden) end = Math.max(end, erase([i], at, {}));
    Object.keys(old).forEach(k => delete old[k]); Object.assign(old, allyCopy(value));
    if (!hidden) {
      if (wasVisible) end = Math.max(end, repaint([i], REPAINT_PACE, at));
      else end = Math.max(end, paintNew([i], at, 0.8));
    }
  }
  Object.keys(allyNames).forEach(k => delete allyNames[k]); Object.assign(allyNames, allyCopy(snap.names));
  return end;
}
function allyApply(command, P, T, res) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw Error('sceneEdit needs an object.');
  const q = allyCopy(command), signature = JSON.stringify(q), at = T.at || 0;
  res.requestId = q.requestId;
  if (!allySafe(q.boardId) || !allySafe(q.requestId) || !Number.isSafeInteger(q.revision) || q.revision < 0) throw Error('sceneEdit requires boardId, revision and unique requestId.');
  if (allyBoard !== null && q.boardId !== allyBoard) throw Error('Wrong native board. Read current scene state.');
  const receipt = allyReceipts.get(q.requestId);
  if (receipt) {
    if (receipt.signature !== signature) throw Error('Request ID reused with different edit.');
    res.touched = receipt.touched; res.replayed = true; return at;
  }
  if (q.revision !== allyRevision) throw Error('Stale scene revision. Read current scene state.');
  if (allyReceipts.size >= 512) throw Error('Scene receipt limit reached; start a new lesson explicitly.');
  if (q.op === 'bind') {
    if (allyBoard !== null) throw Error('Board already bound.');
    allyBoard = q.boardId;
  } else {
    if (allyBoard === null) throw Error('Bind this native scene before editing.');
    if (q.op === 'undo' || q.op === 'redo') {
      const from = q.op === 'undo' ? allyUndo : allyRedo, to = q.op === 'undo' ? allyRedo : allyUndo;
      if (!from.length) throw Error('Nothing to ' + q.op);
      const entry = from[from.length - 1], expected = q.op === 'undo' ? entry.after : entry.before;
      if (JSON.stringify(allySnapshot(entry.ids.map(id => +id.slice(1)))) !== JSON.stringify(expected)) throw Error('Scene changed outside edit history; read state before a new edit.');
      const end = allyRestore(q.op === 'undo' ? entry.before : entry.after, at);
      from.pop(); to.push(entry); res.touched = entry.ids; allyCommit(q, signature, res); return end;
    }
    const allowed = ['group','move','moveTo','scale','recolor','restyle','update','hide','show','delete'];
    if (!allowed.includes(q.op)) throw Error('Unsupported scene edit ' + q.op);
    const ms = allyResolve(q.ids ?? q.id, q.op === 'show' || q.op === 'delete' || q.op === 'group');
    if (T.index != null && ms.some(i => i >= T.index && i < EDIT_BASE)) throw Error('Cannot edit future marks.');
    if (ms.some(i => !['circle','ellipse','rect','line','arrow','poly','path','text','highlight','dot'].includes(mark(i).do))) throw Error('Editable scene supports native 2D primitives only.');
    const number = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100000;
    if (q.op === 'group' && (!allySafe(q.name) || /^m\d+$/.test(q.name) || Object.hasOwn(allyNames, q.name))) throw Error('Use a new semantic group name.');
    if (q.op === 'group' && Object.keys(allyNames).length >= 32) throw Error('Scene supports at most 32 semantic groups.');
    if (['move','moveTo','scale'].includes(q.op)) {
      const keys = q.op === 'move' ? ['dx','dy'] : q.op === 'moveTo' ? ['x','y'] : ['k'];
      if (keys.some(k => !number(q[k])) || (q.op === 'scale' && (q.k < 0.25 || q.k > 4))) throw Error('Invalid finite transform.');
    }
    if (q.op === 'recolor' && (typeof q.color !== 'string' || q.color.length > 40)) throw Error('Choose a short color.');
    const patch = q.patch;
    if (q.op === 'update') {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) throw Error('Supply a non-empty patch.');
      for (const i of ms) { const m = mark(i); for (const [key, value] of Object.entries(patch)) {
        if (key === 'text') { if (m.do !== 'text' || typeof value !== 'string' || value.length > 1000) throw Error('text requires a text mark and at most 1000 characters.'); }
        else if (key === 'at') { if (!['circle','ellipse','rect','text','highlight','dot'].includes(m.do) || !Array.isArray(value) || value.length !== 2 || !value.every(number)) throw Error('Invalid at geometry.'); }
        else if (key === 'pts') { if (!['line','arrow','poly'].includes(m.do) || !Array.isArray(value) || value.length < 2 || value.length > 256 || !value.every(p => Array.isArray(p) && p.length === 2 && p.every(number))) throw Error('Invalid points geometry.'); }
        else if (['r','rx','ry','w','h'].includes(key)) {
          const valid = { circle:['r'], dot:['r'], ellipse:['rx','ry'], rect:['w','h'], highlight:['w','h'] }[m.do] || [];
          if (!valid.includes(key) || !number(value) || value <= 0) throw Error('Invalid shape dimension.');
        } else throw Error('Unsupported geometry field ' + key);
      } }
    }
    if (q.op === 'restyle') {
      if (!q.style || typeof q.style !== 'object' || Array.isArray(q.style)) throw Error('Supply style.');
      for (const [k, v] of Object.entries(q.style)) {
        if (['width','size'].includes(k)) { if (!number(v) || v <= 0 || v > 72) throw Error('Invalid style size.'); }
        else if (['color','fill','line','font','style','brush'].includes(k)) { if (typeof v !== 'string' || v.length > 40) throw Error('Invalid style string.'); }
        else if (k === 'dash') { if (v !== false && v !== true && !(typeof v === 'string' && v.length <= 40)) throw Error('Invalid dash.'); }
        else throw Error('Unsupported style field ' + k);
      }
    }
    const before = allySnapshot(ms); let end = at;
    if (q.op === 'group') allyNames[q.name] = ms;
    else if (['move','moveTo','scale','recolor','restyle'].includes(q.op)) {
      const originalHist = hist.length;
      end = core(Object.assign({}, q.op === 'restyle' ? q.style : q, { op:q.op, id:ms.map(i => 'm'+i), each:false }), P, null, T, res);
      hist.length = originalHist;
    } else if (q.op === 'hide' || q.op === 'delete') {
      end = erase(ms, at, { pace:T.pace }); if (q.op === 'delete') ms.forEach(i => mark(i).__allyDeleted = true);
    } else if (q.op === 'show') end = unerase(ms, at);
    else if (q.op === 'update') { ms.forEach(i => Object.assign(mark(i), allyCopy(patch))); end = repaint(ms, REPAINT_PACE, at); }
    allyUndo.push({ before, after:allySnapshot(ms), ids:ms.map(i => 'm'+i) }); if (allyUndo.length > 64) allyUndo.shift(); allyRedo.length = 0;
    res.touched = ms.map(i => 'm'+i); allyCommit(q, signature, res); return end;
  }
  res.touched = []; allyCommit(q, signature, res); return at;
}
function allyCommit(q, signature, res) {
  allyRevision++; allyReceipts.set(q.requestId, { signature, revision:allyRevision, touched:res.touched || [] });
}
