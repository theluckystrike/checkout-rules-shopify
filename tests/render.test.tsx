// Renders each admin screen with data from the real loader/action code running against the fake Admin API.
// Writes preview/*.html (Polaris web components load from Shopify's CDN) for screenshots and checks the text.
import { describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";

vi.mock("../app/shopify.server", () => ({ authenticate: {}, default: {} }));
vi.mock("../app/db.server", () => ({ default: {} }));

import { FakeShop, fakeBilling } from "./fake-shop";
import {
  editorData,
  planData,
  rulesDashboard,
  saveRuleAction,
  testerAction,
} from "../app/lib/handlers.server";
import { RulesView } from "../app/routes/app._index";
import { EditorView } from "../app/routes/app.rules";
import { TesterView } from "../app/routes/app.tester";
import { PlanView } from "../app/routes/app.plan";
import { DEFAULT_SAMPLE } from "../app/lib/sample";

const OUT = path.join(__dirname, "..", "preview");
const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
function page(name: string, el: React.ReactElement) {
  // Views use <Form>, which needs a router. A memory router renders them like the real app does.
  const router = createMemoryRouter([{ path: "/", element: el }]);
  const body = renderToStaticMarkup(<RouterProvider router={router} />);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${name}</title>
<script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>
<style>body{margin:0;background:#f1f1f1;font-family:-apple-system,BlinkMacSystemFont,"San Francisco","Segoe UI",Roboto,sans-serif}.frame{max-width:1200px;margin:0 auto;padding:16px 24px}</style>
</head><body><div class="frame">${body}</div></body></html>`;
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.html`), html);
  return body;
}

const RULES: Record<string, string>[] = [
  {
    label: "No COD on big orders",
    kind: "payment",
    action: "hide",
    match: "contains",
    text: "Cash on Delivery",
    when: "any",
    c0_field: "cartSubtotal",
    c0_op: "gte",
    c0_value: "500",
    c1_field: "deliveryMethod",
    c1_op: "in",
    c1_value: "PICK_UP",
  },
  {
    label: "Islands get no Express",
    kind: "delivery",
    action: "hide",
    match: "contains",
    text: "Express",
    when: "all",
    c0_field: "zipPrefix",
    c0_op: "in",
    c0_value: "18565, 25938, 26486",
  },
  {
    label: "Bank Deposit for B2B only",
    kind: "payment",
    action: "hide",
    match: "contains",
    text: "Bank Deposit",
    when: "all",
    c0_field: "b2b",
    c0_op: "isNot",
  },
  {
    label: "Delivery time in the name",
    kind: "delivery",
    action: "rename",
    match: "contains",
    text: "Standard",
    newName: "Standard (2-4 business days)",
    when: "all",
  },
];

describe("screens", async () => {
  const shop = new FakeShop();
  for (const r of RULES) await saveRuleAction(shop.admin, fakeBilling(), fd(r));

  test("rules dashboard", async () => {
    const data = await rulesDashboard(
      shop.admin,
      fakeBilling(),
      new URL("https://x/app?saved=off"),
    );
    const html = page("1-rules", <RulesView data={data} />);
    expect(html).toContain(
      "Hide &#x27;Cash on Delivery&#x27; when Cart subtotal is at least 500 or Chosen delivery type is one of PICK_UP",
    );
    expect(html).toContain("Rules (3 on of 3 on the free plan)");
    expect(html).toContain("Rule saved and turned off");
  });
  test("rule editor", async () => {
    const id = (await rulesDashboard(shop.admin, fakeBilling())).rules[0].id;
    const html = page(
      "2-editor",
      <EditorView
        data={await editorData(
          shop.admin,
          new URL(`https://x/app/rules?rule=${id}`),
        )}
      />,
    );
    expect(html).toContain('value="Cash on Delivery"');
    // The saved choices must be marked on the options, or Polaris shows the first option.
    expect(html).toMatch(/<s-option value="payment" selected="[^"]*">/);
    expect(html).toMatch(/<s-option value="any" selected="[^"]*">/);
    expect(html).toMatch(
      /name="c0_field"[^>]*>.*?<s-option value="cartSubtotal" selected/s,
    );
    expect(html).toMatch(/name="c1_op"[^>]*>.*?<s-option value="in" selected/s);
    expect(html.match(/selected=/g)?.length).toBe(10);
  });
  test("cart tester", async () => {
    const out = await testerAction(
      shop.admin,
      fakeBilling(),
      fd({ ...DEFAULT_SAMPLE, subtotal: "620", zip: "18565" }),
    );
    const html = page("3-tester", <TesterView ruleCount={4} out={out} />);
    expect(out.result.payment.hidden).toEqual([
      "Cash on Delivery (COD)",
      "Bank Deposit",
    ]);
    expect(out.result.shipping.hidden).toEqual(["Express Shipping"]);
    expect(html).toContain("Hidden");
  });
  test("plan", async () => {
    const html = page(
      "4-plan",
      <PlanView data={await planData(shop.admin, fakeBilling())} />,
    );
    expect(html).toContain("Start Pro for $4.99 a month");
    expect(html).toContain("development store");
  });
  test("empty state for a new store", async () => {
    const fresh = new FakeShop();
    const html = page(
      "5-empty",
      <RulesView data={await rulesDashboard(fresh.admin, fakeBilling())} />,
    );
    expect(html).toContain("Turn on checkout rules");
    expect(html).toContain("Add your first rule");
  });
});
