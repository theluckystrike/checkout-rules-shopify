# App Store listing text

Paste these into Partner Dashboard, Apps, Zovo Hide Shipping & Payment, Distribution, App Store listing. The character counts are below each field. Check them against the limits that the form shows.

## App name

Zovo Hide Shipping & Payment

(28 characters)

## App card subtitle

Hide, rename and sort shipping and payment methods by rule

## App introduction

Show each buyer only the shipping options and payment methods that fit their cart, country and account.

## App details

Set simple rules for checkout. Hide Cash on Delivery above a cart value or for store pickup. Hide Express shipping for islands and remote postal codes. Show Bank Deposit only to B2B buyers or tagged customers. Rename a shipping option to add the delivery time, or move free shipping to the top. Rules use cart value, weight, item count, country, postal code, customer and product tags. A cart tester shows the result before you go live. Built on Shopify Functions, so it works on every plan.

## Features

1. Hide, rename or sort any shipping option or payment method
2. Conditions on cart value, weight, country, postal code, tags and B2B
3. Cart tester shows what a buyer sees before you turn a rule on
4. Never hides every option, so buyers can always check out
5. Free for 3 rules, with no time limit

## Search terms

hide payment methods, hide shipping methods, cash on delivery, shipping rules, payment rules

## Categories

Primary category Store management, then Checkout. Use the closest category the form offers for checkout customization.

## Pricing (manual pricing, Shopify Billing API)

| Plan | Price | What it includes |
|---|---|---|
| Free | $0 | 3 rules on at a time, every condition, cart tester |
| Pro | $4.99 a month, or $49 a year | No limit on rules. 7-day free trial |

## Screenshots (1600 x 900)

1. `listing/screenshots/1-rules-1600.png`. Rules list with shipping and payment rules
2. `listing/screenshots/2-editor-1600.png`. Rule editor
3. `listing/screenshots/3-tester-1600.png`. Cart tester with hidden methods
4. `listing/screenshots/4-plan-1600.png`. Plans

Alt text for each, in order. "List of checkout rules with status and actions". "Form to hide a payment method when the cart is over 500". "Sample cart showing which shipping and payment methods stay visible". "Free and Pro plans".

## Icon

`listing/icon.png` (1200 x 1200).

## Support

Support email and privacy policy URL come from the owner (see OWNER-STEPS.md). Privacy policy text is in `PRIVACY.md`.

## Testing instructions for the reviewer

1. Install the app on the review store and open it.
2. Click Turn on checkout rules. The app adds one payment and one shipping customization. You can see them in Settings, then Payments, then Payment customizations, and in Settings, then Shipping and delivery, then Delivery customizations.
3. Click Add rule. Pick Payment methods, Hide it, Name contains, and type the name of a payment method the store has, for example Cash on Delivery. Add the condition Cart subtotal, is at least, 100. Save.
4. Open the Cart tester, set the subtotal to 150 and click Run the rules. The method shows as hidden.
5. In the storefront, add products worth more than 100 to the cart and go to checkout. The method is not offered. Below 100 it is.
6. Open Plan and click Start Pro. Shopify shows a test charge on the review store.

[zovo-support-start]: #

## Zovo links for the listing

Shopify wants links only in their designated fields and no promotional links in the app details (https://shopify.dev/docs/apps/launch/app-requirements-checklist, 5.B.5 and 5.E).

- Developer website field: https://github.com/theluckystrike
- The GitHub Sponsors link stays in the README of the repository, not in the listing. The app takes payment only through Shopify billing.

[zovo-support-end]: #
