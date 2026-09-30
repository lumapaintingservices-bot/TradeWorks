// Phase 7 L: attacker-minded cases for firestore.rules — cross-company access, the public client link (portal), lead-form abuse,
// public business card, calendar feed, worker pay-rate tampering. Run with `npm run test:rules` (see README.md).
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { setLogLevel, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, arrayUnion, deleteField, serverTimestamp } from "firebase/firestore";
setLogLevel("silent"); // permission-denied is what these tests expect: keep the output readable

const env = await initializeTestEnvironment({ projectId: "demo-tw", firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } });
await env.clearFirestore();
let pass = 0, fail = 0;
const ok = async (name, p) => { try { await assertSucceeds(p()); pass++; } catch (e) { fail++; console.log("FAIL (should succeed):", name, String(e.message).slice(0, 200)); } };
const no = async (name, p) => { try { await assertFails(p()); pass++; } catch { fail++; console.log("FAIL (should be denied):", name); } };

await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  for (const [c, owner, admin, worker, wid] of [["c1", "own1", "adm1", "wrk1", "w1"], ["c2", "own2", "adm2", "wrk2", "w2"]]) {
    await setDoc(doc(d, `companies/${c}`), { name: c, ownerUid: owner, createdAt: 1, plan: "trial", trialEndsAt: new Date(Date.now() + 7 * 864e5) });
    await setDoc(doc(d, `companies/${c}/members/${owner}`), { role: "owner" });
    await setDoc(doc(d, `companies/${c}/members/${admin}`), { role: "admin" });
    await setDoc(doc(d, `companies/${c}/members/${worker}`), { role: "worker", workerId: wid });
    await setDoc(doc(d, `companies/${c}/workers/${wid}`), { name: wid, rate: 20 });
    for (const col of ["clients", "estimates", "invoices", "expenses", "payouts", "settings", "photos"]) await setDoc(doc(d, `companies/${c}/${col}/x1`), { a: 1 });
    await setDoc(doc(d, `companies/${c}/hours/h1`), { workerId: wid, hours: 3, rate: 20, date: "2026-05-01" });
  }
  await setDoc(doc(d, "public/c1"), { name: "One" });
  await setDoc(doc(d, "public/c2"), { name: "Two" });
  await setDoc(doc(d, "portal/tokA"), { owner: "c1", estId: "e1", data: "{}", client: { views: ["t"], chat: [] } });
  await setDoc(doc(d, "portal/tokA/photos/p1"), { data: "x" });
  await setDoc(doc(d, "calfeed/feedA"), { owner: "c1", ics: "BEGIN:VCALENDAR" });
  await setDoc(doc(d, "leads/L1"), { owner: "c1", name: "Ana", phone: "1", photos: ["p1"] });
  await setDoc(doc(d, "leads/L2"), { owner: "c1", name: "Bo", phone: "2", photos: [] });
  await setDoc(doc(d, "leads/L1/photos/p1"), { data: "data:image/jpeg;base64,AA", at: "x" });
});
const as = (uid, email = uid + "@x.com") => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const anon = env.unauthenticatedContext().firestore();
const own1 = as("own1"), adm1 = as("adm1"), wrk1 = as("wrk1"), own2 = as("own2"), adm2 = as("adm2"), wrk2 = as("wrk2"), stranger = as("stranger");
const fresh = () => env.unauthenticatedContext().firestore();

