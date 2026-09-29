# Firestore rules tests

These tests run `../firestore.rules` against the local Firestore emulator and check who can read / write what.
They are kept in their own folder (with their own `package.json`) because `firebase-tools` is large and the app itself
does not need it.

## Run

Requirements: Node 20+ and Java 11+ (the emulator is a Java program).

```bash
npm --prefix rules-tests install      # once (downloads firebase-tools + the emulator on first run)
npm run test:rules                    # from the repo root
```

One-off, without installing anything permanently:

```bash
npx -y firebase-tools@latest emulators:exec --only firestore --project demo-tw "node rules-tests/rules.test.mjs"
```
(that form needs `@firebase/rules-unit-testing` and `firebase` resolvable from the test files, so the `npm --prefix` route is easier.)

`../firebase.json` holds the emulator ports (8191, not the default 8080, so it does not clash with other things on the machine).
The project id `demo-tw` starts with `demo-`, so nothing ever touches a real Firebase project.

## What is covered

| File | Cases |
| --- | --- |
| `rules.test.mjs` | roles (owner / admin / worker), members, invites, accepting an invite, company creation, billing-field protection |
| `rules.worker.test.mjs` | the exact queries and writes the worker screens issue (own tasks, own hours, clock in / out) and everything else denied |
| `rules.security.test.mjs` | cross-company reads and writes; the public client link (`portal`): get only, visitors may only touch `client`, size limits; lead-form abuse (field limits, photo size and type, no overwrite, nobody reads); public business card; calendar feed takeover; workers cannot raise their own pay rate; billing fields |

Every test says in its name whether the operation must succeed or be denied. The run ends with the pass / fail counts and exits
with a non-zero code on any failure, so it can go in CI.

## Adding a case

Open the file closest to the topic, add a line such as

```js
await no("c2 admin reads c1 invoices", () => getDoc(doc(adm2, "companies/c1/invoices/x1")));
await ok("owner edits own invoice", () => updateDoc(doc(own1, "companies/c1/invoices/x1"), { status: "Paid" }));
```

`no()` expects `permission-denied`, `ok()` expects success. Seed data goes in the `withSecurityRulesDisabled` block at the top.

## Storage rules

`../storage.rules` is not covered by an automated test (the Storage emulator needs a separate download). Check it by hand after
publishing: as a signed-in owner upload a JPEG (works), upload a `.html` file or a file over 5 MB (denied), and try to open a
file of another company (denied).
