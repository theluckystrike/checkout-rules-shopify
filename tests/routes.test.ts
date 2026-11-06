import { beforeEach, describe, expect, test, vi } from "vitest";

// Routes import shopify.server and db.server. Tests call the exported loader/action helpers with fakes instead.
vi.mock("../app/shopify.server", () => ({ authenticate: {}, default: {} }));
vi.mock("../app/db.server", () => ({
  default: { session: { deleteMany: vi.fn() } },
}));

import { FakeShop, fakeBilling } from "./fake-shop";
import {
  rulesAction,
  rulesDashboard,
  editorData,
  saveRuleAction,
  testerAction,
  planAction,
  planData,
} from "../app/lib/handlers.server";
import { planFromPayload } from "../app/routes/webhooks.app_subscriptions.update";
import { PRO_MONTHLY } from "../app/lib/plans";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const codRule = {
  kind: "payment",
  action: "hide",
  match: "contains",
  text: "Cash on Delivery",
  when: "all",
  c0_field: "cartSubtotal",
  c0_op: "gte",
  c0_value: "500",
};

let shop: FakeShop;
beforeEach(() => {
  shop = new FakeShop();
});

describe("first run", () => {
  test("dashboard shows not active and free plan", async () => {
    const d = await rulesDashboard(shop.admin, fakeBilling());
    expect(d).toMatchObject({
      plan: "free",
      active: false,
      functionsReady: true,
      rules: [],
      usage: { enabled: 0, limit: 3 },
    });
  });
  test("activate creates one payment and one delivery customization, once", async () => {
    const r = await rulesAction(
      shop.admin,
      fakeBilling(),
      fd({ intent: "activate" }),
    );
    expect(r).toEqual({ ok: true, message: "Checkout rules are on." });
    expect(shop.payment).toHaveLength(1);
    expect(shop.delivery).toHaveLength(1);
    expect(shop.payment[0].functionId).toBe("fn-pay"); // not the other app's Function
    const again = await rulesAction(
      shop.admin,
      fakeBilling(),
      fd({ intent: "activate" }),
    );
    expect(again.message).toBe("Checkout rules were already on.");
    expect(shop.payment).toHaveLength(1);
  });
  test("activate explains when Functions are not deployed", async () => {
    shop.functionsDeployed = false;
    await expect(
      rulesAction(shop.admin, fakeBilling(), fd({ intent: "activate" })),
    ).rejects.toThrow(/shopify app deploy/);
  });
});

