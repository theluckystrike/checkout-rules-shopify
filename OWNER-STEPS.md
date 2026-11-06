# Steps to publish Zovo Hide Shipping & Payment

Owner steps need your login, an agreement, money, tax or identity data. Orchestrator steps can be done by an agent after the owner step before them. Times are estimates.

Shopify moved app creation to the Dev Dashboard in 2025. The Partner Dashboard still holds App Store distribution, the listing, review and payouts. If a menu name below differs, use the closest one and note the change in this file.

## 1. Owner. Partner account (10 minutes, once)

1. Open https://www.shopify.com/partners and click Join now.
2. Sign up with the business email you want on the listing. Accept the Partner Program Agreement.
3. In the Partner Dashboard, open Settings and fill in the business name and the support and emergency contacts.

## 2. Owner. Development store (5 minutes)

1. Partner Dashboard, Stores, Add store, Create development store.
2. Pick "Create a store to test and build". Use a name such as zovo-rules-dev.
3. In the new store admin, open Settings, Payments. Turn on a manual payment method named Cash on Delivery and one named Bank Deposit. The test rules need them.
4. Add two shipping rates in Settings, Shipping and delivery, for example Standard and Express.

## 3. Owner then orchestrator. Link the app (5 minutes)

Owner, in a terminal on this Mac.

```sh
cd ~/plugin-market-intel-work/factory/products/checkout-rules-shopify
npx shopify app config link
```

1. The CLI opens a browser. Log in with the Partner account.
2. Pick the organization, then Create a new app. Name it Zovo Hide Shipping & Payment.
3. The CLI writes `client_id` into `shopify.app.toml`. Keep the file.

Orchestrator, after that. Run `npx shopify app info` and copy the API key into the host settings in step 4. The API secret is in the Dev Dashboard, under the app, Settings, Client credentials. The owner copies it into the host (do not paste it into chat or files).

## 4. Owner then orchestrator. Host the web app (20 minutes)

The app needs a public HTTPS server that runs `npm run docker-start` (the template Dockerfile does this). Any Node 22 host works. Fly.io, Render and Railway all run the Dockerfile.

Owner.
1. Create the host account and enter payment details there. The smallest instance is enough (256 to 512 MB).
2. Add a persistent volume mounted at `/app/prisma` for the SQLite session file, or create a Postgres database.
3. Set the environment variables `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL` (the host URL) and `SCOPES=write_payment_customizations,write_delivery_customizations`. `NODE_ENV=production`.

Orchestrator.
1. In `shopify.app.toml`, set `application_url` to the host URL and `redirect_urls` to the host URL plus `/auth/callback`.
2. Deploy the container to the host.
3. Check that `GET /` on the host returns 200 and shows the app name.

## 5. Orchestrator. Deploy config and Functions (5 minutes)

```sh
npx shopify app deploy
```

This uploads `shopify.app.toml` (scopes, webhooks, compliance topics) and both Functions. The CLI asks to release a new version. Answer yes. Record the version name in the report.

If the deploy rejects the input query of a Function, run `npm run test:functions` and fix the query. The local tests check the query against the Function schema of API version 2026-07.

## 6. Owner. Install and test on the development store (15 minutes)

1. Dev Dashboard, the app, Home, Install app, pick the development store.
2. In the app, click Turn on checkout rules.
3. Follow "Testing instructions for the reviewer" in `LISTING.md`. Do a real checkout with the Bogus Gateway in test mode.
4. On the Plan page, click Start Pro. Shopify shows a test charge. Approve it, then check that the Plan page shows Pro.
5. Record a screencast of steps 2 to 4 (about 2 minutes, English, with the app in the admin). The review needs it.

## 7. Owner. Choose App Store distribution (2 minutes, cannot be undone)

Partner Dashboard, Apps, All apps, Zovo Hide Shipping & Payment, Distribution. Pick Public distribution on the Shopify App Store. Shopify then charges a one-time registration fee of $19 to the Partner account, if you have not paid it before.

## 8. Owner. Payouts and tax (15 minutes)

Partner Dashboard, Settings, Payouts. Add the bank account and the tax form (W-8BEN-E for a non-US business). Shopify pays out app revenue only after this step. Revenue share is 0% on the first $1,000,000 of lifetime app revenue for registered developers, then 15% (https://shopify.dev/docs/apps/launch/distribution/revenue-share).

## 9. Orchestrator then owner. Listing (30 minutes)

Orchestrator. Fill the App Store listing form from `LISTING.md`. Upload `listing/icon.png` and the 4 screenshots in `listing/screenshots`.

Owner.
1. Add the support email and a privacy policy URL. Host `PRIVACY.md` as a page, for example on GitHub Pages or zovo.one.
2. Pricing. Pick Manual pricing (the app uses the Billing API) and enter the plans from `LISTING.md`.
3. Protected customer data. The Functions read customer tags only, and no name, email, phone or address. In API access, Protected customer data, answer that the app does not use protected customer fields. If Shopify asks for level 1 access because of customer tags, request it with the reason "Customer tags decide which payment and shipping methods a buyer sees". (UNVERIFIED which answer the form wants for tags read inside a Function.)
4. Upload the screencast and the test credentials (the development store URL and staff login, if the reviewer needs one).

## 10. Owner. Submit for review (5 minutes, then 1 to 3 weeks)

1. Partner Dashboard, the app, Distribution, run the automated checks. Fix any item they list.
2. Click Submit for review.
3. Answer the reviewer in the Partner Dashboard within 2 business days. Repeated failed reviews can lead to longer waits before a new submission.

## After approval

- Orchestrator. Every week, read installs and uninstalls in Partner Dashboard, Apps, Insights, and add them to the report.
- To release a fix, run `npm test`, then `npx shopify app deploy`, then deploy the container. Record the old version name so you can roll back with `npx shopify app versions list` and release the old one.
