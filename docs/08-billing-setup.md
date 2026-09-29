# 08 - Billing setup (TradeWorks subscription with Stripe)

This is about how **contractors pay TradeWorks** (a monthly subscription through Stripe).
It is NOT about how your clients pay you. Client deposits stay a Zelle box that is only displayed.

The feature is **off** until you finish this guide. While `VITE_BILLING_API` is empty:
- Settings shows "Billing isn't set up yet",
- no banner appears,
- nothing is ever locked and nothing is charged.

You can stop after any step and the app keeps working.

---

## 1. How it works (short)

1. A new company gets a **14-day free trial**.
2. The owner opens **Settings > Plan & billing** and taps **Subscribe**. The app asks our small server (a Cloudflare Pages Function in the `/functions` folder) for a Stripe Checkout page and sends the owner there.
3. The owner pays on Stripe's own page. Stripe tells our server (a **webhook**), and the server writes the result on the company (`plan`, `subscriptionStatus`, `currentPeriodEnd`...).
4. The app reads those fields and decides what to show (`src/lib/billing.ts`).

| Situation | What the app does |
|---|---|
| Trial, more than 3 days left | Nothing shown except in Settings |
| Trial, 3 days or fewer left | Yellow banner on top (can be closed for the visit) |
| Paid and active | Nothing |
| Payment failed (`past_due`) | 7-day **grace**: everything still works, yellow banner "update your card" |
| Trial ended, subscription canceled, or grace over | **Read-only**: red banner. Everybody can still open and view everything. **Nothing is ever deleted.** Subscribing again unlocks it. |

Files: `functions/api/billing/checkout.js`, `portal.js`, `webhook.js` (helpers in `functions/_lib/`), `src/lib/billing.ts`, `src/pages/settings/BillingCard.tsx`, `src/components/BillingBanner.tsx`.

---

## 2. Every setting (environment variables)

Set these in **Cloudflare Pages** (step 6). "Secret" means choose the type **Secret** so nobody can read it back.

| Name | Secret? | Example | What it is |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | yes | `sk_test_51Abc...` | Stripe > Developers > API keys > **Secret key**. Starts with `sk_test_` (practice) or `sk_live_` (real money). |
| `STRIPE_PRICE_ID` | no | `price_1Abc...` | The monthly price you create in step 3. |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_...` | Signing secret of the webhook you create in step 7. |
| `FIREBASE_SERVICE_ACCOUNT` | yes | `{ "type": "service_account", ... }` | The **whole** JSON file from step 5, pasted as text. |
| `FIREBASE_PROJECT_ID` | no | `tradeworks-app` | Optional. Your Firebase project id. If empty, it is read from the JSON above. |
| `APP_URL` | no | `https://app.yourdomain.com` | Optional but recommended. The address of your site (no slash at the end). Stripe sends people back here. If empty, the address the request came from is used. |
| `ALLOWED_ORIGIN` | no | `https://app.yourdomain.com` | Optional. Only needed if the app and the functions are on DIFFERENT websites. Normally leave empty. |
| `VITE_BILLING_API` | no | `/api/billing` | **Turns the feature on in the app.** Use `/api/billing` when the functions are on the same site. It is read when the site is built, so **redeploy after changing it**. Leave empty to keep billing off. |

Never put keys in the code, in Git, or in `.env` files that are committed.

---

## 3. Stripe: create your account, the product and the price

1. Go to https://dashboard.stripe.com/register and create an account. Confirm your email.
2. Stay in **Test mode** (the switch at the top right of the Stripe dashboard says "Test mode"). You practice with fake cards first. No real money moves.
3. In the left menu open **Product catalogue** (older name: **Products**) and click **Add product**.
4. Name: `TradeWorks Pro`. Under **Pricing** choose **Recurring**, type the monthly amount (for example `29.00`, currency USD) and choose **Monthly**. Click **Add product** / **Save product**.
5. Open the product you just made. In the **Pricing** box find the **Price ID** (it starts with `price_`). Click the copy icon. Keep it for step 6 (`STRIPE_PRICE_ID`).