// ---------------------------------------------------------------- cross-company access (company A member vs company B data)
for (const [who, db] of [["owner of c2", own2], ["admin of c2", adm2], ["worker of c2", wrk2], ["signed-in stranger", stranger], ["signed-out", anon]]) {
  await no(`${who} reads c1 company doc`, () => getDoc(doc(db, "companies/c1")));
  for (const col of ["clients", "estimates", "invoices", "expenses", "payouts", "settings", "photos", "hours", "workers"]) {
    await no(`${who} reads c1/${col}`, () => getDoc(doc(db, `companies/c1/${col}/x1`)));
    await no(`${who} lists c1/${col}`, () => getDocs(collection(db, `companies/c1/${col}`)));
  }
  await no(`${who} writes c1 estimate`, () => setDoc(doc(db, "companies/c1/estimates/evil"), { number: "X" }));
  await no(`${who} edits c1 estimate`, () => updateDoc(doc(db, "companies/c1/estimates/x1"), { number: "X" }));
  await no(`${who} deletes c1 estimate`, () => deleteDoc(doc(db, "companies/c1/estimates/x1")));
  await no(`${who} lists c1 members`, () => getDocs(collection(db, "companies/c1/members")));
  await no(`${who} adds itself to c1`, () => setDoc(doc(db, `companies/c1/members/${who === "signed-out" ? "anon" : who.includes("stranger") ? "stranger" : "own2"}`), { role: "owner", email: "x@x.com" }));
  await no(`${who} edits c1 company`, () => updateDoc(doc(db, "companies/c1"), { name: "hacked" }));
  await no(`${who} deletes c1 company`, () => deleteDoc(doc(db, "companies/c1")));
}
await no("c2 owner reads c1 invites", () => getDocs(query(collection(own2, "invites"), where("companyId", "==", "c1"))));
await no("c2 owner writes public/c1", () => setDoc(doc(own2, "public/c1"), { name: "hacked" }));
await ok("c1 owner still reads own data", () => getDocs(collection(own1, "companies/c1/estimates")));
await ok("c1 admin still writes own data", () => setDoc(doc(adm1, "companies/c1/estimates/e9"), { number: "E9" }));
await no("user profile of someone else is unreadable", () => getDoc(doc(own2, "users/own1")));
await no("user profile of someone else is unwritable", () => setDoc(doc(own2, "users/own1"), { activeCompanyId: "c2" }));
await ok("own user profile", () => setDoc(doc(own2, "users/own2"), { name: "Two" }));
await no("signed-out reads users", () => getDoc(doc(anon, "users/own1")));
await no("nothing is readable at unknown top-level paths", () => getDoc(doc(own1, "secrets/x")));
await no("no writes at unknown top-level paths", () => setDoc(doc(own1, "secrets/x"), { a: 1 }));
await no("no nested collections under company docs are open", () => getDoc(doc(own1, "companies/c1/estimates/x1/notes/n1")));
await no("nested docs cannot be written either", () => setDoc(doc(own1, "companies/c1/estimates/x1/notes/n1"), { a: 1 }));

