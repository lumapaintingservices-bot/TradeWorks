# 10 - Pagos con tarjeta y banco en las facturas (Stripe Connect)

Esta guía explica cómo **los clientes de cada contratista pagan sus facturas con tarjeta o banco**.
No tiene nada que ver con la suscripción que los contratistas le pagan a TradeWorks: eso está en `docs/08-billing-setup.md`.

La función está **apagada** hasta que termines esta guía. Mientras falten las claves:
- en Ajustes, el botón "Conectar Stripe" muestra "Los pagos con tarjeta todavía no están activados";
- el enlace de pago de cada factura sigue igual: Zelle, Venmo, Cash App, PayPal, cheque y efectivo.

---

## 1. Cómo funciona

1. El dueño de cada empresa abre **Ajustes > Enlace del cliente y pagos > Pagos con tarjeta y banco** y toca **Conectar Stripe**.
   Stripe le pide los datos de su negocio y su cuenta de banco, y crea para él **su propia cuenta de Stripe**
   (con el sistema nuevo de Stripe, "Accounts v2", con panel completo de Stripe). El contratista entra a esa cuenta en dashboard.stripe.com con su propio correo.
2. Desde ese momento, el enlace de pago de cada factura (`/pay/...`) muestra un botón grande:
   **"Pagar $X con tarjeta o banco"**.
3. El cliente toca el botón y paga en la página segura de Stripe (tarjeta, Apple Pay o Google Pay, o su banco si el contratista lo activó).
   El monto es siempre el de la factura: el cliente no lo puede cambiar.
4. Stripe avisa a TradeWorks (un **webhook**) y TradeWorks:
   - marca la factura **Pagada**, con método "Card (Stripe)" o "Bank (Stripe)";
   - cambia el trabajo a "Depósito pagado" o "Pagado completo", igual que si lo marcaras tú;
   - le avisa al dueño en la app ("Ana pagó INV-1001 en línea ✓").
5. Un pago por banco tarda de 3 a 5 días hábiles. Mientras tanto la factura dice **"Pago bancario en camino"**, y se marca pagada cuando llega.

**El dinero va directo a la cuenta de Stripe del contratista** y de ahí a su banco. TradeWorks nunca toca el dinero.
Stripe le cobra su comisión al contratista (en EE. UU., aprox. 2.9% + 30¢ por tarjeta y 0.8% hasta $5 por banco).

Casos especiales (TradeWorks los maneja solo):

| Qué pasó | Qué hace TradeWorks |
|---|---|
| El monto de la factura cambió después de que el cliente abrió la página de pago | No la marca pagada. Aparece "Confirmar el pago" con el monto pagado, para que tú decidas. |
| El cliente pagó con tarjeta una factura que ya estaba pagada | La marca "Pagada dos veces". Puedes devolverle el dinero desde tu Stripe. |
| Falló un pago por banco | La factura sigue sin pagar y el cliente ve que puede intentar otra vez. |

Archivos: `functions/api/connect/start.js`, `status.js`, `functions/api/pay/checkout.js`, `webhook.js`,
`functions/_lib/connect.js` (la lógica; pruebas en `connect.test.js`), `src/pages/settings/CardPayCard.tsx`,
`src/pages/public/PayPage.tsx`.

---

## 2. Las claves (variables de Cloudflare Pages, proyecto `tradeworks-app`)

| Nombre | ¿Secreto? | Qué es |
|---|---|---|
| `STRIPE_SECRET_KEY` | sí | Stripe > Developers > API keys > **Secret key** (empieza con `sk_test_` para practicar, `sk_live_` para dinero real). Es la misma que usa la suscripción (docs/08). |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | sí | La clave del webhook del paso 4 (empieza con `whsec_`). |
| `FIREBASE_SERVICE_ACCOUNT` | sí | El mismo archivo JSON que ya usa el robot de recordatorios. |
| `APP_URL` | no | `https://tradeworks-app.pages.dev` (a donde Stripe regresa al cliente). |
| `STRIPE_APP_FEE_PCT` | no | Opcional. Un % que TradeWorks se queda de cada pago (por ejemplo `1`). Vacío = nada. Máximo 10. |

Nunca pongas estas claves en el código, en Git ni en el chat.

---

## 3. Stripe: activar Connect (una sola vez)