## 4. Stripe: API key and customer portal

1. Left menu **Developers** > **API keys**. Under **Standard keys** find **Secret key** and click **Reveal test key**. Copy it (starts with `sk_test_`). This is `STRIPE_SECRET_KEY`. Do not send it by WhatsApp or email.
2. Open https://dashboard.stripe.com/test/settings/billing/portal (Settings > Billing > **Customer portal**). Turn on: **Update payment method**, **Cancel subscription**, **Invoice history**. Click **Save changes**. This is the page the "Manage billing" button opens.

## 5. Firebase: create the service account (lets the server update companies)

1. Open https://console.firebase.google.com and pick your TradeWorks project.
2. Click the **gear** next to "Project Overview" > **Project settings** > tab **Service accounts**.
3. Click **Generate new private key** > **Generate key**. A `.json` file downloads.
4. Open that file with any text editor (Notepad, TextEdit). Select ALL the text and copy it. This is `FIREBASE_SERVICE_ACCOUNT`.
5. Keep the file somewhere private; delete it from Downloads after step 6. Anyone who has it has full access to your database. If it ever leaks: Project settings > Service accounts > Manage service account permissions > delete the key, and make a new one.

## 6. Cloudflare Pages: add the settings and deploy

The `/functions` folder is deployed automatically together with the site when your Cloudflare Pages project is connected to the GitHub repository. No extra step.

1. Sign in at https://dash.cloudflare.com > **Workers & Pages** > click your TradeWorks project.
2. **Settings** > **Variables and Secrets** (older name: **Environment variables**) > **Add**.
3. Add each row of the table in section 2 (one at a time: Name, Value). For `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `FIREBASE_SERVICE_ACCOUNT` choose type **Secret**. Add them for **Production** (and **Preview** if you test there).
   - `STRIPE_WEBHOOK_SECRET` does not exist yet; come back after step 7.
   - `FIREBASE_SERVICE_ACCOUNT`: paste the whole JSON text.
   - `VITE_BILLING_API`: type `/api/billing`.
4. **Deployments** tab > the three dots on the latest deployment > **Retry deployment** (or push any small change to GitHub). Variables only apply to new deployments.
5. Check the server answers: open `https://YOUR-SITE/api/billing/checkout` in the browser. You should see `{"error":"Method not allowed"}`. That means the function is alive.

## 7. Stripe: create the webhook (how Stripe tells us "paid")

1. Stripe > **Developers** > **Webhooks** > **Add endpoint** (older: "Add an endpoint").
2. **Endpoint URL**: `https://YOUR-SITE/api/billing/webhook` (your real site address).
3. **Select events** and tick exactly these four:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Click **Add endpoint**. Open it and under **Signing secret** click **Reveal**. Copy it (starts with `whsec_`).
5. Back in Cloudflare (step 6.3) add `STRIPE_WEBHOOK_SECRET` = that value (type Secret), then **Retry deployment** again.

## 8. Firebase: protect the billing fields (important)

Without this, a technical user could give themselves "pro" from the browser. In the repository's `firestore.rules`, inside `match /companies/{cid}`:

```
// helper (put next to the other functions at the top)
function billingUntouched() {
  return !request.resource.data.diff(resource.data).affectedKeys()
    .hasAny(['plan', 'subscriptionStatus', 'stripeCustomerId', 'stripeSubscriptionId',
             'trialEndsAt', 'currentPeriodEnd', 'pastDueSince', 'stripeEventAt']);
}

// create: a new company may only start as a trial that ends within 15 days
allow create: if signedIn() && request.resource.data.ownerUid == request.auth.uid
  /* ...existing conditions... */
  && !request.resource.data.keys().hasAny(['subscriptionStatus', 'stripeCustomerId', 'stripeSubscriptionId', 'currentPeriodEnd', 'pastDueSince', 'stripeEventAt'])
  && request.resource.data.get('plan', 'trial') == 'trial'
  && (!('trialEndsAt' in request.resource.data)
      || (request.resource.data.trialEndsAt is timestamp
          && request.resource.data.trialEndsAt <= request.time + duration.value(15, 'd')));

// update: add   && billingUntouched()   to the existing conditions
```

