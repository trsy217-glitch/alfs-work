// 테스트용 Firestore 흉내 (firebase-admin 에서 쓰는 만큼만)
let seq = 0
const nid = () => `id${++seq}`
const clone = (v) => JSON.parse(JSON.stringify(v))
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o)
function applyUpdate(doc, patch) {
  for (const [k, v] of Object.entries(patch)) {
    const parts = k.split('.'); let o = doc
    for (const p of parts.slice(0, -1)) o = (o[p] ??= {})
    const last = parts.at(-1)
    if (v && typeof v === 'object' && '__inc' in v) o[last] = (o[last] || 0) + v.__inc
    else o[last] = v === undefined ? o[last] : clone(v)
  }
}
export function fakeDb(seed = {}) {
  const store = new Map() // path -> data
  for (const [col, docs] of Object.entries(seed)) for (const [id, d] of Object.entries(docs)) store.set(`${col}/${id}`, clone(d))
  const snap = (path) => { const v = store.has(path) ? clone(store.get(path)) : undefined; return { id: path.split('/').at(-1), exists: v !== undefined, data: () => (v === undefined ? undefined : clone(v)), ref: docRef(path) } }
  function docRef(path) {
    return {
      id: path.split('/').at(-1), path,
      get: async () => snap(path),
      set: async (d, o) => { store.set(path, o?.merge && store.has(path) ? { ...store.get(path), ...clone(d) } : clone(d)) },
      update: async (p) => { if (!store.has(path)) throw new Error(`no doc ${path}`); const d = store.get(path); applyUpdate(d, p) },
      delete: async () => { store.delete(path) },
      collection: (c) => colRef(`${path}/${c}`),
    }
  }
  function query(col, filters = [], order = null, lim = null) {
    const q = {
      where: (f, op, v) => query(col, [...filters, [f, op, v]], order, lim),
      orderBy: (f, dir = 'asc') => query(col, filters, [f, dir], lim),
      limit: (n) => query(col, filters, order, n),
      get: async () => {
        const depth = col.split('/').length + 1
        let docs = [...store.keys()].filter((k) => k.startsWith(`${col}/`) && k.split('/').length === depth).map(snap)
        for (const [f, op, v] of filters) docs = docs.filter((s) => { const x = getPath(s.data(), f); if (x === undefined) return false; return op === '==' ? x === v : op === '>' ? x > v : op === '>=' ? x >= v : op === '<' ? x < v : op === '<=' ? x <= v : false })
        if (order) docs.sort((a, b) => { const x = getPath(a.data(), order[0]) ?? '', y = getPath(b.data(), order[0]) ?? ''; return (x < y ? -1 : x > y ? 1 : 0) * (order[1] === 'desc' ? -1 : 1) })
        if (lim) docs = docs.slice(0, lim)
        return { docs, empty: !docs.length, size: docs.length }
      },
    }
    return q
  }
  function colRef(col) { return { ...query(col), doc: (id) => docRef(`${col}/${id || nid()}`), add: async (d) => { const r = docRef(`${col}/${nid()}`); await r.set(d); return r } } }
  return {
    store,
    collection: colRef,
    batch: () => { const ops = []; return { set: (r, d) => ops.push(() => r.set(d)), update: (r, d) => ops.push(() => r.update(d)), commit: async () => { for (const o of ops) await o() } } },
    all: (col) => [...store.entries()].filter(([k]) => k.startsWith(`${col}/`) && k.split('/').length === col.split('/').length + 1).map(([k, v]) => ({ id: k.split('/').at(-1), ...v })),
  }
}