1. Entra a https://dashboard.stripe.com con tu cuenta (la de TradeWorks).
2. Deja el interruptor **Test mode / Modo de prueba** encendido (arriba a la derecha) para practicar sin dinero real.
3. En el menú de la izquierda busca **Connect** y toca **Get started / Comenzar**.
4. Cuando pregunte cómo fluyen los pagos, elige **"Your merchants collect payments directly"**
   (el contratista cobra directo, tiene su propio panel de Stripe y Stripe le cobra su comisión a él).
   No hace falta activar "Accounts v1 support": TradeWorks usa Accounts v2.
5. Completa el **perfil de la plataforma** que te pide Stripe (qué hace TradeWorks: software para contratistas; quién cobra: cada contratista a sus clientes).

---

## 4. Stripe: el webhook de Connect

1. Stripe > **Developers > Webhooks** > **Add endpoint / Agregar destino**.
2. En "Escuchar eventos de" elige **Connected accounts / Cuentas conectadas** (¡no "Your account"!).
3. URL: `https://tradeworks-app.pages.dev/api/pay/webhook`
4. Eventos (5):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `account.updated`
   - `account.application.deauthorized`
5. Guarda. Abre el webhook y copia la **Signing secret** (`whsec_...`). Es `STRIPE_CONNECT_WEBHOOK_SECRET`.

---

## 5. Guardar las claves en Cloudflare (PowerShell)

Abre PowerShell en la carpeta del proyecto (`cd "D:\Luma Claude\TradeWorks-app"`) y corre **una línea a la vez**.
Cada comando te pide pegar el valor (no se ve en pantalla) y Enter:

```
npx.cmd wrangler pages secret put STRIPE_SECRET_KEY --project-name tradeworks-app
npx.cmd wrangler pages secret put STRIPE_CONNECT_WEBHOOK_SECRET --project-name tradeworks-app
```

El archivo de Firebase va así (cambia la ruta si lo moviste):

```
Get-Content "D:\New folder (2)\tradeworks-99ba7-firebase-adminsdk-fbsvc-8e3a13eee0.json" -Raw | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 5 | npx.cmd wrangler pages secret put FIREBASE_SERVICE_ACCOUNT --project-name tradeworks-app
```

`APP_URL` va en Cloudflare > Workers & Pages > **tradeworks-app** > Settings > **Variables and secrets** > Add > tipo **Text**,
valor `https://tradeworks-app.pages.dev`.

Las claves nuevas se usan en el **siguiente despliegue** (cuando se une un PR, o "Retry deployment" en Cloudflare).

---

## 6. Reglas de Firestore

Publica las reglas nuevas (`firestore.rules`): protegen la cuenta de Stripe de cada empresa para que nadie la cambie
desde el navegador. Firebase console > Firestore > **Rules** > pega el archivo > **Publish**.

---

## 7. Probar (modo de prueba, sin dinero real)

1. En la app: **Ajustes > Enlace del cliente y pagos > Conectar Stripe**.
   En la página de Stripe (modo prueba) puedes usar datos de prueba: teléfono `000 000 0000`, código SMS `000000`,
   banco con routing `110000000` y cuenta `000123456789`.
2. Al volver, la tarjeta debe decir **Conectado**.
3. Abre una factura > **Enlace de pago** > ábrelo en otra pestaña > **Pagar con tarjeta o banco**.
4. Tarjeta de prueba `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC y código postal.
5. Regresas al enlace ("¡Gracias! Estamos confirmando su pago…") y en unos segundos dice **Pagada**.
   En la app, la factura aparece pagada con "Card (Stripe)".

Si no se marca pagada: Stripe > Developers > Webhooks > tu webhook > mira si el evento dice error (400 = la clave
`STRIPE_CONNECT_WEBHOOK_SECRET` no coincide; 503 = falta una clave en Cloudflare).

---

## 8. Pasar a dinero real

1. En Stripe apaga **Test mode** y repite los pasos 3 y 4 en modo real (Connect y el webhook son aparte en cada modo).
2. Cambia `STRIPE_SECRET_KEY` (ahora `sk_live_...`) y `STRIPE_CONNECT_WEBHOOK_SECRET` (el del webhook real) con el paso 5.
3. Vuelve a desplegar. Cada contratista que conectó una cuenta de prueba verá **"Falta terminar"**: toca
   **Terminar en Stripe** y TradeWorks le crea su cuenta real (la de prueba se reemplaza sola).