Then copy the whole file into Firebase console > Firestore Database > **Rules** > **Publish**. (The server uses the service account, which is not affected by these rules.)

Also, the app must not write the billing fields back when the owner edits the company profile (see "Notes for developers" at the end).

## 9. Test with fake money

1. Sign in as the owner. Open **Settings > Plan & billing**. You should see "Free trial - 14 days left" and a **Subscribe** button.
2. Tap **Subscribe**. On Stripe's page use the test card `4242 4242 4242 4242`, any future date, any 3 digits, any name/ZIP. Pay.
3. You come back to Settings. Tap **Refresh** if it still shows the trial. It should say **Pro · active** with a renewal date, and **Manage billing** appears.
4. Tap **Manage billing**: Stripe's portal opens (change card, see invoices, cancel).
5. Test a failed payment: in the portal change the card to `4000 0000 0000 0341` (it saves but the next charge fails), or in Stripe use the **Test clocks** tool to move time forward. After the failed charge the company shows "Payment problem - 7 days to fix it".
6. If something does not change, open Stripe > Developers > Webhooks > your endpoint > **Event deliveries** and look at the answer (see Troubleshooting).

## 10. Go live (real money)

1. In Stripe finish **Activate your account** (business details, bank account).
2. Switch the dashboard to **Live mode** (turn off Test mode) and repeat: step 3 (product + price, new `price_...`), step 4 (live secret key `sk_live_...` and Customer portal in live mode), step 7 (a NEW webhook with the same URL and four events; new `whsec_...`).
3. In Cloudflare replace `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` with the live values and **Retry deployment**.
4. Do one real subscription yourself and refund it in Stripe if you want.

Test-mode companies keep test customer ids. If you switch to live later, clear `stripeCustomerId`, `stripeSubscriptionId`, `plan`, `subscriptionStatus` on the test companies (Firebase console > Firestore > companies), or they will point to customers that do not exist in live mode.

## 11. Troubleshooting