// ---------------------------------------------------------------- the client link (portal): get by token only; visitors may touch `client` only
await ok("anyone gets a portal by token", () => getDoc(doc(anon, "portal/tokA")));
await no("nobody lists portals", () => getDocs(collection(anon, "portal")));
await no("nobody queries portals by owner", () => getDocs(query(collection(anon, "portal"), where("owner", "==", "c1"))));
await no("signed-in stranger lists portals", () => getDocs(collection(stranger, "portal")));
await no("even the owner cannot list the whole collection", () => getDocs(collection(own1, "portal")));
await ok("visitor views: arrayUnion client.views", () => updateDoc(doc(fresh(), "portal/tokA"), { "client.views": arrayUnion("2026-09-29T10:00:00Z") }));
await ok("visitor picks an option", () => updateDoc(doc(fresh(), "portal/tokA"), { "client.picks.u1": true }));
await ok("visitor chats (arrayUnion)", () => updateDoc(doc(fresh(), "portal/tokA"), { "client.chat": arrayUnion({ from: "client", text: "hi", at: "x" }) }));
await ok("visitor signs", () => updateDoc(doc(fresh(), "portal/tokA"), { "client.sign": { name: "Ana", img: "data:image/png;base64,AA", at: "x", total: 10 } }));
await ok("visitor says the Zelle was sent", () => updateDoc(doc(fresh(), "portal/tokA"), { "client.paid": { method: "Zelle", at: "x" } }));
await ok("visitor approves a change order", () => updateDoc(doc(fresh(), "portal/tokA"), { "client.coSign.co1": { name: "Ana", img: "x", at: "x" } }));
await no("visitor rewrites the snapshot (data)", () => updateDoc(doc(fresh(), "portal/tokA"), { data: "{\"e\":{\"doors\":1}}" }));
await no("visitor changes the owner", () => updateDoc(doc(fresh(), "portal/tokA"), { owner: "c2" }));
await no("visitor changes estId", () => updateDoc(doc(fresh(), "portal/tokA"), { estId: "other" }));
await no("visitor touches client AND data", () => updateDoc(doc(fresh(), "portal/tokA"), { "client.picks.u1": true, data: "x" }));
await no("visitor adds an unknown top-level key", () => updateDoc(doc(fresh(), "portal/tokA"), { admin: true }));
await no("visitor adds an unknown client key", () => updateDoc(doc(fresh(), "portal/tokA"), { "client.isOwner": true }));
await no("visitor deletes client", () => updateDoc(doc(fresh(), "portal/tokA"), { client: deleteField() }));
await no("visitor sets client to a string", () => updateDoc(doc(fresh(), "portal/tokA"), { client: "x" }));
await no("visitor stuffs 301 chat messages", () => updateDoc(doc(fresh(), "portal/tokA"), { "client.chat": Array.from({ length: 301 }, (_, i) => ({ from: "client", text: "m" + i, at: "x" })) }));
await ok("visitor can send up to 300 chat messages", () => updateDoc(doc(fresh(), "portal/tokA"), { "client.chat": Array.from({ length: 300 }, (_, i) => ({ from: "client", text: "m" + i, at: "x" })) }));
await no("visitor stuffs 301 views", () => updateDoc(doc(fresh(), "portal/tokA"), { "client.views": Array.from({ length: 301 }, (_, i) => "v" + i) }));
await no("visitor creates a portal", () => setDoc(doc(fresh(), "portal/newTok"), { owner: "c1", estId: "e", data: "{}" }));
await no("visitor creates a portal for a company they do not run", () => setDoc(doc(stranger, "portal/newTok"), { owner: "c1", estId: "e", data: "{}" }));
await no("visitor deletes a portal", () => deleteDoc(doc(fresh(), "portal/tokA")));
await no("c2 admin edits c1 portal data", () => updateDoc(doc(adm2, "portal/tokA"), { data: "x" }));
await no("c2 admin creates a portal for c1", () => setDoc(doc(adm2, "portal/tokB"), { owner: "c1", estId: "e", data: "{}" }));
await no("c2 admin deletes c1 portal", () => deleteDoc(doc(adm2, "portal/tokA")));
await ok("c1 admin creates a portal", () => setDoc(doc(adm1, "portal/tokC"), { owner: "c1", estId: "e", data: "{}" }));
await ok("c1 admin updates the snapshot", () => updateDoc(doc(adm1, "portal/tokC"), { data: "{\"v\":1}" }));
await no("c1 admin hands the link to c2", () => updateDoc(doc(adm1, "portal/tokC"), { owner: "c2" }));
await no("c1 worker edits portal", () => updateDoc(doc(wrk1, "portal/tokC"), { data: "x" }));
await no("c1 worker creates portal", () => setDoc(doc(wrk1, "portal/tokD"), { owner: "c1", estId: "e", data: "{}" }));
await ok("c1 admin deletes a portal", () => deleteDoc(doc(adm1, "portal/tokC")));
await ok("anyone gets a portal photo", () => getDoc(doc(anon, "portal/tokA/photos/p1")));
await no("nobody lists portal photos", () => getDocs(collection(anon, "portal/tokA/photos")));
await no("visitor writes a portal photo", () => setDoc(doc(anon, "portal/tokA/photos/p2"), { data: "x" }));
await no("c2 admin writes a c1 portal photo", () => setDoc(doc(adm2, "portal/tokA/photos/p2"), { data: "x" }));
await ok("c1 admin writes a portal photo", () => setDoc(doc(adm1, "portal/tokA/photos/p2"), { data: "x" }));

