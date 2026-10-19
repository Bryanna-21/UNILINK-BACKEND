"use strict";
// A tiny in-memory stand-in for the Mongoose models, supporting just what the enforcement service
// uses. Not a test file itself (no .test.js), so `node --test tests/*.test.js` does not run it.

const oid = (n) => String(n).padStart(24, "0");
const clone = (d) => (d === null || d === undefined ? d : structuredClone(d));

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] === undefined || o[keys[i]] === null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function matches(doc, filter) {
  if (filter.$or) return filter.$or.some((f) => matches(doc, f));
  return Object.entries(filter).every(([k, cond]) => {
    if (k === "$or") return true;
    const v = getPath(doc, k);
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === "$in") return arg.some((a) => (a === null ? v === null || v === undefined : String(v) === String(a)));
        if (op === "$nin") return !arg.some((a) => String(v) === String(a));
        if (op === "$ne") return arg === null ? !(v === null || v === undefined) : String(v) !== String(arg);
        if (op === "$lte") return v !== null && v !== undefined && new Date(v) <= new Date(arg);
        if (op === "$lt") return v !== null && v !== undefined && new Date(v) < new Date(arg);
        if (op === "$gte") return v !== null && v !== undefined && new Date(v) >= new Date(arg);
        throw new Error(`fakeDb: operator ${op} not supported`);
      });
    }
    if (cond === null) return v === null || v === undefined;
    return String(v) === String(cond);
  });
}

class Coll {
  constructor(docs = [], { unique = [] } = {}) {
    this.docs = docs.map((d) => ({ ...clone(d) }));
    this.unique = unique;
    this.seq = 900000;
  }
  _chain(list) {
    let out = list;
    const q = {
      select: () => q,
      sort: (spec) => { const [[k, dir]] = Object.entries(spec); out = [...out].sort((a, b) => (new Date(a[k]) - new Date(b[k])) * dir); return q; },
      skip: (n) => { out = out.slice(n); return q; },
      limit: (n) => { out = out.slice(0, n); return q; },
      lean: async () => out.map(clone),
    };
    return q;
  }
  findById(id) { const d = this.docs.find((x) => String(x._id) === String(id)); const q = this._chain(d ? [d] : []); return { select: () => ({ lean: async () => clone(d) || null }), lean: async () => clone(d) || null }; }
  findOne(filter) { const d = this.docs.find((x) => matches(x, filter)); return { select: () => ({ lean: async () => clone(d) || null }), lean: async () => clone(d) || null }; }
  find(filter) { return this._chain(this.docs.filter((x) => matches(x, filter))); }
  async countDocuments(filter) { return this.docs.filter((x) => matches(x, filter)).length; }
  async create(doc) {
    for (const key of this.unique) {
      if (this.docs.some((d) => String(d[key]) === String(doc[key]))) { const e = new Error("duplicate key"); e.code = 11000; throw e; }
    }
    const saved = { _id: doc._id || oid(++this.seq), ...clone(doc) };
    this.docs.push(saved);
    return clone(saved);
  }
  async updateOne(filter, update) {
    const d = this.docs.find((x) => matches(x, filter));
    if (!d) return { modifiedCount: 0 };
    for (const [k, v] of Object.entries(update.$set || {})) setPath(d, k, clone(v));
    for (const [k, v] of Object.entries(update.$push || {})) {
      const arr = getPath(d, k) || [];
      arr.push(clone(v));
      setPath(d, k, arr);
    }
    return { modifiedCount: 1 };
  }
  get(id) { return this.docs.find((x) => String(x._id) === String(id)); }
}

module.exports = { Coll, oid, matches };
