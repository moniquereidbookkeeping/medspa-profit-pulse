# The MedSpa Profit Pulse

Free treatment-profit calculator for MedSpas, built by Monique Reid Bookkeeping as a lead magnet.
Visitors see what a treatment really keeps after payment/financing fees, product, provider pay and room cost,
can print the report for free, and can ask for a free 15-minute review (name, practice, email, optional phone).

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
| Bot protection (Cloudflare Turnstile, free) | `VITE_TURNSTILE_SITE_KEY` (build variable) **and** `TURNSTILE_SECRET_KEY` (secret) | Set both. `/api/report` health check shows `botProtection: enabled`. |
| Funnel analytics (Plausible) | `VITE_PLAUSIBLE_DOMAIN` (build variable) | Events: `calculator_used`, `review_requested`, `review_request_failed`, `report_printed`, `cta_clicked`. No personal data is sent. |
| Page-view analytics | Turn on **Web Analytics** for the project in the Cloudflare dashboard | No code needed. |

Build variables need a redeploy to take effect.

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
