import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { setLogLevel, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, writeBatch, serverTimestamp, arrayUnion } from "firebase/firestore";
setLogLevel("silent"); // permission-denied is what these tests expect: keep the output readable

const env = await initializeTestEnvironment({ projectId: "demo-tw", firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } });
await env.clearFirestore();
let pass = 0, fail = 0;
const ok = async (name, p) => { try { await assertSucceeds(p()); pass++; } catch (e) { fail++; console.log("FAIL (should succeed):", name, String(e.message).slice(0, 160)); } };
const no = async (name, p) => { try { await assertFails(p()); pass++; } catch (e) { fail++; console.log("FAIL (should be denied):", name); } };

await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, "companies/c1"), { name: "A", ownerUid: "own", createdAt: 1 });
  await setDoc(doc(d, "companies/c1/members/own"), { role: "owner", name: "O", email: "o@x.com" });
  await setDoc(doc(d, "companies/c1/members/own2"), { role: "owner", name: "O2", email: "o2@x.com" });
  await setDoc(doc(d, "companies/c1/members/adm"), { role: "admin" });
  await setDoc(doc(d, "companies/c1/members/wrk"), { role: "worker", workerId: "w1" });
  await setDoc(doc(d, "companies/c1/members/wrk2"), { role: "worker", workerId: "w2" });
  await setDoc(doc(d, "companies/c1/members/wnolink"), { role: "worker" });
  await setDoc(doc(d, "companies/c1/workers/w1"), { name: "W1", rate: 20 });
  await setDoc(doc(d, "companies/c1/workers/w2"), { name: "W2", rate: 25 });
  await setDoc(doc(d, "companies/c1/tasks/t1"), { title: "a", workerId: "w1", done: false });
  await setDoc(doc(d, "companies/c1/tasks/t2"), { title: "b", workerId: "w2", done: false });
  await setDoc(doc(d, "companies/c1/tasks/t3"), { title: "c", done: false });
  await setDoc(doc(d, "companies/c1/hours/h1"), { workerId: "w1", hours: 3 });
  await setDoc(doc(d, "companies/c1/hours/h2"), { workerId: "w2", hours: 4 });
  await setDoc(doc(d, "companies/c1/clock/w1"), { at: "x" });
  await setDoc(doc(d, "companies/c1/clock/w2"), { at: "y" });
  await setDoc(doc(d, "companies/c1/estimates/e1"), { number: "EST-1" });
  await setDoc(doc(d, "companies/c1/settings/main"), { x: 1 });
  await setDoc(doc(d, "companies/c2"), { name: "B", ownerUid: "own2b", createdAt: 1 });
  await setDoc(doc(d, "companies/c2/members/own2b"), { role: "owner" });
  await setDoc(doc(d, "companies/c2/members/adm2"), { role: "admin" });
  await setDoc(doc(d, "invites/ana@x.com"), { companyId: "c1", companyName: "A", role: "worker", workerId: "w1", invitedBy: "own" });
  await setDoc(doc(d, "invites/boss@x.com"), { companyId: "c1", companyName: "A", role: "admin", invitedBy: "own" });
  await setDoc(doc(d, "invites/zed@x.com"), { companyId: "c2", companyName: "B", role: "worker", invitedBy: "own2b" });
});
const as = (uid, email, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const own = as("own", "o@x.com"), own2 = as("own2", "o2@x.com"), adm = as("adm", "adm@x.com"), wrk = as("wrk", "w@x.com"), wrk2 = as("wrk2", "w2@x.com"), wnl = as("wnolink", "wn@x.com");
const C = "companies/c1";

// ---- worker: reads
await ok("worker reads company", () => getDoc(doc(wrk, C)));
await no("worker reads estimate", () => getDoc(doc(wrk, C + "/estimates/e1")));
await no("worker lists estimates", () => getDocs(collection(wrk, C + "/estimates")));
await no("worker reads settings", () => getDoc(doc(wrk, C + "/settings/main")));
await ok("worker own tasks query", () => getDocs(query(collection(wrk, C + "/tasks"), where("workerId", "==", "w1"))));
await no("worker other's tasks query", () => getDocs(query(collection(wrk, C + "/tasks"), where("workerId", "==", "w2"))));
await no("worker unfiltered tasks", () => getDocs(collection(wrk, C + "/tasks")));
await ok("worker own task get", () => getDoc(doc(wrk, C + "/tasks/t1")));
await no("worker other task get", () => getDoc(doc(wrk, C + "/tasks/t2")));
await no("worker unassigned task get", () => getDoc(doc(wrk, C + "/tasks/t3")));
await ok("worker own hours query", () => getDocs(query(collection(wrk, C + "/hours"), where("workerId", "==", "w1"))));
await no("worker unfiltered hours", () => getDocs(collection(wrk, C + "/hours")));
await ok("worker own clock", () => getDoc(doc(wrk, C + "/clock/w1")));
await no("worker other clock", () => getDoc(doc(wrk, C + "/clock/w2")));
await ok("worker own worker rec", () => getDoc(doc(wrk, C + "/workers/w1")));
await no("worker other worker rec", () => getDoc(doc(wrk, C + "/workers/w2")));
await no("worker lists members", () => getDocs(collection(wrk, C + "/members")));
await ok("worker own member doc", () => getDoc(doc(wrk, C + "/members/wrk")));
await no("worker other member doc", () => getDoc(doc(wrk, C + "/members/own")));
await no("unlinked worker own tasks", () => getDocs(query(collection(wnl, C + "/tasks"), where("workerId", "==", ""))));
await no("outsider reads company", () => getDoc(doc(as("nobody", "n@x.com"), C)));
await no("signed-out reads company", () => getDoc(doc(env.unauthenticatedContext().firestore(), C)));
// ---- worker: writes
await ok("worker adds own hours", () => setDoc(doc(wrk, C + "/hours/h9"), { workerId: "w1", hours: 2 }));
await no("worker adds hours for other", () => setDoc(doc(wrk, C + "/hours/h8"), { workerId: "w2", hours: 2 }));
await ok("worker edits own hours", () => updateDoc(doc(wrk, C + "/hours/h1"), { hours: 5 }));
await no("worker moves hours to other worker", () => updateDoc(doc(wrk, C + "/hours/h1"), { workerId: "w2" }));
await no("worker edits other's hours", () => updateDoc(doc(wrk, C + "/hours/h2"), { hours: 1 }));
await ok("worker deletes own hours", () => deleteDoc(doc(wrk, C + "/hours/h9")));
await no("worker deletes other's hours", () => deleteDoc(doc(wrk, C + "/hours/h2")));
await ok("worker clock in", () => setDoc(doc(wrk, C + "/clock/w1"), { at: "z" }));
await no("worker clock other", () => setDoc(doc(wrk, C + "/clock/w2"), { at: "z" }));
await ok("worker clock out", () => deleteDoc(doc(wrk, C + "/clock/w1")));
await ok("worker ticks task done", () => updateDoc(doc(wrk, C + "/tasks/t1"), { done: true, updatedAt: serverTimestamp() }));
await no("worker edits task title", () => updateDoc(doc(wrk, C + "/tasks/t1"), { title: "hack" }));
await no("worker ticks other's task", () => updateDoc(doc(wrk, C + "/tasks/t2"), { done: true }));
await no("worker creates task", () => setDoc(doc(wrk, C + "/tasks/t9"), { title: "x", workerId: "w1" }));
await no("worker deletes task", () => deleteDoc(doc(wrk, C + "/tasks/t1")));
await no("worker creates expense", () => setDoc(doc(wrk, C + "/expenses/x1"), { amount: 1 }));
await no("worker edits worker rate", () => updateDoc(doc(wrk, C + "/workers/w1"), { rate: 99 }));
await no("worker edits company", () => updateDoc(doc(wrk, C), { name: "hack" }));
await no("worker self-promotes", () => updateDoc(doc(wrk, C + "/members/wrk"), { role: "owner" }));
await no("worker self-relinks", () => updateDoc(doc(wrk, C + "/members/wrk"), { workerId: "w2" }));
await no("worker writes members via generic", () => setDoc(doc(wrk, C + "/members/wrk"), { role: "owner" }));
await no("worker writes public", () => setDoc(doc(wrk, "public/c1"), { name: "x" }));
await no("worker creates invite", () => setDoc(doc(wrk, "invites/q@x.com"), { companyId: "c1", companyName: "A", role: "worker", invitedBy: "wrk" }));

// ---- admin
await ok("admin reads estimates", () => getDocs(collection(adm, C + "/estimates")));
await ok("admin writes estimate", () => setDoc(doc(adm, C + "/estimates/e2"), { number: "EST-2" }));
await ok("admin writes tasks", () => setDoc(doc(adm, C + "/tasks/t7"), { title: "x" }));
await ok("admin lists members", () => getDocs(collection(adm, C + "/members")));
await ok("admin updates company", () => updateDoc(doc(adm, C), { name: "A2" }));
await no("admin changes ownerUid", () => updateDoc(doc(adm, C), { ownerUid: "adm" }));
await no("admin deletes company", () => deleteDoc(doc(adm, C)));
await no("admin changes createdAt", () => updateDoc(doc(adm, C), { createdAt: 2 }));
await no("admin promotes worker", () => updateDoc(doc(adm, C + "/members/wrk"), { role: "admin" }));
await ok("admin relinks worker", () => updateDoc(doc(adm, C + "/members/wrk2"), { workerId: "w2" }));
await no("admin demotes owner", () => updateDoc(doc(adm, C + "/members/own2"), { role: "worker" }));
await no("admin promotes self", () => updateDoc(doc(adm, C + "/members/adm"), { role: "owner" }));
await no("admin deletes owner", () => deleteDoc(doc(adm, C + "/members/own2")));
await no("admin adds member directly", () => setDoc(doc(adm, C + "/members/newbie"), { role: "worker" }));
await no("admin writes members via generic", () => setDoc(doc(adm, C + "/members/wnolink"), { role: "admin" }));
await ok("admin invites worker", () => setDoc(doc(adm, "invites/new@x.com"), { companyId: "c1", companyName: "A", role: "worker", invitedBy: "adm" }));
await no("admin invites admin", () => setDoc(doc(adm, "invites/new2@x.com"), { companyId: "c1", companyName: "A", role: "admin", invitedBy: "adm" }));
await no("admin invites as someone else", () => setDoc(doc(adm, "invites/new3@x.com"), { companyId: "c1", companyName: "A", role: "worker", invitedBy: "own" }));
await no("admin invites uppercase id", () => setDoc(doc(adm, "invites/New4@x.com"), { companyId: "c1", companyName: "A", role: "worker", invitedBy: "adm" }));
await no("admin invite extra field", () => setDoc(doc(adm, "invites/new5@x.com"), { companyId: "c1", companyName: "A", role: "worker", invitedBy: "adm", evil: 1 }));
await ok("admin lists company invites", () => getDocs(query(collection(adm, "invites"), where("companyId", "==", "c1"))));
await no("admin lists other company invites", () => getDocs(query(collection(adm, "invites"), where("companyId", "==", "c2"))));
await no("admin overwrites admin invite", () => setDoc(doc(adm, "invites/boss@x.com"), { companyId: "c1", companyName: "A", role: "worker", invitedBy: "adm" }));
await no("admin revokes admin invite", () => deleteDoc(doc(adm, "invites/boss@x.com")));
await ok("admin revokes worker invite", () => deleteDoc(doc(adm, "invites/new@x.com")));
await no("other-company admin overwrites invite", () => setDoc(doc(as("adm2", "a2@x.com"), "invites/ana@x.com"), { companyId: "c2", companyName: "B", role: "worker", invitedBy: "adm2" }));
await no("other-company admin deletes invite", () => deleteDoc(doc(as("adm2", "a2@x.com"), "invites/ana@x.com")));
await no("other-company admin reads company", () => getDoc(doc(as("adm2", "a2@x.com"), C)));
await no("other-company admin reads estimates", () => getDocs(collection(as("adm2", "a2@x.com"), C + "/estimates")));

// ---- owner (making owners / admins and inviting them: only the TradeWorks platform admin)
await no("owner who is not a platform admin promotes worker", () => updateDoc(doc(own, C + "/members/wnolink"), { role: "admin" }));
await no("owner who is not a platform admin invites an admin", () => setDoc(doc(own2, "invites/nope@x.com"), { companyId: "c1", companyName: "A", role: "admin", invitedBy: "own2" }));
await ok("owner who is not a platform admin invites a worker", () => setDoc(doc(own2, "invites/wk2@x.com"), { companyId: "c1", companyName: "A", role: "worker", invitedBy: "own2" }));
await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "admins/own"), { note: "test" }); });
await ok("platform admin (owner) promotes worker", () => updateDoc(doc(own, C + "/members/wnolink"), { role: "admin" }));
await ok("owner demotes admin", () => updateDoc(doc(own, C + "/members/wnolink"), { role: "worker" }));
await no("owner sets bogus role", () => updateDoc(doc(own, C + "/members/wnolink"), { role: "god" }));
await no("owner edits member email", () => updateDoc(doc(own, C + "/members/wnolink"), { email: "x@x.com" }));
await ok("2nd owner demotes self", () => updateDoc(doc(own2, C + "/members/own2"), { role: "admin" }));
await no("2nd owner cannot promote themselves back", () => updateDoc(doc(own2, C + "/members/own2"), { role: "owner" }));
await ok("platform admin re-promotes 2nd", () => updateDoc(doc(own, C + "/members/own2"), { role: "owner" }));
await no("2nd owner demotes creator", () => updateDoc(doc(own2, C + "/members/own"), { role: "admin" }));
await no("2nd owner deletes creator", () => deleteDoc(doc(own2, C + "/members/own")));
await no("creator cannot leave", () => deleteDoc(doc(own, C + "/members/own")));
await ok("owner removes admin", () => deleteDoc(doc(own, C + "/members/adm")));
await setDoc(doc(env.authenticatedContext("x").firestore(), "x/y"), { a: 1 }).catch(() => {}); // noop
await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), C + "/members/adm"), { role: "admin" }); });
await ok("platform admin (owner) invites admin", () => setDoc(doc(own, "invites/newadm@x.com"), { companyId: "c1", companyName: "A", role: "admin", invitedBy: "own", invitedByName: "O", createdAt: serverTimestamp() }));
await ok("platform admin (owner) invites owner", () => setDoc(doc(own, "invites/newown@x.com"), { companyId: "c1", companyName: "A", role: "owner", invitedBy: "own" }));
await ok("owner overwrites invite", () => setDoc(doc(own, "invites/boss@x.com"), { companyId: "c1", companyName: "A", role: "worker", invitedBy: "own" }));
await no("owner invites into other company", () => setDoc(doc(own, "invites/q2@x.com"), { companyId: "c2", companyName: "B", role: "worker", invitedBy: "own" }));
await ok("member leaves (worker)", () => deleteDoc(doc(wrk2, C + "/members/wrk2")));
await ok("owner deletes... company denied for non-creator", () => assertFails(deleteDoc(doc(own2, C))));
await ok("creator owner deletes company", () => deleteDoc(doc(as("own2b", "b@x.com"), "companies/c2")));

