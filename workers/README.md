# Calendar feed worker (Cloudflare)

This tiny worker lets Google Calendar, Apple Calendar and Outlook subscribe to your TradeWorks jobs and tasks.
It is free and takes about 5 minutes. You only do it once.

1. Sign in at https://dash.cloudflare.com and open **Workers & Pages** in the left menu.
2. Click **Create** (or **Create application**), then **Create Worker**. Name it `tradeworks-calendar` and click **Deploy**.
3. Click **Edit code**, delete everything in the editor, paste the entire contents of `workers/calendar-feed.js`, then click **Deploy**.
4. Go to the worker's **Settings > Variables and Secrets** (or **Variables**), click **Add**, type `FIREBASE_PROJECT_ID` as the name and your Firebase project id as the value (Firebase console > Project settings > Project ID), then **Deploy**.
5. Copy the worker address shown at the top of the worker page (it looks like `https://tradeworks-calendar.yourname.workers.dev`).
6. In the project's hosting settings (Cloudflare Pages > your site > Settings > Environment variables) add `VITE_CAL_FEED_URL` = that address (no trailing slash) and redeploy the site. For local testing put it in `.env.local` instead.

Then open TradeWorks > Settings > **Calendar link**, turn it on, and follow the steps shown there.

Notes:
- The app writes your schedule to the Firestore document `calfeed/<secret token>`; the worker only reads that one document, so nobody can list or browse anything.
- Anyone who has your link can see your schedule. Use "Make a new private link" in Settings if it leaks; the old link stops working.
- Calendar apps refresh subscribed calendars on their own schedule (Google can take a few hours).
