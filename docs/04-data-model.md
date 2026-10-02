# 04 · Data model (Firestore, multi-tenant)

The prototype stores one business per account (users/{uid}/...). TradeWorks must support many companies,
and one user in several companies (e.g. a painter + a cleaning LLC). Everything company-owned lives under
companies/{companyId}. Field names below come from the prototype so logic can be ported 1:1.

```
admins/{uid}                         { note }  TradeWorks platform admins: only they create companies (added by hand in the Firebase console; nobody writes it from the app)
users/{uid}                          { name, email, lang, theme, companies:[companyId], activeCompanyId, avatar?: {url, path} | 'none' }  (avatar: own profile photo; 'none' hides the Google photo)
companies/{companyId}                { name, legalName, phone, email, website, area, services, servicesEs,
                                       logoUrl, brandColor, trade, plan, ownerUid, createdAt,
                                       stripeAccountId, stripeReady, stripeDetails, stripeCheckedAt,   Stripe Connect fields: server only (docs/10)
                                       trackLocation }   save workers' phone location at clock-in/out (team map, src/lib/geo.ts)
companies/{cid}/members/{uid}        { role:'owner'|'admin'|'worker', workerId? }
companies/{cid}/settings/main        { pricing, payment, tax, discounts[], numbering{nextEst,nextInv},
                                       processDays, scope{en[],es[]}, terms{en[],es[]}, typePresets{interior,exterior,other}, measures{[jobType]: serviceId[]} (src/lib/measures.ts),
                                       templates[], jobTemplates[], leadSources[], production, services[],
                                       followUpDays, websiteUrl, instagramUrl, reviewUrl, portalUrl,
                                       payZelle, payZelleName, payNote, payMethods[] (chips), payHandles{venmo,cashapp,paypal,checkTo},
                                       autoEmail{on,kinds[]}, invoiceDueDays, referral{on,amount,rewardEn,rewardEs}, cardPay{on},
                                       goal{sales}, dashCards[],
                                       recurring[], bankRules[], expCats[], calOn, calToken, showcase[] }
companies/{cid}/clients/{id}         { name, phone, email, address, source, lang, note, lead, archived, archivedAt, noAutoEmail (asked to stop automatic e-mails),
                                       createdAt, photos[], referredBy, refReward{amount,paidAt,method,expenseId}, web{service,city,message,heard,details} }
companies/{cid}/estimates/{id}       { number, date, validDays, status, clientId, clientName, phone, email, address,
                                       docLang, jobType, doors, drawers, frames, boxes, frameMode, boxMode, spec, specEs,
                                       items[{id,desc,descEs,qty,unit,rate,hidden,svc}], upgrades[{id,desc,descEs,price|qty,rate,included,byClient}],
                                       discountMode, discountCode, discountPct, discountAmt, taxEnabled, taxRate,
                                       depositPct, payPlanOn, payPlan[], days, startDate, leadSource,
                                       scopeEn, scopeEs, termsEn, termsEs, notes, crewNotes,
                                       materialsMode, materialsList[], showMaterials, matBuyer, laborMode, extraHrs,
                                       expenses[] (legacy receipts), photos[{id,kind,caption,inWork}], showPhotos, photoOk (client allows "Our recent work"),
                                       signature{name,img,date,via,at}, sentAt, portal{token}, portalViews[], portalSeen{},
                                       activity[], chat[], changeOrders[], check{key:iso}, jobTasks[{id,day,text}],
                                       colors[{area,brand,color,sheen,code}], payClaim, reviewAsked, warrantyChecked, snooze{},
                                       geo{q,lat?,lng?} (job site position for the team map; looked up once per address with OpenStreetMap Nominatim) }
companies/{cid}/invoices/{id}        { number, estId, kind:'deposit'|'balance'|'full'|'progress'|'co', amount, date, status, paidDate, paidMethod,
                                       pay{token}, payViews, payClaim{method,at,note}, payClaimSeen,
                                       online{status:paid|processing|failed,amount,at,session,method,dup,seen} (Stripe webhook) }
companies/{cid}/tasks/{id}           { title, date, time, note, estId, jobLabel ("EST-1001 · Ana Ruiz", for workers), workerId, done }
estimate.assign                      { checklist key: [workerId] }  who does each Job day line (Job day tab "Whole crew" picker, Team > Assign work)
settings.crewLang                    "es" (default) | "en": language of the job checklist for the crew AND the Job day tab
companies/{cid}/notes/{id}           { title, text, col (settings.noteCols id), order (number, fractional for drag & drop), prio (high|med|low|""), due?, estId?, jobLabel?, workerId?, by }  owners / admins only
companies/{cid}/workers/{id}         { name, phone, role, rate, active, email?, photo?: {url, path} | null }  (photo file: companies/{cid}/avatars/{workerId}/; the worker may change only photo)
                                     email = where Team > worker sent the app invitation (invites/{email} with workerId = this record)
companies/{cid}/hours/{id}           { workerId, date, hours, rate, estId, jobLabel?, taskId?, taskTitle? (the task the clock ran for), note, start?, end? (ISO clock-in/out times), inLoc?, outLoc? }
companies/{cid}/payouts/{id}         { workerId, date, amount, method, note }
companies/{cid}/expenses/{id}        { date, vendor, amount, category, source, method, note, estId, receiptPath,
                                       recurId, bankFp, bankDesc }
companies/{cid}/clock/{workerId}     { at, estId, jobLabel?, taskId, taskTitle (always one task), loc?, last? }   loc/last = { lat, lng, acc(m), at } from the worker's phone
companies/{cid}/crewjobs/{estId}     { estId, jobLabel, crew: [workerId], crewNames, start, days, address, client, note,
                                       checklist: [{ key, day, text }], titles, colors, done: { key: ISO }, doneBy: { key: name },
                                       assign: { key: [workerId] } }
                                     the crew's copy of a job (no prices), written by the owner's app from estimate.crew /
                                     crewNote / assign (src/data/crew.ts useCrewSync); workers tick done/doneBy, mirrored into estimate.check.
                                     Checklist = checklistFor(e, settings.crewLang || "es"): the Job day tab shows the SAME list, so keys
                                     (ticks, who does what) match on both sides. assign = who does each line; a line nobody has is for the
                                     whole crew (src/lib/crew.ts isForWorker). A worker's work = their tasks + their lines (src/lib/work.ts):
                                     the clock runs for one of them (clock.taskId = task id or "c:{estId}:{key}").
companies/{cid}/jobchats/{estId}     { estId, jobLabel, members: [workerId], closed?, last?: { by, name, text, at } }
                                     team chat of one job: owners / admins + the workers in members (src/lib/teamChat.ts)
companies/{cid}/jobchats/{estId}/msgs/{id}  { by ("u:{uid}" owner/admin | "w:{workerId}"), name, text (<= 2000), at, photo?: { url, path, kind? } }
                                     chat photos: workers in companies/{cid}/jobphotos/{workerId}/, owners in companies/{cid}/chats/{chatId}/;
                                     a worker's new job photo is also posted to the job chat (kind = before/after/detail)
                                     read state is per device and person (localStorage tw.chatSeen.{cid}.{me})
companies/{cid}/jobphotos/{id}       { workerId, estId, jobLabel, kind (before|after|detail), caption, url, path, date, at, size }
                                     a photo a worker took (Team > Job photos); file at companies/{cid}/jobphotos/{workerId}/{id}.jpg.
                                     The owner's app copies it onto the job: estimate.photos[] gets { id, kind, caption, url, path,
                                     teamId (= this id), by (worker name), at } (src/data/teamPhotos.ts, src/lib/jobPhotos.ts)
companies/{cid}/autoemails/{itemId}  { item, kind, estId, invId, to, subject, status:'sending'|'sent'|'failed', sentAt, error }  written ONLY by workers/reminders

portal/{token}                       { owner(cid), estId, data (snapshot JSON), updatedAt, client:{ views[], picks{}, sign{}, chat[], paid{}, co{} } }
portal/{token}/photos/{id}           { owner, data }
portal/{token}/signed/{id}           the copy of exactly what the client signed, written ONLY by functions/api/portal/sign.js (service account):
                                     { kind est|co, coId?, coN?, name, img, at (server time), amount, picks, data (the published snapshot),
                                       hash (SHA-256), ip, ua, tz, lang, number, owner, estId, emailedTo?, emailedAt? }; id est-{ms} / co-{coId}-{ms}.
                                     client.sign / client.coSign.{id} = { name, img, at, server: true, copy: id (+ total) }, also written by the server.
                                     Public page /p/:token/signed/:id (src/pages/public/SignedCopy.tsx); the estimate keeps signature.copy / co.sigCopy.
paylink/{token}                      { owner(cid), invId, data (PayModel JSON: invoice lines/totals EN+ES, branding, ways to pay), updatedAt,
                                       client:{ views[], paid{method,at,note}|null }, online{status,at,amount,method} (Stripe webhook only) }
                                                                            invoice payment link /pay/:token (src/lib/paylink.ts)
leads/{id}                           { owner(cid), name, phone, email, city, address, service, message, heard, lang,
                                       photos[pid], details{v,types[],cab{},intr{},ext{},other,tierCab,tierWall,when,date,contact,src,ref}, at, page, imported }
leads/{id}/photos/{pid}              { data, at }
public/{companyId}                   { name, phone, email, address, website, area, trade, logoUrl, brandColor }  (request form, /privacy/:cid contact)
calfeed/{token}                      { owner, ics, updatedAt }
showcase/{companyId}/items/{id}      { url, caption, at }
```
Notes
- Photos/receipts/logos → **Firebase Storage** (companies/{cid}/photos/..., receipts/...), store paths not base64.
- Snapshot for the client link strips private fields (PORTAL_STRIP in prototype).
- Use server timestamps; keep `updatedAt` for conflict resolution (last write wins).
- Tombstones: prototype writes {deleted:true}; in React prefer real deletes + Firestore offline cache.
