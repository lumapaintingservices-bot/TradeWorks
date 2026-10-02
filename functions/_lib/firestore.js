// Minimal Firestore REST client (service-account authenticated). Only what the functions need.
import { getServiceAccountToken, parseServiceAccount } from "./jwt.js";

/** JS value -> Firestore REST value. Dates become timestamps; integers integerValue; other numbers doubleValue. */
export function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFsFields(v) } };
  throw new Error("Unsupported Firestore value: " + typeof v);
}
export const toFsFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFsValue(v)]));

export function fromFsValue(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFsValue);
  if ("mapValue" in v) return fromFsFields(v.mapValue.fields || {});
  return null;
}
export const fromFsFields = (fields) => Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, fromFsValue(v)]));

/** Firestore project id: env FIREBASE_PROJECT_ID, else the service account's own project_id. */
export function projectIdOf(env) {
  if (env.FIREBASE_PROJECT_ID) return env.FIREBASE_PROJECT_ID;
  const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  if (!sa.project_id) throw new Error("Set FIREBASE_PROJECT_ID");
  return sa.project_id;
}

const segs = (path) => path.split("/").map(encodeURIComponent).join("/");

/** A field path for updateMask: dotted segments, each one quoted with backticks unless it is a plain name (ids like "co-1"). */
export const maskPath = (dotted) => dotted.split(".").map((k) => (/^[A-Za-z_][A-Za-z_0-9]*$/.test(k) ? k : "`" + k.replace(/[`\\]/g, (c) => "\\" + c) + "`")).join(".");
/** { "client.sign": v, "audit": w } -> nested object { client: { sign: v }, audit: w } (for the request body). */
export function nestPaths(fields) {
  const out = {};
  for (const [path, v] of Object.entries(fields)) {
    const ks = path.split("."); let o = out;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] && typeof o[ks[i]] === "object" ? o[ks[i]] : {};
    o[ks[ks.length - 1]] = v;
  }
  return out;
}

/** A tiny client bound to one env. `fetchImpl` can be injected in tests. */
export function firestore(env, { fetchImpl = fetch, now = () => Date.now() } = {}) {
  const projectId = projectIdOf(env);
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  const auth = async () => ({ Authorization: "Bearer " + (await getServiceAccountToken(env.FIREBASE_SERVICE_ACCOUNT, { fetchImpl, now: now() })), "Content-Type": "application/json" });

  return {
    projectId,
    /** -> { id, data, updateTime } or null when the document does not exist */
    async get(path) {
      const res = await fetchImpl(`${base}/${segs(path)}`, { headers: await auth() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Firestore get ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      const doc = await res.json();
      return { id: doc.name.split("/").pop(), data: fromFsFields(doc.fields), updateTime: doc.updateTime };
    },
    /**
     * Sets nested fields by dotted path ({ "client.sign": {...} }) and leaves the rest of the document alone. With updateTime
     * the write only happens if nobody changed the document since it was read: -> false when it changed (read it again).
     */
    async update(path, fields, { updateTime } = {}) {
      const mask = Object.keys(fields).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(maskPath(k))).join("&");
      const pre = updateTime ? "currentDocument.updateTime=" + encodeURIComponent(updateTime) : "currentDocument.exists=true";
      const res = await fetchImpl(`${base}/${segs(path)}?${mask}&${pre}`, { method: "PATCH", headers: await auth(), body: JSON.stringify({ fields: toFsFields(nestPaths(fields)) }) });
      if (res.ok) return true;
      const txt = await res.text();
      if (updateTime && (res.status === 400 || res.status === 409 || res.status === 412) && /FAILED_PRECONDITION|ABORTED|precondition/i.test(txt)) return false;
      throw new Error(`Firestore update ${path}: ${res.status} ${txt.slice(0, 200)}`);
    },
    /** Updates ONLY the given fields (updateMask); fails if the document does not exist. */
    async patch(path, data) {
      const mask = Object.keys(data).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
      const res = await fetchImpl(`${base}/${segs(path)}?${mask}&currentDocument.exists=true`, {
        method: "PATCH", headers: await auth(), body: JSON.stringify({ fields: toFsFields(data) }),
      });
      if (!res.ok) throw new Error(`Firestore patch ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    },
    /** Deletes a document (no error when it is not there). */
    async remove(path) {
      const res = await fetchImpl(`${base}/${segs(path)}`, { method: "DELETE", headers: await auth() });
      if (!res.ok && res.status !== 404) throw new Error(`Firestore delete ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    },
    /** Every document of a collection path (e.g. "companies" or "companies/x/invoices") -> [{ id, data }], all pages. */
    async list(path, { pageSize = 300, max = 20000 } = {}) {
      const out = [];
      let token = "";
      do {
        const q = `pageSize=${pageSize}` + (token ? `&pageToken=${encodeURIComponent(token)}` : "");
        const res = await fetchImpl(`${base}/${segs(path)}?${q}`, { headers: await auth() });
        if (!res.ok) throw new Error(`Firestore list ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
        const j = await res.json();
        for (const d of j.documents || []) out.push({ id: d.name.split("/").pop(), data: fromFsFields(d.fields) });
        token = j.nextPageToken || "";
      } while (token && out.length < max);
      return out;
    },
    /** Creates path with data ONLY if it does not exist yet. -> true when created, false when it was already there. */
    async create(path, data) {
      const res = await fetchImpl(`${base}/${segs(path)}?currentDocument.exists=false`, {
        method: "PATCH", headers: await auth(), body: JSON.stringify({ fields: toFsFields(data) }),
      });
      if (res.ok) return true;
      const txt = await res.text();
      if (res.status === 409 || /FAILED_PRECONDITION|ALREADY_EXISTS/.test(txt)) return false;
      throw new Error(`Firestore create ${path}: ${res.status} ${txt.slice(0, 200)}`);
    },
    /** Writes (creates or replaces) the given fields; missing documents are created. */
    async set(path, data) {
      const mask = Object.keys(data).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
      const res = await fetchImpl(`${base}/${segs(path)}?${mask}`, { method: "PATCH", headers: await auth(), body: JSON.stringify({ fields: toFsFields(data) }) });
      if (!res.ok) throw new Error(`Firestore set ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    },
    /** Documents of a (sub)collection path where `field == value`, e.g. ("companies/x/invoices", "estId", "e1") -> [{ id, data }]. */
    async where(path, field, value, { limit = 500 } = {}) {
      const parts = path.split("/"), collectionId = parts.pop(), parent = parts.length ? `${base}/${segs(parts.join("/"))}` : base;
      const res = await fetchImpl(`${parent}:runQuery`, {
        method: "POST", headers: await auth(),
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId }],
          where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: toFsValue(value) } },
          limit,
        } }),
      });
      if (!res.ok) throw new Error(`Firestore query ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      const rows = await res.json();
      return rows.filter((r) => r.document).map((r) => ({ id: r.document.name.split("/").pop(), data: fromFsFields(r.document.fields) }));
    },
    /** First document of `collection` where `field == value` -> { id, data } or null. */
    async findOne(collection, field, value) {
      const res = await fetchImpl(`${base}:runQuery`, {
        method: "POST", headers: await auth(),
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: collection }],
          where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: toFsValue(value) } },
          limit: 1,
        } }),
      });
      if (!res.ok) throw new Error(`Firestore query ${collection}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      const rows = await res.json();
      const hit = rows.find((r) => r.document);
      return hit ? { id: hit.document.name.split("/").pop(), data: fromFsFields(hit.document.fields) } : null;
    },
  };
}
