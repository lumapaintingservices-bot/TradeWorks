/**
 * The privacy policy a contractor's CLIENTS see (/privacy/:cid): who the company is, what it collects on the request form, the
 * estimate link, the payment link and messages, how it is used and shared, and the client's choices. Written from the owner's
 * TradeWorks privacy policy draft (2026-10-01), adapted so the company is the business and TradeWorks the tool it uses.
 * Everything it says must stay true to what the app does (data model: docs/04-data-model.md). Have a lawyer review it.
 */
export const CLIENT_PRIVACY_DATE = "2026-10-01";
export const CLIENT_PRIVACY_VERSION = "client-privacy-" + CLIENT_PRIVACY_DATE;

export type PolicyBlock = { p?: string; list?: string[]; table?: { head: string[]; rows: string[][] } };
export type PolicySection = { id: string; title: string; blocks: PolicyBlock[] };
export type PolicyBiz = { name?: string; email?: string; phone?: string; address?: string; website?: string };

/** The client privacy policy for one company, in the client's language. */
export function clientPrivacy(b: PolicyBiz, lang: "en" | "es"): { title: string; sub: string; sections: PolicySection[] } {
  const name = String(b.name || "").trim() || (lang === "es" ? "Nuestra empresa" : "Our company");
  const contact = [name, b.address, b.email, b.phone, b.website].map((x) => String(x || "").trim()).filter(Boolean);
  return lang === "es" ? es(name, contact) : en(name, contact);
}

function en(name: string, contact: string[]): { title: string; sub: string; sections: PolicySection[] } {
  return {
    title: "Privacy Policy",
    sub: `How ${name} handles your information`,
    sections: [
      { id: "who", title: "Who we are", blocks: [
        { p: `${name} (“we”, “us”) is a home-service contractor. This policy explains what information we collect when you ask us for an estimate, open or sign your estimate link, pay an invoice or message us, how we use it, and the choices you have.` },
        { p: "We run our business with TradeWorks, a job-management app. TradeWorks keeps your information for us and uses it only to provide that service to us." },
      ] },
      { id: "collect", title: "Information we collect", blocks: [
        { p: "We collect only what we need to quote and do your project." },
        { table: { head: ["What", "Examples", "Where it comes from"], rows: [
          ["Contact details", "Name, phone, e-mail and the address of the project", "You (request form, estimate)"],
          ["Project details", "What you need done, measurements, photos you send us, your notes and the options you choose", "You"],
          ["Messages", "What you write to us on your estimate link, by e-mail or by text", "You"],
          ["Signature records", "Your name and drawn signature, the date and time, and the IP address and device you signed from", "You, when you sign"],
          ["Payments", "Invoices, amounts and how you told us you paid. Card and bank payments are handled by Stripe: we see the amount and the result, never your full card or bank account number", "You and Stripe"],
          ["Photos of the work", "Before and after photos of your project taken by our team", "Us"],
          ["Visit details", "When you open your estimate or payment link. Like any website, our hosting provider also sees your IP address and browser", "Collected automatically"],
        ] } },
      ] },
      { id: "use", title: "How we use it", blocks: [
        { list: [
          "Prepare your estimate, and keep the contract when you sign it",
          "Schedule and do the work, and send our crew to the right address",
          "Send invoices, payment links and payment reminders",
          "Answer your questions and keep you updated",
          "Keep the records the law requires (contracts, invoices, taxes)",
          "Only with your permission, show photos of the finished work — never with your name or address",
          "Ask you for a review or a referral; you can always ignore it",
        ] },
        { p: "We do not sell your information and we do not use it for advertising." },
      ] },
      { id: "share", title: "Who we share it with", blocks: [
        { list: [
          "Our team members who work on your project: your name, the address and what has to be done — never your payment details",
          "The companies that run the tools we use (below), only so they can provide their service to us",
          "Anyone the law requires, such as a court order",
        ] },
        { table: { head: ["Company", "What it does for us"], rows: [
          ["TradeWorks", "The job-management app where your estimate, invoices and messages are kept"],
          ["Google (Firebase)", "Secure database and file storage"],
          ["Cloudflare", "Hosting and security for the pages you open"],
          ["Stripe", "Card and bank payments, if you choose to pay that way"],
          ["Resend", "Sending our e-mails"],
          ["OpenStreetMap", "Showing the job address on our team's map"],
        ] } },
      ] },
      { id: "cookies", title: "Cookies", blocks: [
        { p: "Our pages don't use advertising cookies or trackers. They only keep small settings in your browser, like your language, so the page works. Stripe may use its own cookies to prevent fraud when you pay by card." },
      ] },
      { id: "keep", title: "How long we keep it", blocks: [
        { p: "We keep your information while we work on your project and afterwards as part of our business records. Signed estimates, contracts and invoices are usually kept for up to 7 years for tax and legal reasons. After that we delete them." },
      ] },
      { id: "security", title: "Security", blocks: [
        { p: "Your information travels encrypted (HTTPS) and is stored with access limited to our company. Your estimate and payment links contain a long secret code: share them only with people you trust. No system is perfect; if a breach affects your information, we will tell you as the law requires." },
      ] },
      { id: "choices", title: "Your choices and rights", blocks: [
        { list: [
          "Ask us for a copy of your information, or to correct it",
          "Ask us to delete it, unless the law requires us to keep it (for example signed contracts and invoices)",
          "Tell us to stop reminders, review requests or other messages — just reply or contact us",
        ] },
        { p: "We answer within 30 days, and we won't treat you differently for asking. We may need to confirm it's you first." },
      ] },
      { id: "esign", title: "Electronic signatures and records", blocks: [
        { p: "When you sign on your estimate link, you agree to sign electronically and to receive your estimate, contract and invoices electronically. Your electronic signature counts the same as a handwritten one. You can open, print or save your signed copy at any time. You can ask us for a paper copy for free, or tell us that you prefer paper from now on." },
      ] },
      { id: "children", title: "Children", blocks: [
        { p: "Our services are for adults. We don't knowingly collect information from children under 13." },
      ] },
      { id: "changes", title: "Changes to this policy", blocks: [
        { p: "If we change this policy, we will update the date at the top. If the change is important, we will let you know." },
      ] },
      { id: "contact", title: "Contact us", blocks: [
        { p: "For questions or requests about your information, contact us:" },
        { list: contact },
      ] },
    ],
  };
}