| You see | Likely cause and fix |
|---|---|
| Settings says "Billing isn't set up yet" | `VITE_BILLING_API` is empty or the site was not redeployed after adding it. |
| "We could not open the payment page" | Open the browser address `https://YOUR-SITE/api/billing/checkout`. If it is a 404 the `/functions` folder is not deployed. If the app answers 503 "Billing isn't set up yet", one of `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `FIREBASE_SERVICE_ACCOUNT` is missing (Cloudflare > your project > Functions > **Real-time logs** shows which). |
| "Only the owner of the company can manage billing" | You are signed in as admin or worker. Only the owner can subscribe. |
| Paid, but the app still shows the trial | The webhook did not arrive. Stripe > Webhooks > Event deliveries. **400 Invalid signature** = wrong `STRIPE_WEBHOOK_SECRET` (test and live have different ones). **500** = the Firebase key is wrong or lacks access; Stripe retries automatically for 3 days. **404** = wrong URL. |
| Webhook says `"handled": false, "reason": "company_not_found"` | The payment was made outside the app. Only payments started with the Subscribe button carry the company id. |
| The owner must sign out and in | Their login expired; the message says so. |

## 12. Safety notes

- The server checks three things on every call: the Firebase login is genuine (signature, expiry, audience and issuer), the person is the **owner** of that company (`companies/{id}/members/{uid}.role == "owner"`), and the company id is a plain id (no paths).
- Stripe webhooks are accepted only with a valid signature (HMAC SHA-256, constant-time comparison, 5-minute tolerance), and older events never overwrite newer ones.
- Expired accounts are read-only, never deleted. Data export (Settings > Backup) keeps working.
- Card numbers never touch TradeWorks; Stripe handles them.

## 13. Notes for developers

- Company fields (all optional; see `src/auth/types.ts`): `plan` ('trial' | 'pro'), `subscriptionStatus`, `stripeCustomerId`, `stripeSubscriptionId`, `trialEndsAt`, `currentPeriodEnd`, `pastDueSince`. The webhook also writes `stripeEventAt` (unix seconds of the last applied event; server only).
- New companies: write `trialEndsAt = now + 14 days` in `saveCompany` when creating (Firestore: a `Timestamp`, demo: ISO string). If it is missing, `billingState` falls back to `createdAt + 14 days`, and to "never locked" when there is no date at all.
- **Do not send billing fields on company updates.** `stripCompany()` in `src/auth/backend.ts` must also drop `plan, subscriptionStatus, stripeCustomerId, stripeSubscriptionId, trialEndsAt, currentPeriodEnd, pastDueSince, stripeEventAt`; otherwise a stale copy in the browser can overwrite what the webhook wrote.
- Tests: `npx vitest run functions src/lib/billing.test.ts` (signature vectors, JWT sign/verify with generated RSA keys, service-account token exchange, Firestore REST shapes, webhook event mapping, the three handlers with fakes).
- Local run of the functions: `npx vite build && npx wrangler pages dev dist` with a `.dev.vars` file containing the variables of section 2 (never commit it). Forward Stripe events with `stripe listen --forward-to localhost:8788/api/billing/webhook`.

---

## Resumen en español

**Qué es:** así cobra TradeWorks a los contratistas (suscripción mensual con Stripe). No tiene que ver con Zelle de tus clientes.

**Cómo funciona:** cada empresa nueva tiene 14 días gratis. Si no se suscribe, la app queda en **solo lectura** (se puede ver todo, no se pierde nada). Si un pago falla, hay 7 días de gracia con todo funcionando y un aviso amarillo.

**Pasos (una sola vez):**
1. Crea tu cuenta en stripe.com y déjala en **modo de prueba**.
2. Crea el producto "TradeWorks Pro" con precio mensual y copia el **Price ID** (`price_...`).
3. En Developers > API keys copia la **Secret key** (`sk_test_...`). En Settings > Billing > Customer portal activa cambiar tarjeta, cancelar y facturas.
4. En Firebase > Configuración del proyecto > Cuentas de servicio > **Generar nueva clave privada**. Abre el archivo y copia TODO el texto.
5. En Cloudflare > Workers & Pages > tu proyecto > Settings > Variables and Secrets agrega: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `FIREBASE_SERVICE_ACCOUNT`, `APP_URL` y `VITE_BILLING_API` = `/api/billing`. Vuelve a desplegar (Retry deployment).
6. En Stripe > Developers > Webhooks > Add endpoint: URL `https://TU-SITIO/api/billing/webhook`, eventos `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Copia el **Signing secret** (`whsec_...`), agrégalo en Cloudflare como `STRIPE_WEBHOOK_SECRET` y despliega otra vez.
7. Publica las reglas de Firestore actualizadas (sección 8) para que nadie pueda darse el plan "pro" a sí mismo.
8. Prueba con la tarjeta `4242 4242 4242 4242` (cualquier fecha futura y CVC). En Ajustes > Plan y facturación debe decir "Pro · activo".
9. Para cobrar de verdad: apaga el modo de prueba en Stripe, repite los pasos 2, 3 y 6 con las claves reales y reemplaza las variables en Cloudflare.

**Si algo falla:** revisa Stripe > Developers > Webhooks > Event deliveries. "400" = `STRIPE_WEBHOOK_SECRET` incorrecto; "500" = clave de Firebase incorrecta; "404" = URL incorrecta. Mientras `VITE_BILLING_API` esté vacío, la app dice "La facturación aún no está configurada" y no bloquea nada.