describe("saving rules", () => {
  test("first save turns rules on and writes the Function config to both customizations", async () => {
    const res = await saveRuleAction(shop.admin, fakeBilling(), fd(codRule));
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get("Location")).toBe("/app?saved=1");
    const pay = shop.config("payment");
    expect(pay).toMatchObject({
      version: 1,
      plan: "free",
      neverHideAll: true,
      customerTags: [],
      productTags: [],
    });
    expect(pay.rules[0]).toMatchObject({
      kind: "payment",
      action: "hide",
      target: { text: "Cash on Delivery" },
      conditions: [{ field: "cartSubtotal", op: "gte", value: 500 }],
    });
    expect(shop.config("delivery")).toEqual(pay);
    const set = shop.calls.filter((c) => c.op === "ZovoSaveRules").at(-1)!;
    expect(set.variables.metafields.map((m: any) => m.ownerId)).toEqual([
      shop.installationId,
      shop.payment[0].id,
      shop.delivery[0].id,
    ]);
  });
  test("invalid form returns errors and writes nothing", async () => {
    const res = await saveRuleAction(
      shop.admin,
      fakeBilling(),
      fd({ kind: "payment", action: "rename", text: "" }),
    );
    expect(res).toEqual({
      errors: expect.arrayContaining([
        "Enter the method name to match",
        "Enter the new name",
      ]),
    });
    expect(shop.calls.some((c) => c.op === "ZovoSaveRules")).toBe(false);
  });
  test("customer tags become Function input variables", async () => {
    await saveRuleAction(
      shop.admin,
      fakeBilling(),
      fd({
        ...codRule,
        c0_field: "customerTag",
        c0_op: "hasNone",
        c0_value: "vip, trusted",
      }),
    );
    expect(shop.config("payment").customerTags).toEqual(["trusted", "vip"]);
  });
  test("product tags are capped so large carts stay inside the Function limit", async () => {
    const pro = () => fakeBilling({ name: PRO_MONTHLY });
    const r1 = await saveRuleAction(shop.admin, pro(), fd({ ...codRule, c0_field: "productTag", c0_op: "anyLine", c0_value: "a,b,c" }));
    expect((r1 as Response).status).toBe(302);
    const r2 = await saveRuleAction(shop.admin, pro(), fd({ ...codRule, c0_field: "productTag", c0_op: "anyLine", c0_value: "d,e,f" }));
    expect(r2).toEqual({ errors: [expect.stringContaining("5 different product tags")] });
    expect(shop.config("payment").productTags).toEqual(["a", "b", "c"]);
  });
  test("4th rule on the free plan is saved but off", async () => {
    for (let i = 0; i < 3; i++)
      await saveRuleAction(
        shop.admin,
        fakeBilling(),
        fd({ ...codRule, text: `m${i}` }),
      );
    const res = (await saveRuleAction(
      shop.admin,
      fakeBilling(),
      fd({ ...codRule, text: "m3" }),
    )) as Response;
    expect(res.headers.get("Location")).toBe("/app?saved=off");
    const d = await rulesDashboard(shop.admin, fakeBilling());
    expect(d.rules.map((r) => r.enabled)).toEqual([true, true, true, false]);
    const on = await rulesAction(
      shop.admin,
      fakeBilling(),
      fd({ intent: "toggle", id: d.rules[3].id }),
    );
    expect(on.ok).toBe(false);
  });
  test("Pro saves a 4th rule as on and tells the Function", async () => {
    const pro = () => fakeBilling({ name: PRO_MONTHLY });
    for (let i = 0; i < 4; i++)
      await saveRuleAction(
        shop.admin,
        pro(),
        fd({ ...codRule, text: `m${i}` }),
      );
    const d = await rulesDashboard(shop.admin, pro());
    expect(d.rules.every((r) => r.enabled !== false)).toBe(true);
    expect(d.usage).toEqual({ enabled: 4, limit: null, overLimit: 0 });
    expect(shop.config("payment").plan).toBe("pro");
  });
  test("Admin API user errors surface", async () => {
    await saveRuleAction(shop.admin, fakeBilling(), fd(codRule));
    shop.failNextSet = true;
    const id = (await rulesDashboard(shop.admin, fakeBilling())).rules[0].id;
    await expect(
      rulesAction(shop.admin, fakeBilling(), fd({ intent: "toggle", id })),
    ).rejects.toThrow("Value is too long");
  });
  test("edit keeps position, reorder and delete work", async () => {
    for (const t of ["a", "b", "c"])
      await saveRuleAction(
        shop.admin,
        fakeBilling(),
        fd({ ...codRule, text: t }),
      );
    let d = await rulesDashboard(shop.admin, fakeBilling());
    const [a, b] = d.rules;
    await saveRuleAction(
      shop.admin,
      fakeBilling(),
      fd({ ...codRule, id: b.id, text: "b2" }),
    );
    await rulesAction(
      shop.admin,
      fakeBilling(),
      fd({ intent: "up", id: b.id }),
    );
    await rulesAction(
      shop.admin,
      fakeBilling(),
      fd({ intent: "delete", id: a.id }),
    );
    d = await rulesDashboard(shop.admin, fakeBilling());
    expect(d.rules.map((r) => r.target.text)).toEqual(["b2", "c"]);
    const ed = await editorData(
      shop.admin,
      new URL(`https://x/app/rules?rule=${b.id}`),
    );
    expect(ed).toMatchObject({
      isNew: false,
      defaultKind: "payment",
      rule: { target: { text: "b2" } },
    });
    const missing = await editorData(
      shop.admin,
      new URL("https://x/app/rules?rule=gone"),
    );
    expect(missing).toMatchObject({ isNew: true, missing: true });
  });
});