function es(name: string, contact: string[]): { title: string; sub: string; sections: PolicySection[] } {
  return {
    title: "Política de privacidad",
    sub: `Cómo ${name} maneja su información`,
    sections: [
      { id: "who", title: "Quiénes somos", blocks: [
        { p: `${name} (“nosotros”) es un contratista de servicios para el hogar. Esta política explica qué información recopilamos cuando nos pide un presupuesto, abre o firma el enlace de su presupuesto, paga una factura o nos escribe, cómo la usamos y qué opciones tiene.` },
        { p: "Manejamos nuestro negocio con TradeWorks, una app para administrar trabajos. TradeWorks guarda su información por nosotros y la usa solo para darnos ese servicio." },
      ] },
      { id: "collect", title: "Información que recopilamos", blocks: [
        { p: "Solo recopilamos lo que necesitamos para cotizar y hacer su proyecto." },
        { table: { head: ["Qué", "Ejemplos", "De dónde viene"], rows: [
          ["Datos de contacto", "Nombre, teléfono, correo y la dirección del proyecto", "Usted (formulario, presupuesto)"],
          ["Detalles del proyecto", "Lo que necesita, medidas, fotos que nos envía, sus notas y las opciones que elige", "Usted"],
          ["Mensajes", "Lo que nos escribe en el enlace de su presupuesto, por correo o por mensaje de texto", "Usted"],
          ["Registro de la firma", "Su nombre y su firma dibujada, la fecha y la hora, y la dirección IP y el dispositivo desde donde firmó", "Usted, al firmar"],
          ["Pagos", "Facturas, montos y cómo nos dijo que pagó. Los pagos con tarjeta o banco los maneja Stripe: vemos el monto y el resultado, nunca el número completo de su tarjeta o cuenta", "Usted y Stripe"],
          ["Fotos del trabajo", "Fotos de antes y después de su proyecto tomadas por nuestro equipo", "Nosotros"],
          ["Datos de la visita", "Cuándo abre el enlace de su presupuesto o de pago. Como en cualquier sitio web, nuestro proveedor de hospedaje también ve su dirección IP y su navegador", "Se recopilan solos"],
        ] } },
      ] },
      { id: "use", title: "Cómo la usamos", blocks: [
        { list: [
          "Preparar su presupuesto y guardar el contrato cuando lo firma",
          "Programar y hacer el trabajo, y mandar a nuestro equipo a la dirección correcta",
          "Enviar facturas, enlaces de pago y recordatorios de pago",
          "Responder sus preguntas y mantenerlo al tanto",
          "Guardar los registros que exige la ley (contratos, facturas, impuestos)",
          "Solo con su permiso, mostrar fotos del trabajo terminado — nunca con su nombre ni su dirección",
          "Pedirle una reseña o una recomendación; siempre puede ignorarlo",
        ] },
        { p: "No vendemos su información ni la usamos para publicidad." },
      ] },
      { id: "share", title: "Con quién la compartimos", blocks: [
        { list: [
          "Las personas de nuestro equipo que trabajan en su proyecto: su nombre, la dirección y lo que hay que hacer — nunca sus datos de pago",
          "Las empresas que hacen funcionar las herramientas que usamos (abajo), solo para que nos den su servicio",
          "A quien la ley nos obligue, por ejemplo por orden de un juez",
        ] },
        { table: { head: ["Empresa", "Qué hace por nosotros"], rows: [
          ["TradeWorks", "La app donde se guardan su presupuesto, sus facturas y sus mensajes"],
          ["Google (Firebase)", "Base de datos y archivos guardados de forma segura"],
          ["Cloudflare", "Hospedaje y seguridad de las páginas que usted abre"],
          ["Stripe", "Pagos con tarjeta o banco, si elige pagar así"],
          ["Resend", "Envío de nuestros correos"],
          ["OpenStreetMap", "Mostrar la dirección del trabajo en el mapa de nuestro equipo"],
        ] } },
      ] },
      { id: "cookies", title: "Cookies", blocks: [
        { p: "Nuestras páginas no usan cookies de publicidad ni rastreadores. Solo guardan pequeños ajustes en su navegador, como el idioma, para que la página funcione. Stripe puede usar sus propias cookies para evitar fraudes cuando paga con tarjeta." },
      ] },
      { id: "keep", title: "Cuánto tiempo la guardamos", blocks: [
        { p: "Guardamos su información mientras trabajamos en su proyecto y después como parte de los registros de nuestro negocio. Los presupuestos firmados, contratos y facturas normalmente se guardan hasta 7 años por razones de impuestos y legales. Después los borramos." },
      ] },
      { id: "security", title: "Seguridad", blocks: [
        { p: "Su información viaja cifrada (HTTPS) y se guarda con acceso limitado a nuestra empresa. Los enlaces de su presupuesto y de pago tienen un código secreto largo: compártalos solo con personas de confianza. Ningún sistema es perfecto; si una filtración afecta su información, le avisaremos como lo exige la ley." },
      ] },
      { id: "choices", title: "Sus opciones y derechos", blocks: [
        { list: [
          "Pedirnos una copia de su información, o que la corrijamos",
          "Pedirnos que la borremos, salvo lo que la ley nos obliga a guardar (por ejemplo contratos firmados y facturas)",
          "Pedirnos que dejemos de enviarle recordatorios, pedidos de reseña u otros mensajes — solo responda o contáctenos",
        ] },
        { p: "Respondemos en un máximo de 30 días y no lo trataremos distinto por pedirlo. Puede que primero necesitemos confirmar que es usted." },
      ] },
      { id: "esign", title: "Firmas y documentos electrónicos", blocks: [
        { p: "Cuando firma en el enlace de su presupuesto, acepta firmar en forma electrónica y recibir su presupuesto, contrato y facturas en forma electrónica. Su firma electrónica vale igual que una firma a mano. Puede abrir, imprimir o guardar su copia firmada cuando quiera. Puede pedirnos una copia en papel sin costo, o decirnos que desde ahora prefiere papel." },
      ] },
      { id: "children", title: "Menores de edad", blocks: [
        { p: "Nuestros servicios son para adultos. No recopilamos a sabiendas información de menores de 13 años." },
      ] },
      { id: "changes", title: "Cambios a esta política", blocks: [
        { p: "Si cambiamos esta política, actualizaremos la fecha de arriba. Si el cambio es importante, se lo haremos saber." },
      ] },
      { id: "contact", title: "Contáctenos", blocks: [
        { p: "Para preguntas o pedidos sobre su información, contáctenos:" },
        { list: contact },
      ] },
    ],
  };
}

/** Link to a company's client privacy policy. */
export const privacyPath = (cid: string, lang?: "en" | "es") => `/privacy/${encodeURIComponent(cid)}${lang ? "?lang=" + lang : ""}`;
