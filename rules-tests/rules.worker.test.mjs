// Phase 7 M: the EXACT queries src/data/hooks.ts issues for a worker (see subscriptionPlan) must be allowed; whole-collection reads denied.
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { setLogLevel, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, serverTimestamp, Timestamp } from "firebase/firestore";
setLogLevel("silent"); // permission-denied is what these tests expect: keep the output readable

const env = await initializeTestEnvironment({ projectId: "demo-tw", firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } });
await env.clearFirestore();
let pass = 0, fail = 0;
const ok = async (name, p) => { try { await assertSucceeds(p()); pass++; } catch (e) { fail++; console.log("FAIL (should succeed):", name, String(e.message).slice(0, 200)); } };
const no = async (name, p) => { try { await assertFails(p()); pass++; } catch (e) { fail++; console.log("FAIL (should be denied):", name); } };
const ts = Timestamp.fromDate(new Date("2026-05-01T10:00:00Z"));
await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, "companies/c1"), { name: "A", ownerUid: "own", createdAt: 1 });
  await setDoc(doc(d, "companies/c1/members/own"), { role: "owner" });
  await setDoc(doc(d, "companies/c1/members/wrk"), { role: "worker", workerId: "w1" });
  await setDoc(doc(d, "companies/c1/members/wnolink"), { role: "worker" });
  await setDoc(doc(d, "companies/c1/workers/w1"), { name: "W1", rate: 20, companyId: "c1", createdAt: ts, updatedAt: ts });
  await setDoc(doc(d, "companies/c1/workers/w2"), { name: "W2", rate: 25 });
  // realistic task records (what saveRec writes)
  await setDoc(doc(d, "companies/c1/tasks/t1"), { title: "Prep", date: "2026-05-04", time: "", note: "", estId: "", workerId: "w1", done: false, companyId: "c1", createdAt: ts, updatedAt: ts });
  await setDoc(doc(d, "companies/c1/tasks/t2"), { title: "Other", date: "2026-05-04", workerId: "w2", done: false, companyId: "c1", createdAt: ts, updatedAt: ts });
  await setDoc(doc(d, "companies/c1/hours/h1"), { workerId: "w1", hours: 3, companyId: "c1" });
  await setDoc(doc(d, "companies/c1/hours/h2"), { workerId: "w2", hours: 4, companyId: "c1" });
  for (const col of ["estimates", "invoices", "clients", "expenses", "payouts"]) await setDoc(doc(d, `companies/c1/${col}/x1`), { a: 1 });
  await setDoc(doc(d, "companies/c1/settings/main"), { x: 1 });
});
const as = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const wrk = as("wrk", "w@x.com"), wnl = as("wnolink", "n@x.com");
const C = "companies/c1", C1 = collection;

// --- reads issued by useCollection for a linked worker (workerId w1)
await ok("company doc", () => getDoc(doc(wrk, C)));
await ok("tasks where workerId == w1", () => getDocs(query(C1(wrk, C + "/tasks"), where("workerId", "==", "w1"))));
await ok("hours where workerId == w1", () => getDocs(query(C1(wrk, C + "/hours"), where("workerId", "==", "w1"))));
await ok("clock/w1 (missing doc)", () => getDoc(doc(wrk, C + "/clock/w1")));
await ok("workers/w1", () => getDoc(doc(wrk, C + "/workers/w1")));
// --- everything else / whole collections are denied
for (const col of ["tasks", "hours", "clock", "workers", "estimates", "invoices", "clients", "expenses", "payouts", "settings"]) await no(`whole ${col}`, () => getDocs(C1(wrk, C + "/" + col)));
await no("tasks where workerId == w2", () => getDocs(query(C1(wrk, C + "/tasks"), where("workerId", "==", "w2"))));
await no("hours where workerId == w2", () => getDocs(query(C1(wrk, C + "/hours"), where("workerId", "==", "w2"))));
await no("clock/w2", () => getDoc(doc(wrk, C + "/clock/w2")));
await no("workers/w2", () => getDoc(doc(wrk, C + "/workers/w2")));
for (const [col, id] of [["estimates", "x1"], ["invoices", "x1"], ["clients", "x1"], ["settings", "main"], ["payouts", "x1"], ["expenses", "x1"]]) await no(`get ${col}/${id}`, () => getDoc(doc(wrk, `${C}/${col}/${id}`)));
// unlinked worker: nothing (the hook does not even ask)
for (const [col, f] of [["tasks", 1], ["hours", 1]]) await no(`unlinked ${col} query`, () => getDocs(query(C1(wnl, C + "/" + col), where("workerId", "==", ""))));
await no("unlinked clock get", () => getDoc(doc(wnl, C + "/clock/w1")));

