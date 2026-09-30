# 04 · Data model (Firestore, multi-tenant)

The prototype stores one business per account (users/{uid}/...). TradeWorks must support many companies,
and one user in several companies (e.g. a painter + a cleaning LLC). Everything company-owned lives under
companies/{companyId}. Field names below come from the prototype so logic can be ported 1:1.

```
users/{uid}                          { name, email, lang, theme, companies:[companyId], activeCompanyId }
companies/{companyId}                { name, legalName, phone, email, website, area, services, servicesEs,
                                       logoUrl, brandColor, trade, plan, ownerUid, createdAt }
companies/{cid}/members/{uid}        { role:'owner'|'admin'|'worker', workerId? }
companies/{cid}/settings/main        { pricing, payment, tax, discounts[], numbering{nextEst,nextInv},
                                       processDays, scope{en[],es[]}, terms{en[],es[]}, typePresets{interior,exterior,other},
                                       templates[], jobTemplates[], leadSources[], production, services[],
                                       followUpDays, websiteUrl, instagramUrl, reviewUrl, portalUrl,
                                       payZelle, payZelleName, payNote, payMethods[] (chips), payHandles{venmo,cashapp,paypal,checkTo},
                                       goal{sales}, dashCards[],
                                       recurring[], bankRules[], expCats[], calOn, calToken, showcase[] }
companies/{cid}/clients/{id}         { name, phone, email, address, source, lang, note, lead, archived, archivedAt,
                                       createdAt, photos[], referredBy, web{service,city,message,heard,details} }
companies/{cid}/estimates/{id}       { number, date, validDays, status, clientId, clientName, phone, email, address,
                                       docLang, jobType, doors, drawers, frames, boxes, frameMode, boxMode, spec, specEs,
                                       items[{id,desc,descEs,qty,unit,rate,hidden,svc}], upgrades[{id,desc,descEs,price|qty,rate,included,byClient}],
                                       discountMode, discountCode, discountPct, discountAmt, taxEnabled, taxRate,
                                       depositPct, payPlanOn, payPlan[], days, startDate, leadSource,
                                       scopeEn, scopeEs, termsEn, termsEs, notes, crewNotes,
                                       materialsMode, materialsList[], showMaterials, matBuyer, laborMode, extraHrs,
                                       expenses[] (legacy receipts), photos[{id,kind,caption,inWork}], showPhotos,
                                       signature{name,img,date,via,at}, sentAt, portal{token}, portalViews[], portalSeen{},
                                       activity[], chat[], changeOrders[], check{key:iso}, jobTasks[{id,day,text}],
                                       colors[{area,brand,color,sheen,code}], payClaim, reviewAsked, warrantyChecked, snooze{} }
companies/{cid}/invoices/{id}        { number, estId, kind:'deposit'|'balance'|'full'|'progress'|'co', amount, date, status, paidDate, paidMethod,
                                       pay{token}, payViews, payClaim{method,at,note}, payClaimSeen }
companies/{cid}/tasks/{id}           { title, date, time, note, estId, workerId, done }
companies/{cid}/workers/{id}         { name, phone, role, rate, active }
companies/{cid}/hours/{id}           { workerId, date, hours, rate, estId, note }
companies/{cid}/payouts/{id}         { workerId, date, amount, method, note }
companies/{cid}/expenses/{id}        { date, vendor, amount, category, source, method, note, estId, receiptPath,
                                       recurId, bankFp, bankDesc }
companies/{cid}/clock/{workerId}     { at, estId }

portal/{token}                       { owner(cid), estId, data (snapshot JSON), updatedAt, client:{ views[], picks{}, sign{}, chat[], paid{}, co{} } }
portal/{token}/photos/{id}           { owner, data }
paylink/{token}                      { owner(cid), invId, data (PayModel JSON: invoice lines/totals EN+ES, branding, ways to pay), updatedAt,
                                       client:{ views[], paid{method,at,note}|null } }   invoice payment link /pay/:token (src/lib/paylink.ts)
leads/{id}                           { owner(cid), name, phone, email, city, address, service, message, heard, lang,
                                       photos[pid], details{v,types[],cab{},intr{},ext{},other,tierCab,tierWall,when,date,contact,src,ref}, at, page, imported }
leads/{id}/photos/{pid}              { data, at }
public/{companyId}                   { name, phone, website, instagram, reviews, logoUrl, brandColor }
calfeed/{token}                      { owner, ics, updatedAt }
showcase/{companyId}/items/{id}      { url, caption, at }
```
Notes
- Photos/receipts/logos → **Firebase Storage** (companies/{cid}/photos/..., receipts/...), store paths not base64.
- Snapshot for the client link strips private fields (PORTAL_STRIP in prototype).
- Use server timestamps; keep `updatedAt` for conflict resolution (last write wins).
- Tombstones: prototype writes {deleted:true}; in React prefer real deletes + Firestore offline cache.