// ---- creating a company
const fresh = as("fresh", "f@x.com");
await no("not a platform admin: cannot create a company", () => setDoc(doc(fresh, "companies/n0"), { name: "N", ownerUid: "fresh", createdAt: serverTimestamp() }));
await no("cannot make yourself a platform admin", () => setDoc(doc(fresh, "admins/fresh"), { by: "me" }));
await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "admins/fresh"), { note: "test" }); await setDoc(doc(ctx.firestore(), "admins/nu"), { note: "test" }); });
await ok("a platform admin reads their own admin doc", () => getDoc(doc(fresh, "admins/fresh")));
await no("fake owner create", () => setDoc(doc(fresh, "companies/n1"), { name: "N", ownerUid: "someoneelse" }));
await ok("create company", () => setDoc(doc(fresh, "companies/n1"), { name: "N", ownerUid: "fresh", createdAt: serverTimestamp() }));
await ok("creator adds self as owner", () => setDoc(doc(fresh, "companies/n1/members/fresh"), { role: "owner", name: "F", email: "f@x.com", createdAt: serverTimestamp() }));
await ok("user doc", () => setDoc(doc(fresh, "users/fresh"), { companies: arrayUnion("n1"), activeCompanyId: "n1" }, { merge: true }));
await no("stranger adds self as owner of others", () => setDoc(doc(as("evil", "e@x.com"), "companies/n1/members/evil"), { role: "owner" }));
await no("stranger adds self as owner of c1", () => setDoc(doc(as("evil", "e@x.com"), C + "/members/evil"), { role: "owner", email: "e@x.com" }));
await no("read other user profile", () => getDoc(doc(fresh, "users/own")));

