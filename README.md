# The Profit Pulse (MedSpa Profit Calculator)

Free treatment-profit calculator for MedSpas, built by Monique Reid Bookkeeping as a lead magnet.
Visitors see what a treatment really keeps after payment/financing fees, product, provider pay and room cost,
can print the report for free, and can ask for a free 20-minute review (name, practice, email, optional phone).

## How leads are saved

Browser form -> `POST /api/report` (Cloudflare Pages Function, `functions/api/report.ts`) -> Google Apps Script -> Google Sheet.

The server validates everything, **recomputes all totals itself** (it never trusts numbers from the browser), and
only reports success when the Apps Script confirms the row was saved.

### Required settings (Cloudflare Pages > Settings > Variables and Secrets)

| Name | What it is |
| --- | --- |
| `APPS_SCRIPT_URL` | Your Apps Script web-app URL |
| `REPORT_SHARED_SECRET` | Shared secret your Apps Script checks |

### Check it is working

Open `https://YOUR-SITE/api/report` in a browser. You want `"status":"ready"`. Then submit the form once yourself and
confirm a row lands in the sheet. Do this after every change to the Cloudflare settings or the Apps Script.

### About the sheet columns

The sheet does not need to change. Because it has no Email or Platform column yet, the server also writes
`Email: ... | Platform: ... | Feedback: ...` into the **Feedback** column. The payload sent to the Apps Script also contains
separate `email` and `paymentPlatform` fields, so when you add those columns you only need to read them in the script.

Only contact rows where `contactConsent` is `true` (the server now requires it for every saved request).

## Optional features (all off until you set them)

| Feature | Settings | Notes |
| --- | --- | --- |
| Bot protection (Cloudflare Turnstile, free) | `TURNSTILE_SITE_KEY` (public key) **and** `TURNSTILE_SECRET_KEY` (secret), both as runtime variables | Set both, no rebuild needed. The page asks `/api/config`, so it shows the check only when the server enforces it. If only one key is set, protection stays off and `/api/report` shows a warning. |
| Funnel analytics (Plausible) | `VITE_PLAUSIBLE_DOMAIN` (build variable) | Events: `calculator_used`, `review_requested`, `review_request_failed`, `report_printed`, `cta_clicked`. No personal data is sent. |
| Page-view analytics | Turn on **Web Analytics** for the project in the Cloudflare dashboard | No code needed. |

Build variables need a redeploy to take effect.

## Security and speed (what is already set up)

- `public/_headers` sets the security headers and the caching rules. It controls which outside services the page may load, and it applies only to the web page, not to `/api/*`.
  **If you add a service, edit it or the browser will block it:**
  - Embedding the calculator on another website: add that site to `frame-ancestors`.
  - Self-hosted analytics, or any other outside script: add its address to `script-src` and `connect-src`.
  - After any edit, open the live page and check the browser console for "Content Security Policy" messages.
- `public/privacy.html` is the privacy page linked from the calculator. Read it and change anything that is not true for your business.
- `package-lock.json` pins exact package versions, and `.node-version` pins Node 20, so every build is the same. Dependabot opens a pull request when a dependency needs a security update. Read it, make sure the checks pass, then merge.
- Recommended in Cloudflare (no code): **Security > WAF > Rate limiting rules**, limit `POST /api/report` to about 5 requests per minute per visitor. Turn on **Web Analytics** for page-view counts.
- If a deployment misbehaves: Cloudflare Pages > Deployments > pick the last good one > **Rollback**.

## Easy edits (top of `src/App.tsx`)

`BOOKING_URL` (swap in your calendar link), `PRIVACY_URL` (shows a privacy-policy link when set), `REVIEW_HEADLINE`, `REVIEW_TEXT`.
Link-preview image URLs are in `index.html` (they must be absolute; update them if you move to your own domain).

## Develop

```
npm install
npm run dev      # local preview
npm test         # calculator + server tests
npm run lint     # type-check
npm run build    # production build into dist/
```

All figures are estimates for planning and discussion with an accountant, not tax, legal or CPA advice.


## Reminders

- **Review the lead list about two weeks after launch.** Count the junk or made-up rows in the sheet. If more than a few are fake, add an email confirmation step: the visitor receives a short code by email and enters it to unlock the full report. The throw-away email block in `src/emailCheck.ts` already stops the obvious fakes.
- **Phone number:** `PHONE_REQUIRED` in `src/App.tsx` controls whether the phone box is required. The Google Sheet script must accept a blank phone before it is set to `false` (it is `false` now, and the script was updated to allow it).
- **Booking link:** replace `BOOKING_URL` in `src/App.tsx` with a calendar link when you have one.
- **Dependabot:** major-version upgrade branches (Vite 8, React 19, TypeScript 7) are not safe to merge without testing. Close them unless you plan an upgrade.