// ---------------------------------------------------------------- invoice payment link (paylink): get by token; visitors may only add views / say "I paid"
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "paylink/payA"), { owner: "c1", invId: "i1", data: "{}", client: {} });
});
await ok("anyone gets a paylink by token", () => getDoc(doc(anon, "paylink/payA")));
await no("nobody lists paylinks", () => getDocs(collection(anon, "paylink")));
await no("visitor queries paylinks by owner", () => getDocs(query(collection(anon, "paylink"), where("owner", "==", "c1"))));
await no("c2 owner queries c1 paylinks", () => getDocs(query(collection(own2, "paylink"), where("owner", "==", "c1"))));
await no("c1 worker queries c1 paylinks", () => getDocs(query(collection(wrk1, "paylink"), where("owner", "==", "c1"))));
await ok("c1 admin queries own paylinks", () => getDocs(query(collection(adm1, "paylink"), where("owner", "==", "c1"))));
await no("even c1 owner cannot list the whole collection", () => getDocs(collection(own1, "paylink")));
await ok("visitor view mark", () => updateDoc(doc(fresh(), "paylink/payA"), { "client.views": arrayUnion("2026-09-30T10:00:00Z") }));
await ok("visitor says they paid", () => updateDoc(doc(fresh(), "paylink/payA"), { "client.paid": { method: "Venmo", at: "2026-09-30T10:00:00Z", note: "conf 123" } }));
await ok("visitor says they paid, no note", () => updateDoc(doc(fresh(), "paylink/payA"), { "client.paid": { method: "Zelle", at: "x" } }));
await no("visitor marks the invoice paid in the snapshot", () => updateDoc(doc(fresh(), "paylink/payA"), { data: "{\"inv\":{\"paid\":true}}" }));
await no("visitor changes the owner", () => updateDoc(doc(fresh(), "paylink/payA"), { owner: "c2" }));
await no("visitor changes invId", () => updateDoc(doc(fresh(), "paylink/payA"), { invId: "i2" }));
await no("visitor adds an unknown client key", () => updateDoc(doc(fresh(), "paylink/payA"), { "client.chat": [] }));
await no("visitor adds an unknown paid key", () => updateDoc(doc(fresh(), "paylink/payA"), { "client.paid": { method: "Zelle", at: "x", amount: 1 } }));
await no("visitor sends a 41-char method", () => updateDoc(doc(fresh(), "paylink/payA"), { "client.paid": { method: "m".repeat(41), at: "x" } }));
await no("visitor sends a 301-char note", () => updateDoc(doc(fresh(), "paylink/payA"), { "client.paid": { method: "Zelle", at: "x", note: "n".repeat(301) } }));
await no("visitor wipes the paid claim (only the owner may)", () => updateDoc(doc(fresh(), "paylink/payA"), { "client.paid": null }));
await no("visitor sends a paid without time", () => updateDoc(doc(fresh(), "paylink/payA"), { "client.paid": { method: "Zelle" } }));
await no("visitor stuffs 101 views", () => updateDoc(doc(fresh(), "paylink/payA"), { "client.views": Array.from({ length: 101 }, (_, i) => "v" + i) }));
await no("visitor sets client to a string", () => updateDoc(doc(fresh(), "paylink/payA"), { client: "x" }));
await no("visitor creates a paylink", () => setDoc(doc(fresh(), "paylink/payNew"), { owner: "c1", invId: "i", data: "{}" }));
await no("stranger creates a paylink for c1", () => setDoc(doc(stranger, "paylink/payNew"), { owner: "c1", invId: "i", data: "{}" }));
await no("visitor deletes a paylink", () => deleteDoc(doc(fresh(), "paylink/payA")));
await no("visitor marks it paid online (only the Stripe webhook may)", () => updateDoc(doc(fresh(), "paylink/payA"), { online: { status: "paid", at: "x", amount: 1 } }));
await ok("c1 admin republishes a paylink that has an online payment", () => setDoc(doc(adm1, "paylink/payA"), { data: "{}", online: { status: "paid", at: "x", amount: 1 } }, { merge: true }));
await no("c2 admin edits c1 paylink data", () => updateDoc(doc(adm2, "paylink/payA"), { data: "x" }));
await no("c2 admin deletes c1 paylink", () => deleteDoc(doc(adm2, "paylink/payA")));
await no("c1 worker creates a paylink", () => setDoc(doc(wrk1, "paylink/payW"), { owner: "c1", invId: "i", data: "{}" }));
await ok("c1 admin creates a paylink", () => setDoc(doc(adm1, "paylink/payB"), { owner: "c1", invId: "i2", data: "{}", updatedAt: serverTimestamp() }));
await no("c1 admin creates a paylink with an extra key", () => setDoc(doc(adm1, "paylink/payC"), { owner: "c1", invId: "i3", data: "{}", secret: 1 }));
await no("c1 admin creates a 200 KB+ snapshot", () => setDoc(doc(adm1, "paylink/payD"), { owner: "c1", invId: "i4", data: "x".repeat(200001) }));
await ok("c1 admin re-publishes the snapshot", () => setDoc(doc(adm1, "paylink/payB"), { data: "{\"v\":1}", updatedAt: serverTimestamp() }, { merge: true }));
await no("c1 admin hands a paylink to c2", () => updateDoc(doc(adm1, "paylink/payB"), { owner: "c2" }));
await ok("c1 admin clears a claim that never arrived", () => updateDoc(doc(adm1, "paylink/payB"), { "client.paid": null }));
await ok("c1 admin deletes a paylink", () => deleteDoc(doc(adm1, "paylink/payB")));