// ---- accepting invites (member + user + invite delete in ONE batch, like the app)
const accept = async (ctxDb, uid, member, invId = "ana@x.com", cid = "c1") => {
  const b = writeBatch(ctxDb);
  b.set(doc(ctxDb, `companies/${cid}/members/${uid}`), member);
  b.set(doc(ctxDb, "users/" + uid), { companies: arrayUnion(cid), activeCompanyId: cid }, { merge: true });
  b.delete(doc(ctxDb, "invites/" + invId));
  await b.commit();
};
const ana = as("ana", "Ana@X.com");
await ok("invitee reads own invite", () => getDoc(doc(ana, "invites/ana@x.com")));
await no("other reads invite", () => getDoc(doc(as("bob", "bob@x.com"), "invites/ana@x.com")));
await no("invitee reads someone else's", () => getDoc(doc(ana, "invites/boss@x.com")));
await no("unverified accepts", () => accept(as("ana", "ana@x.com", false), "ana", { role: "worker", workerId: "w1", name: "Ana", email: "ana@x.com", createdAt: serverTimestamp() }));
await no("escalates role", () => accept(ana, "ana", { role: "admin", workerId: "w1", name: "Ana", email: "ana@x.com", createdAt: serverTimestamp() }));
await no("changes workerId", () => accept(ana, "ana", { role: "worker", workerId: "w2", name: "Ana", email: "ana@x.com", createdAt: serverTimestamp() }));
await no("drops workerId", () => accept(ana, "ana", { role: "worker", name: "Ana", email: "ana@x.com", createdAt: serverTimestamp() }));
await no("wrong company", () => accept(ana, "ana", { role: "worker", workerId: "w1", name: "Ana", email: "ana@x.com", createdAt: serverTimestamp() }, "ana@x.com", "c2"));
await no("extra member field", () => accept(ana, "ana", { role: "worker", workerId: "w1", name: "Ana", email: "ana@x.com", createdAt: serverTimestamp(), isOwner: true }));
await no("wrong email in member doc", () => accept(ana, "ana", { role: "worker", workerId: "w1", name: "Ana", email: "other@x.com", createdAt: serverTimestamp() }));
await no("someone else uses the invite", () => accept(as("mallory", "mal@x.com"), "mallory", { role: "worker", workerId: "w1", name: "M", email: "ana@x.com", createdAt: serverTimestamp() }));
await no("uid mismatch", () => accept(ana, "someone", { role: "worker", workerId: "w1", name: "Ana", email: "ana@x.com", createdAt: serverTimestamp() }));
await ok("valid accept", () => accept(ana, "ana", { role: "worker", workerId: "w1", name: "Ana", email: "ana@x.com", createdAt: serverTimestamp() }));
await ok("joined worker reads company", () => getDoc(doc(ana, C)));
await ok("joined worker reads own tasks", () => getDocs(query(collection(ana, C + "/tasks"), where("workerId", "==", "w1"))));
await ok("invite is consumed", () => getDoc(doc(ana, "invites/ana@x.com")).then((s) => { if (s.exists()) throw new Error("still there"); }));
await ok("worker invite accepted without workerId", () => accept(as("boss", "boss@x.com"), "boss", { role: "worker", name: "B", email: "boss@x.com", createdAt: serverTimestamp() }, "boss@x.com"));
// stale invite for an existing member can be deleted by the invitee
await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), "invites/wn@x.com"), { companyId: "c1", companyName: "A", role: "worker", invitedBy: "own" }); });
await ok("invitee clears stale invite", () => deleteDoc(doc(wnl, "invites/wn@x.com")));

