# Robot de recordatorios (Cloudflare Worker)

Cada mañana (14:00 UTC = 10 AM hora del Este) revisa todas las empresas que activaron
**Ajustes > Clientes y mensajes > Recordatorios automáticos por correo** y envía por correo los recordatorios elegidos
(depósito, saldo, factura vencida, "mañana empezamos"…), en el idioma de cada cliente y con el enlace de pago.
Cada recordatorio sale **una sola vez** (queda anotado en `companies/{id}/autoemails`). Si el cliente no responde,
a los 3 días vuelve a aparecer en "A quién escribirle hoy" para escribirle por WhatsApp.

Se hace **una sola vez** para toda la plataforma (no una por contratista). Unos 30 minutos.

## 1. Resend (el servicio que envía los correos) — gratis hasta 3,000 correos al mes

1. Crea una cuenta en https://resend.com.
2. **Domains > Add domain**: escribe tu dominio (por ejemplo `lumapaintingservices.com`).
   Resend te muestra 3 o 4 registros DNS; agrégalos donde está tu dominio (si está en Cloudflare: **DNS > Records > Add record**, copia cada uno tal cual).
   Espera a que Resend diga **Verified** (minutos a unas horas).
3. **API Keys > Create API key**, permiso **Sending access**. Copia la clave (empieza con `re_`); solo se muestra una vez.
4. Decide la dirección que envía, en ese dominio: por ejemplo `avisos@lumapaintingservices.com`.
   Los clientes ven el nombre de cada negocio ("Luma Painting") y al responder, la respuesta le llega al correo del negocio.

## 2. La llave de Firebase (cuenta de servicio)

Firebase console > ⚙ **Project settings > Service accounts > Generate new private key** > descarga un archivo `.json`.
Es una llave maestra de tu base de datos: guárdala en un lugar seguro, no la compartas ni la subas a GitHub.
(Si ya la usaste para los cobros de Stripe, `docs/08-billing-setup.md`, es la misma.)

## 3. Publicar el robot

En una terminal, dentro de la carpeta del proyecto:

```bash
cd workers/reminders
npx wrangler login
npx wrangler deploy
```

Luego guarda los secretos (cada comando te pide pegar el valor):

```bash
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RUN_TOKEN
```

- `FIREBASE_SERVICE_ACCOUNT`: pega TODO el contenido del archivo `.json` del paso 2.
- `RESEND_API_KEY`: la clave `re_…` del paso 1.
- `RUN_TOKEN`: inventa una contraseña larga (solo sirve para las pruebas manuales del paso 4).

Y la dirección que envía: en el panel de Cloudflare > **Workers & Pages > tradeworks-reminders > Settings > Variables**,
pon `MAIL_FROM_ADDRESS` = `avisos@tudominio.com` (o escríbela en `wrangler.toml` antes de `npx wrangler deploy`).

## 4. Probar sin enviar nada

```bash
curl -X POST "https://tradeworks-reminders.TU-SUBDOMINIO.workers.dev/run?dry=1" -H "Authorization: Bearer TU_RUN_TOKEN"
```

Muestra, por empresa, qué correos **enviaría** hoy (`dry=1` no envía ni anota nada). Sin `dry=1` los envía de verdad.
`&company=ID` limita la prueba a una sola empresa.

## 5. Activarlo en la app

Cada contratista entra a **Ajustes > Clientes y mensajes > Recordatorios automáticos por correo**, lo enciende y
elige qué recordatorios salen solos. Ahí mismo ve la lista de los últimos correos enviados.

## Notas
- Cuando actives los cobros de TradeWorks (Stripe), cambia `ENFORCE_BILLING` a `"1"`: las cuentas vencidas dejan de recibir envíos.
- Un correo que falla queda como "falló" en la lista y no se reintenta solo (para no mandar duplicados).
- Máximo 20 correos por empresa por día, como seguro contra un error de datos.
- Código: `src/run.ts` (lógica, con pruebas en `src/run.test.ts`), `src/index.ts` (cron, Resend, `/run`),
  y la decisión de qué se envía está en `src/lib/autoEmail.ts` (la misma que usa la app).