// ---------------------------------------------------------------- lead form abuse
const JPG = "data:image/jpeg;base64,";
const lead = (over = {}) => ({ owner: "c1", name: "Ana Ruiz", phone: "555-123-4567", email: "a@x.com", city: "Austin", address: "1 Main", service: "Kitchen cabinets", message: "hi", heard: "Google", lang: "en", photos: [], details: { v: 2, types: ["cabinets"], other: "" }, at: "2026-09-29T10:00:00.000Z", page: "https://x.com/request?c=c1", ...over });
const L = (id, data) => setDoc(doc(fresh(), "leads/" + id), data);
await ok("valid lead", () => L("n1", lead()));
await ok("valid lead, minimum fields", () => L("n2", { owner: "c1", name: "A", phone: "1", photos: [] }));
await ok("valid lead with 5 photo ids", () => L("n3", lead({ photos: ["a", "b", "c", "d", "e"] })));
await ok("lead at the size limits", () => L("n4", lead({ name: "n".repeat(100), phone: "1".repeat(30), email: "e".repeat(120), city: "c".repeat(80), address: "a".repeat(160), service: "s".repeat(120), message: "m".repeat(1500), heard: "h".repeat(40), page: "p".repeat(200), details: { other: "o".repeat(800), types: ["a", "b", "c", "d", "e"] } })));
await no("lead for a company that does not exist", () => L("x1", lead({ owner: "nope" })));
await no("lead with owner not a string", () => L("x2", lead({ owner: 5 })));
await no("lead with extra key", () => L("x3", lead({ admin: true })));
await no("lead with imported flag", () => L("x4", lead({ imported: true })));
await no("lead without name", () => L("x5", lead({ name: "" })));
await no("lead with name 101 chars", () => L("x6", lead({ name: "n".repeat(101) })));
await no("lead with name not a string", () => L("x7", lead({ name: 7 })));
await no("lead with phone 31 chars", () => L("x8", lead({ phone: "1".repeat(31) })));
await no("lead with 6 photo ids", () => L("x9", lead({ photos: ["a", "b", "c", "d", "e", "f"] })));
await no("lead with photos not a list", () => L("x10", lead({ photos: "abc" })));
await no("lead with email 121 chars", () => L("x11", lead({ email: "e".repeat(121) })));
await no("lead with message 1501 chars", () => L("x12", lead({ message: "m".repeat(1501) })));
await no("lead with 100 KB message", () => L("x13", lead({ message: "m".repeat(100000) })));
await no("lead with city 81", () => L("x14", lead({ city: "c".repeat(81) })));
await no("lead with address 161", () => L("x15", lead({ address: "a".repeat(161) })));
await no("lead with service 121", () => L("x16", lead({ service: "s".repeat(121) })));
await no("lead with heard 41", () => L("x17", lead({ heard: "h".repeat(41) })));
await no("lead with lang not short", () => L("x18", lead({ lang: "english" })));
await no("lead with page 201", () => L("x19", lead({ page: "p".repeat(201) })));
await no("lead with at 41", () => L("x20", lead({ at: "a".repeat(41) })));
await no("lead with details as string", () => L("x21", lead({ details: "boom" })));
await no("lead with details.other 801", () => L("x22", lead({ details: { other: "o".repeat(801) } })));
await no("lead with details of 21 keys", () => L("x23", lead({ details: Object.fromEntries(Array.from({ length: 21 }, (_, i) => ["k" + i, 1])) })));
await no("lead with 6 detail types", () => L("x24", lead({ details: { types: ["a", "b", "c", "d", "e", "f"] } })));
await no("lead with details.types not a list", () => L("x25", lead({ details: { types: "abc" } })));
await no("anonymous cannot overwrite an existing lead", () => L("L1", lead()));
await no("anonymous cannot update a lead", () => updateDoc(doc(fresh(), "leads/L1"), { name: "x" }));
await no("anonymous cannot delete a lead", () => deleteDoc(doc(fresh(), "leads/L1")));
await no("anonymous cannot read a lead", () => getDoc(doc(anon, "leads/L1")));
await no("anonymous cannot list leads", () => getDocs(collection(anon, "leads")));
await no("signed-in stranger cannot list leads of c1", () => getDocs(query(collection(stranger, "leads"), where("owner", "==", "c1"))));
await no("c2 admin cannot read c1 lead", () => getDoc(doc(adm2, "leads/L1")));
await no("c2 admin cannot delete c1 lead", () => deleteDoc(doc(adm2, "leads/L1")));
await no("c1 worker cannot read a lead", () => getDoc(doc(wrk1, "leads/L1")));
await ok("c1 admin lists own leads", () => getDocs(query(collection(adm1, "leads"), where("owner", "==", "c1"))));
await no("c1 admin cannot list all leads", () => getDocs(collection(adm1, "leads")));
await ok("c1 admin marks a lead imported", () => updateDoc(doc(adm1, "leads/L1"), { imported: true }));
await ok("c1 admin deletes a lead photo", () => deleteDoc(doc(adm1, "leads/L1/photos/p1")));
await ok("c1 admin deletes a lead", () => deleteDoc(doc(adm1, "leads/L1")));
// lead photos are written BEFORE the lead exists (rule: the lead must not exist yet)
const P = (lid, pid, data) => setDoc(doc(fresh(), `leads/${lid}/photos/${pid}`), data);
await ok("valid jpeg photo", () => P("fresh1", "p1", { data: JPG + "A".repeat(100), at: "2026-09-29T10:00:00.000Z" }));
await ok("valid png photo", () => P("fresh1", "p2", { data: "data:image/png;base64,AAAA", at: "x" }));
await ok("valid webp photo", () => P("fresh1", "p3", { data: "data:image/webp;base64,AAAA", at: "x" }));
await ok("photo of ~880 KB", () => P("fresh1", "p4", { data: JPG + "A".repeat(880000), at: "x" }));
await no("photo over 900 KB", () => P("fresh1", "p5", { data: JPG + "A".repeat(900000), at: "x" }));
await no("photo that is html", () => P("fresh1", "p7", { data: "data:text/html;base64,PHNjcmlwdD4=", at: "x" }));
await no("photo that is svg", () => P("fresh1", "p8", { data: "data:image/svg+xml;base64,PHN2Zz4=", at: "x" }));
await no("photo that is a javascript url", () => P("fresh1", "p9", { data: "javascript:alert(1)", at: "x" }));
await no("photo that is plain text", () => P("fresh1", "p10", { data: "hello", at: "x" }));
await no("photo data not a string", () => P("fresh1", "p11", { data: 5, at: "x" }));
await no("photo with extra key", () => P("fresh1", "p12", { data: JPG + "AA", at: "x", owner: "c1" }));
await no("photo without at", () => P("fresh1", "p13", { data: JPG + "AA" }));
await no("photo with at 41 chars", () => P("fresh1", "p14", { data: JPG + "AA", at: "a".repeat(41) }));
await no("photo for a lead that already exists", () => P("L2", "p99", { data: JPG + "AA", at: "x" }));
await no("anonymous cannot overwrite an existing lead photo", () => P("fresh1", "p1", { data: JPG + "BB", at: "x" }));
await no("nobody reads lead photos anonymously", () => getDoc(doc(anon, "leads/fresh1/photos/p1")));
await no("orphan photos are unreadable even for admins (no lead doc)", () => getDoc(doc(adm1, "leads/fresh1/photos/p1")));