// --- writes issued by WorkerTeam / WorkerCalendar
const at = "2026-05-04T13:00:00.000Z";
await ok("clock in (saveRec shape)", () => setDoc(doc(wrk, C + "/clock/w1"), { at, estId: "", companyId: "c1", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
await ok("clock out: hours entry with rate (saveRec shape)", () => setDoc(doc(wrk, C + "/hours/h-clk-w1-1"), { workerId: "w1", date: "2026-05-04", hours: 2, estId: "", note: "n", rate: 20, companyId: "c1", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
await ok("clock out: hours entry WITHOUT rate", () => setDoc(doc(wrk, C + "/hours/h-clk-w1-2"), { workerId: "w1", date: "2026-05-04", hours: 2, estId: "", note: "n", companyId: "c1", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
await ok("clock out: same entry written twice (2nd device)", () => setDoc(doc(wrk, C + "/hours/h-clk-w1-1"), { workerId: "w1", date: "2026-05-04", hours: 2, estId: "", note: "n", rate: 20, companyId: "c1", createdAt: ts, updatedAt: serverTimestamp() }));
await ok("clock out: delete clock", () => deleteDoc(doc(wrk, C + "/clock/w1")));
await ok("delete own hours", () => deleteDoc(doc(wrk, C + "/hours/h-clk-w1-2")));
await no("delete other's hours", () => deleteDoc(doc(wrk, C + "/hours/h2")));
await no("hours for another worker", () => setDoc(doc(wrk, C + "/hours/hx"), { workerId: "w2", hours: 1 }));
// tick done: patchRec = updateDoc({done, updatedAt})
await ok("tick task done (patchRec)", () => updateDoc(doc(wrk, C + "/tasks/t1"), { done: true, updatedAt: serverTimestamp() }));
await ok("untick task (patchRec)", () => updateDoc(doc(wrk, C + "/tasks/t1"), { done: false, updatedAt: serverTimestamp() }));
await ok("tick via full setDoc (saveRec shape, unchanged fields)", () => setDoc(doc(wrk, C + "/tasks/t1"), { title: "Prep", date: "2026-05-04", time: "", note: "", estId: "", workerId: "w1", done: true, companyId: "c1", createdAt: ts, updatedAt: serverTimestamp() }));
await no("tick other's task", () => updateDoc(doc(wrk, C + "/tasks/t2"), { done: true, updatedAt: serverTimestamp() }));
await no("edit task title", () => updateDoc(doc(wrk, C + "/tasks/t1"), { title: "x", updatedAt: serverTimestamp() }));
await no("reassign my task", () => updateDoc(doc(wrk, C + "/tasks/t1"), { workerId: "w2", updatedAt: serverTimestamp() }));
await no("delete task", () => deleteDoc(doc(wrk, C + "/tasks/t1")));
await no("clock in for someone else", () => setDoc(doc(wrk, C + "/clock/w2"), { at }));
await no("edit own worker rate", () => updateDoc(doc(wrk, C + "/workers/w1"), { rate: 99 }));

console.log(`worker rules tests: ${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
