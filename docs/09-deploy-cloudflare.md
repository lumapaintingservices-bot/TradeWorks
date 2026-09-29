# 09 - Publish TradeWorks on Cloudflare Pages (step by step)

Written for the owner, not for programmers. Every step says where to click. Plan about 45 minutes the first time.
A short summary in Spanish is at the end.

What you will have at the end: your own web address (for example `tradeworks.pages.dev`, or `app.yourcompany.com`) where you and your team sign in, and where your clients open their estimate links and the request form. Your data lives in Google Firebase, the website files live on Cloudflare. Both have a free level that is enough to start (Firebase Storage for photos needs the Blaze plan; see step 1.4).

You need: a GitHub account with the TradeWorks project in it, a Google account, a free Cloudflare account (https://dash.cloudflare.com/sign-up).

---

## Step 1 - Firebase (your database and sign-in)

1. Go to https://console.firebase.google.com and click **Add project**. Name it (for example `tradeworks-app`). Google Analytics: you can turn it off. Click **Create project**.
2. **Sign-in:** left menu **Build > Authentication > Get started > Sign-in method > Email/Password > Enable > Save**.
3. **Database:** **Build > Firestore Database > Create database**. Choose **Production mode** (the rules in step 5 replace it). Pick the region closest to you (for the US, `nam5` or `us-central`). You cannot change the region later.
4. **Photos and receipts:** **Build > Storage > Get started**. Google asks you to upgrade to the **Blaze** plan (pay as you go). A small business normally stays at $0 to a few dollars per month. Do it now and immediately set a **budget alert**: Google Cloud console (link "Usage and billing" in Firebase) > **Billing > Budgets & alerts > Create budget**, amount `$10`, alerts at 50% and 100%.
5. **Your web app keys:** click the gear next to **Project Overview > Project settings > General**, scroll to **Your apps**, click the **`</>` (Web)** icon, give it a name, and click **Register app** (do not tick Hosting). You will see a block of text with `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. Keep this page open for step 3.

## Step 2 - Cloudflare Pages (the website)

1. In https://dash.cloudflare.com open **Workers & Pages** (left menu) > **Create** > tab **Pages** > **Connect to Git**.
2. Connect your GitHub account, choose the TradeWorks repository, click **Begin setup**.
3. Fill in:
   * **Project name:** for example `tradeworks` (this becomes `tradeworks.pages.dev`).
   * **Production branch:** `main` (or the branch you keep your finished work in).
   * **Framework preset:** `None` (or `Vite`, same result).
   * **Build command:** `npm run build`
   * **Build output directory:** `dist`
   * **Root directory:** leave empty.
4. Click **Environment variables (advanced)** and add these (type the name exactly, values from Firebase step 1.5). For each one choose **Text**:

| Name | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `VITE_FIREBASE_API_KEY` | `apiKey` from Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |
| `VITE_BILLING_API` | leave out for now (turns on TradeWorks subscriptions, see `docs/08-billing-setup.md`) |
| `VITE_CAL_FEED_URL` | leave out for now (address of the calendar worker, step 7) |

   **Important:** if the six `VITE_FIREBASE_*` values are missing, the site starts in **demo mode** (data only inside each browser, passwords stored in the clear). After deploying, the sidebar (on a computer) must show the green **Cloud on** badge. If it says orange **Demo mode**, the keys are missing.
5. Click **Save and Deploy**. Wait 1-3 minutes. When it says **Success**, click the address shown (`https://tradeworks.pages.dev`). The sign-in page should open. Do not sign up yet; do steps 3-5 first.

Notes: the build also copies `public/_headers` (security headers) and `public/_redirects` (so links like `/p/abc...` open the app) automatically. Do not delete those two files.

## Step 3 - Tell Firebase that the new address is allowed

Without this, sign-in on your Cloudflare address fails with "unauthorized domain".

1. Firebase console > **Authentication > Settings > Authorized domains > Add domain**.
2. Add `tradeworks.pages.dev` (your Cloudflare address, without `https://`). If you use your own domain later, add that too (for example `app.yourcompany.com`).

## Step 4 - (Optional) your own domain

Cloudflare > **Workers & Pages > your project > Custom domains > Set up a domain**, type `app.yourcompany.com` and follow the screen (if the domain is on Cloudflare it is one click). Then repeat step 3 for the new domain. If you use billing, also set `APP_URL` (`docs/08-billing-setup.md`).

## Step 5 - Publish the security rules (do not skip)

The rules decide who can read what. Until you publish them, your database is in "production mode" and **nobody** (not even you) can use it.

**Firestore:** Firebase console > **Firestore Database > Rules**. Delete everything in the box, open the file `firestore.rules` from the project (on GitHub, click the file, then **Raw**, copy all), paste it, click **Publish**.

**Storage:** **Storage > Rules**: same with `storage.rules`, then **Publish**.

(For a developer: `npx firebase-tools login` then `npx firebase-tools deploy --only firestore:rules,storage --project YOUR_PROJECT_ID` does the same from the project folder; `firebase.json` is already there. Run `npm run test:rules` first if you changed a rule.)

Publish again every time these two files change in GitHub.

## Step 6 - E-mail messages (verification and password reset)

1. Firebase > **Authentication > Templates**.
2. Open **Email address verification** and **Password reset**: click the pencil, set **Sender name** (your company), and change the language to **Español** if you prefer (top right of the template). Save.
3. Team invitations need the invited person to verify their e-mail once (the app sends the verification e-mail when they create the account, and shows "I verified my email").
4. Optional but recommended: **Authentication > Settings > User actions** > turn on **Email enumeration protection**.

## Step 7 - Calendar and billing (optional, later)

* **Calendar link for Google / Apple / Outlook:** follow `workers/README.md` (5 minutes), then add `VITE_CAL_FEED_URL` in Cloudflare (Settings > Environment variables) and redeploy.
* **Charging your own customers a TradeWorks subscription (Stripe):** follow `docs/08-billing-setup.md`. Until you do, billing is off and nothing is ever locked.

## Step 8 - Launch checklist (do it in this order, tick each one)

- [ ] The site opens at your address and the sidebar shows the green **Cloud on** after sign-in (not the orange **Demo mode**).
- [ ] `firestore.rules` and `storage.rules` are published (step 5). The Rules page shows today's date.
- [ ] Your Cloudflare address (and custom domain) is in **Authorized domains** (step 3).
- [ ] **Test sign-up:** create your account with your real e-mail, finish the setup, create a test client and a test estimate. Sign out, sign in again: your data is still there.
- [ ] **Test on a phone:** open the site on your phone, add it to the home screen, create an estimate, tap **Link & chat > Create client link**, and open the link on a **different phone or a private tab**: options, signature and the Zelle box work.
- [ ] **Test the request form:** open Settings > Client link, copy the **request-form link**, send a test request from your phone, and see it in Clients as a new request.
- [ ] **Security headers:** open the site, press F12 > **Console**. There must be no red "Refused to connect..." or "Content Security Policy" lines while you sign in, save an estimate and upload a photo. If there is one, note the address it mentions and ask your developer to add it to `public/_headers` (`connect-src`).
- [ ] Open `https://YOUR-SITE/api/billing/checkout` in the browser: you should see `{"error":"Method not allowed"}` (that proves the billing functions are reachable and the page rewrite does not swallow them).
- [ ] **Download a backup:** Settings > Backup & storage > **Download backup**, keep the file.
- [ ] **Budget alert** exists in Google Cloud (step 1.4).
- [ ] **Restrict the Firebase key:** https://console.cloud.google.com > your project > **APIs & Services > Credentials > Browser key** > **Application restrictions: Websites** > add `https://tradeworks.pages.dev/*` (and your domain). This stops other websites from using your key.
- [ ] Later, before you advertise the request form widely: **Firebase App Check** (Build > App Check) with reCAPTCHA, to stop spam robots. (Turn it on for Firestore and Storage only after testing; "Monitor" mode first.)
- [ ] Delete the demo data: sign out and use the real account only. Never use a real password while the badge says **Demo mode**.

## Updating the site

Every time the code on your production branch changes on GitHub, Cloudflare builds and publishes it by itself (1-3 minutes). **Workers & Pages > your project > Deployments** shows the list; a red **Failed** build never replaces the working site.

If you change an environment variable, click **Deployments > (latest) > Retry deployment**; variables starting with `VITE_` are baked in when the site is built.

## Going back (rollback)

* **The new version is broken:** Cloudflare > Workers & Pages > your project > **Deployments**, find the last good one, click the three dots **... > Rollback to this deployment**. It is live in seconds. Your data is not touched by a rollback.
* **A rule change broke something:** Firebase > Firestore Database > Rules > **History** (icon next to Publish), pick the previous version, **Publish**. Same for Storage.
* **Data was damaged or deleted by mistake:** Settings > Backup & storage > **Choose backup file...** and restore the last backup you downloaded (records with the same ID are replaced; nothing else is deleted; photos are not inside the file).
* **The calendar link leaked:** Settings > Calendar > **Make a new private link**.

## Problems and answers

| What you see | What to do |
|---|---|
| "unauthorized domain" when signing in | Step 3 (Authorized domains). |
| "Missing or insufficient permissions" everywhere | Rules not published (step 5) or you are signed in with an account that is not a member of the company. |
| Orange "Demo mode" badge, accounts disappear when you change browser | The `VITE_FIREBASE_*` variables are missing or misspelled: step 2.4, then **Retry deployment**. |
| Photos do not upload | Storage is not enabled (step 1.4) or `VITE_FIREBASE_STORAGE_BUCKET` is empty. |
| The client link shows "This link isn't active" | The estimate was deleted, or the client link was never created (Link & chat tab). |
| Build fails with "node: not found" or a Vite error about Node | `NODE_VERSION` = `22` is missing (step 2.4). |

---

## Resumen en español

1. **Firebase:** crea un proyecto, activa **Authentication > Email/Password**, crea **Firestore** (modo producción) y **Storage** (pide el plan Blaze: pon una **alerta de presupuesto** de $10). Registra una app web y copia las 6 claves.
2. **Cloudflare Pages:** Workers & Pages > Create > Pages > Connect to Git > tu repositorio. Comando: `npm run build`. Carpeta de salida: `dist`. Variables: `NODE_VERSION=22` y las seis `VITE_FIREBASE_*`. Guarda y despliega. Al entrar debes ver **Nube activa** en verde (si dice **Modo demo** en naranja, faltan las claves).
3. **Dominios autorizados:** en Firebase > Authentication > Settings > Authorized domains agrega tu dirección de Cloudflare (y tu dominio propio si lo usas).
4. **Reglas de seguridad:** copia `firestore.rules` en Firestore > Rules y `storage.rules` en Storage > Rules, y toca **Publish**. Sin esto la app no funciona y no está protegida.
5. **Correos:** en Authentication > Templates pon el nombre de tu empresa y el idioma español; los invitados a tu equipo deben verificar su correo una vez.
6. **Lista antes de lanzar:** cuenta de prueba, cliente y presupuesto de prueba, abrir el enlace del cliente en **otro teléfono**, enviar una solicitud desde el formulario, revisar que no haya errores rojos en la consola, descargar una copia de seguridad, alerta de presupuesto, restringir la clave de Firebase a tu dominio, y más adelante **App Check** contra spam.
7. **Volver atrás:** en Cloudflare > Deployments elige la última versión buena > **Rollback**. Reglas: Firebase > Rules > History. Datos: Ajustes > Copia de seguridad > restaurar el archivo.
8. Calendario: `workers/README.md`. Cobros de TradeWorks con Stripe: `docs/08-billing-setup.md` (opcional, se hace después).