// ---------------------------------------------------------------- public business card
await ok("anyone gets the public card", () => getDoc(doc(anon, "public/c1")));
await no("nobody lists public cards", () => getDocs(collection(anon, "public")));
await no("visitor writes a public card", () => setDoc(doc(anon, "public/c1"), { name: "hacked" }));
await no("stranger writes a public card", () => setDoc(doc(stranger, "public/c1"), { name: "hacked" }));
await no("c2 admin writes c1 public card", () => setDoc(doc(adm2, "public/c1"), { name: "hacked" }));
await no("c1 worker writes the public card", () => setDoc(doc(wrk1, "public/c1"), { name: "hacked" }));
await no("c2 admin deletes c1 public card", () => deleteDoc(doc(adm2, "public/c1")));
await ok("c1 admin writes the public card", () => setDoc(doc(adm1, "public/c1"), { name: "One", phone: "1" }, { merge: true }));
await no("stranger cannot create the card of an unused company id", () => setDoc(doc(stranger, "public/brandnew"), { name: "x" }));

// ---------------------------------------------------------------- calendar feed
const feed = (over = {}) => ({ owner: "c1", ics: "BEGIN:VCALENDAR\r\nEND:VCALENDAR", updatedAt: serverTimestamp(), ...over });
await ok("anyone gets a feed by token", () => getDoc(doc(anon, "calfeed/feedA")));
await no("nobody lists feeds", () => getDocs(collection(anon, "calfeed")));
await no("visitor creates a feed", () => setDoc(doc(anon, "calfeed/feedX"), feed()));
await no("stranger creates a feed for c1", () => setDoc(doc(stranger, "calfeed/feedX"), feed()));
await no("c1 worker creates a feed", () => setDoc(doc(wrk1, "calfeed/feedX"), feed()));
await ok("c1 admin creates a feed", () => setDoc(doc(adm1, "calfeed/feedB"), feed()));
await ok("c1 admin updates own feed (merge, like the app)", () => setDoc(doc(adm1, "calfeed/feedB"), { owner: "c1", ics: "BEGIN:VCALENDAR\r\nX:1\r\nEND:VCALENDAR", updatedAt: serverTimestamp() }, { merge: true }));
await no("feed with an extra key", () => setDoc(doc(adm1, "calfeed/feedC"), feed({ token: "x" })));
await no("feed with ics not a string", () => setDoc(doc(adm1, "calfeed/feedC"), feed({ ics: 5 })));
await no("feed with ics over 900 KB", () => setDoc(doc(adm1, "calfeed/feedC"), feed({ ics: "x".repeat(900001) })));
await no("c2 admin takes over the c1 feed (update)", () => setDoc(doc(adm2, "calfeed/feedA"), feed({ owner: "c2", ics: "BEGIN:VCALENDAR\r\nEND:VCALENDAR" }), { merge: true }));
await no("c2 admin overwrites the c1 feed keeping owner c1", () => setDoc(doc(adm2, "calfeed/feedA"), feed({ owner: "c1" }), { merge: true }));
await no("c2 admin overwrites the c1 feed without merge", () => setDoc(doc(adm2, "calfeed/feedA"), feed({ owner: "c2" })));
await no("c1 admin moves the feed to c2", () => setDoc(doc(adm1, "calfeed/feedB"), feed({ owner: "c2" }), { merge: true }));
await no("c2 admin deletes the c1 feed", () => deleteDoc(doc(adm2, "calfeed/feedA")));
await no("visitor deletes a feed", () => deleteDoc(doc(anon, "calfeed/feedA")));
await ok("c1 admin deletes own feed", () => deleteDoc(doc(adm1, "calfeed/feedB")));