// ---- billing protection (lead, phase 7) ----
const ownerDb = env.authenticatedContext("own", { email: "o@x.com", email_verified: true }).firestore();
await no("owner cannot set plan pro from the browser", () => updateDoc(doc(ownerDb, "companies/c1"), { plan: "pro" }));
await no("owner cannot set subscriptionStatus", () => updateDoc(doc(ownerDb, "companies/c1"), { subscriptionStatus: "active" }));
await no("owner cannot extend the trial", () => updateDoc(doc(ownerDb, "companies/c1"), { trialEndsAt: new Date(Date.now() + 400 * 864e5) }));
await ok("owner can still edit business info", () => updateDoc(doc(ownerDb, "companies/c1"), { name: "A2", phone: "1" }));
const newUser = env.authenticatedContext("nu", { email: "nu@x.com", email_verified: true }).firestore();
await no("new company cannot start as active", () => setDoc(doc(newUser, "companies/cn1"), { name: "N", ownerUid: "nu", plan: "pro" }));
await no("new company cannot carry a stripe customer", () => setDoc(doc(newUser, "companies/cn2"), { name: "N", ownerUid: "nu", stripeCustomerId: "cus_1" }));
await no("new company cannot get a 400-day trial", () => setDoc(doc(newUser, "companies/cn3"), { name: "N", ownerUid: "nu", trialEndsAt: new Date(Date.now() + 400 * 864e5) }));
await ok("new company with a 14-day trial", () => setDoc(doc(newUser, "companies/cn4"), { name: "N", ownerUid: "nu", trialEndsAt: new Date(Date.now() + 14 * 864e5) }));
await ok("new company without billing fields", () => setDoc(doc(newUser, "companies/cn5"), { name: "N", ownerUid: "nu" }));

console.log(`rules tests: ${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