describe("cart tester", () => {
  test("runs saved rules on the sample cart", async () => {
    await saveRuleAction(shop.admin, fakeBilling(), fd(codRule));
    const out = await testerAction(
      shop.admin,
      fakeBilling(),
      fd({
        subtotal: "620",
        country: "DE",
        zip: "10115",
        customerTags: "",
        productTags: "",
        itemCount: "1",
        weightKg: "1",
        b2b: "no",
        loggedIn: "no",
        deliveryMethod: "SHIPPING",
        shipping: "Standard: 4.90\nExpress: 14,90",
        payments: "Credit card\nCash on Delivery (COD)",
      }),
    );
    expect(out.result.payment).toEqual({
      visible: ["Credit card"],
      hidden: ["Cash on Delivery (COD)"],
    });
    expect(out.result.shipping.visible).toEqual(["Standard", "Express"]);
  });
});

describe("billing", () => {
  test("development store gets test charges", async () => {
    const billing = fakeBilling();
    await expect(
      planAction(
        shop.admin,
        billing,
        fd({ intent: "subscribe", plan: PRO_MONTHLY }),
      ),
    ).rejects.toBeInstanceOf(Response);
    expect(billing.calls.find((c) => c.fn === "request")).toEqual({
      fn: "request",
      plan: PRO_MONTHLY,
      isTest: true,
    });
  });
  test("real store gets real charges", async () => {
    shop.partnerDevelopment = false;
    const billing = fakeBilling();
    await expect(
      planAction(
        shop.admin,
        billing,
        fd({ intent: "subscribe", plan: PRO_MONTHLY }),
      ),
    ).rejects.toBeInstanceOf(Response);
    expect(billing.calls.find((c) => c.fn === "request")?.isTest).toBe(false);
    expect((await planData(shop.admin, fakeBilling())).test).toBe(false);
  });
  test("unknown plan names are refused", async () => {
    const billing = fakeBilling();
    expect(
      await planAction(
        shop.admin,
        billing,
        fd({ intent: "subscribe", plan: "Free Forever Hack" }),
      ),
    ).toEqual({ ok: false, message: "Unknown plan." });
    expect(billing.calls.some((c) => c.fn === "request")).toBe(false);
  });
  test("cancel drops checkout back to the free limit", async () => {
    const billing = fakeBilling({
      name: PRO_MONTHLY,
      id: "gid://shopify/AppSubscription/7",
    });
    for (let i = 0; i < 4; i++)
      await saveRuleAction(
        shop.admin,
        billing,
        fd({ ...codRule, text: `m${i}` }),
      );
    expect(shop.config("payment").plan).toBe("pro");
    const r = await planAction(shop.admin, billing, fd({ intent: "cancel" }));
    expect(r.ok).toBe(true);
    expect(billing.calls.find((c) => c.fn === "cancel")).toMatchObject({
      subscriptionId: "gid://shopify/AppSubscription/7",
      prorate: true,
    });
    expect(shop.config("payment").plan).toBe("free");
    expect(shop.config("payment").rules).toHaveLength(4); // rules kept
  });
  test("subscription webhook payload maps to a plan", () => {
    expect(
      planFromPayload({
        app_subscription: { name: PRO_MONTHLY, status: "ACTIVE" },
      }),
    ).toBe("pro");
    expect(
      planFromPayload({
        app_subscription: { name: PRO_MONTHLY, status: "CANCELLED" },
      }),
    ).toBe("free");
    expect(
      planFromPayload({
        app_subscription: { name: "Other", status: "ACTIVE" },
      }),
    ).toBe("free");
    expect(planFromPayload({})).toBe("free");
  });
});