// ---------------------------------------------------------------- workers cannot raise their own pay
const w1 = (o) => setDoc(doc(wrk1, "companies/c1/hours/" + o.id), o.data);
await ok("worker logs hours at own rate", () => w1({ id: "n1", data: { workerId: "w1", date: "2026-05-02", hours: 2, rate: 20, estId: "", note: "", companyId: "c1", createdAt: serverTimestamp(), updatedAt: serverTimestamp() } }));
await ok("worker logs hours without a rate", () => w1({ id: "n2", data: { workerId: "w1", date: "2026-05-02", hours: 2, companyId: "c1", createdAt: serverTimestamp(), updatedAt: serverTimestamp() } }));
await no("worker logs hours at a higher rate", () => w1({ id: "n3", data: { workerId: "w1", date: "2026-05-02", hours: 2, rate: 500 } }));
await no("worker logs hours at rate 0.01 above", () => w1({ id: "n4", data: { workerId: "w1", date: "2026-05-02", hours: 2, rate: 20.01 } }));
await no("worker logs hours with a string rate", () => w1({ id: "n5", data: { workerId: "w1", date: "2026-05-02", hours: 2, rate: "20" } }));
await no("worker logs hours with an extra key", () => w1({ id: "n6", data: { workerId: "w1", date: "2026-05-02", hours: 2, paid: true } }));
await no("worker logs absurd hours", () => w1({ id: "n7", data: { workerId: "w1", date: "2026-05-02", hours: 5000 } }));
await no("worker logs negative hours", () => w1({ id: "n8", data: { workerId: "w1", date: "2026-05-02", hours: -3 } }));
await no("worker logs hours as a string", () => w1({ id: "n9", data: { workerId: "w1", date: "2026-05-02", hours: "3" } }));
await no("worker raises the rate of an existing entry", () => updateDoc(doc(wrk1, "companies/c1/hours/h1"), { rate: 500 }));
await ok("worker edits hours, rate untouched", () => updateDoc(doc(wrk1, "companies/c1/hours/h1"), { hours: 4, updatedAt: serverTimestamp() }));
await ok("worker rewrites the entry with the same rate", () => setDoc(doc(wrk1, "companies/c1/hours/h1"), { workerId: "w1", date: "2026-05-01", hours: 5, rate: 20, companyId: "c1" }));
await no("worker rewrites the entry dropping into another key", () => setDoc(doc(wrk1, "companies/c1/hours/h1"), { workerId: "w1", date: "2026-05-01", hours: 5, rate: 20, bonus: 100 }));
await ok("worker clock in with the app's shape", () => setDoc(doc(wrk1, "companies/c1/clock/w1"), { at: "2026-05-04T13:00:00Z", estId: "", companyId: "c1", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
await no("worker clock in with an extra key", () => setDoc(doc(wrk1, "companies/c1/clock/w1"), { at: "x", rate: 1000 }));
// team map: a phone position { lat, lng, acc, at } on the clock and on hours entries
const LOC = { lat: 25.76, lng: -80.19, acc: 12, at: "2026-05-04T13:00:00Z" };
await ok("worker clock in with a location", () => setDoc(doc(wrk1, "companies/c1/clock/w1"), { at: "2026-05-04T13:00:00Z", estId: "", loc: LOC, last: LOC }));
await ok("worker refreshes their position", () => updateDoc(doc(wrk1, "companies/c1/clock/w1"), { last: { ...LOC, at: "2026-05-04T13:05:00Z" } }));
await no("worker position with an extra key", () => updateDoc(doc(wrk1, "companies/c1/clock/w1"), { last: { ...LOC, speed: 3 } }));
await no("worker position out of range", () => updateDoc(doc(wrk1, "companies/c1/clock/w1"), { last: { ...LOC, lat: 91 } }));
await no("worker position as text", () => updateDoc(doc(wrk1, "companies/c1/clock/w1"), { loc: "Miami" }));
await ok("worker clock-out hours with in/out positions", () => setDoc(doc(wrk1, "companies/c1/hours/nLoc"), { workerId: "w1", date: "2026-05-04", hours: 2, inLoc: LOC, outLoc: LOC }));
await no("worker hours with a bad position", () => setDoc(doc(wrk1, "companies/c1/hours/nLoc2"), { workerId: "w1", date: "2026-05-04", hours: 2, outLoc: { lat: "x" } }));
await ok("worker clock-out hours with in/out times", () => setDoc(doc(wrk1, "companies/c1/hours/nT"), { workerId: "w1", date: "2026-05-04", hours: 8, start: "2026-05-04T13:00:00.000Z", end: "2026-05-04T21:00:00.000Z" }));
await no("worker hours with a time that is not text", () => setDoc(doc(wrk1, "companies/c1/hours/nT2"), { workerId: "w1", date: "2026-05-04", hours: 8, start: 5 }));
await no("worker cannot touch c2 hours", () => setDoc(doc(wrk1, "companies/c2/hours/n1"), { workerId: "w2", hours: 1 }));
await no("worker cannot read payouts", () => getDocs(collection(wrk1, "companies/c1/payouts")));
await no("worker cannot create payouts", () => setDoc(doc(wrk1, "companies/c1/payouts/p1"), { workerId: "w1", amount: 999 }));
await ok("admin may still record any rate (owner decides pay)", () => setDoc(doc(adm1, "companies/c1/hours/n10"), { workerId: "w1", date: "2026-05-02", hours: 2, rate: 35 }));

// ---------------------------------------------------------------- billing fields and company shape
await no("admin cannot flip the plan", () => updateDoc(doc(adm1, "companies/c1"), { plan: "pro" }));
await no("admin cannot delete a billing field", () => updateDoc(doc(adm1, "companies/c1"), { trialEndsAt: deleteField() }));
await no("owner cannot set stripeCustomerId", () => updateDoc(doc(own1, "companies/c1"), { stripeCustomerId: "cus_x" }));
await no("owner cannot set pastDueSince", () => updateDoc(doc(own1, "companies/c1"), { pastDueSince: new Date() }));
await no("owner cannot point card payments at another Stripe account", () => updateDoc(doc(own1, "companies/c1"), { stripeAccountId: "acct_x" }));
await no("admin cannot switch card payments on", () => updateDoc(doc(adm1, "companies/c1"), { stripeReady: true }));
await no("a new company cannot start with a Stripe account", () => setDoc(doc(own2, "companies/cNew"), { ownerUid: "own2", name: "x", stripeAccountId: "acct_x" }));
await no("owner cannot replace the whole company doc (would drop ownerUid)", () => setDoc(doc(own1, "companies/c1"), { name: "x" }));
await no("owner cannot change createdAt", () => updateDoc(doc(own1, "companies/c1"), { createdAt: 5 }));

console.log(`security rules tests: ${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
