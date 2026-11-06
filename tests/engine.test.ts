import { describe, expect, test } from "vitest";
import {
  activeRules,
  buildConfig,
  cartFacts,
  collectTags,
  conditionHolds,
  deliveryOperations,
  paymentOperations,
  simulate,
  validateRule,
  FREE_RULE_LIMIT,
  type Rule,
} from "../shared/rules-engine.js";

const rule = (o: Partial<Rule> = {}): Rule => ({
  id: "r",
  kind: "delivery",
  enabled: true,
  action: "hide",
  target: { match: "contains", text: "express" },
  when: "all",
  conditions: [],
  ...o,
});

describe("validateRule", () => {
  test("accepts a minimal rule", () =>
    expect(validateRule(rule())).toEqual([]));
  test("names each problem", () => {
    const e = validateRule({
      kind: "x",
      action: "rename",
      target: { text: " " },
      conditions: [{ field: "nope", op: "x" }],
    });
    expect(e).toEqual(
      expect.arrayContaining([
        "Pick shipping or payment",
        "Enter the method name to match",
        "Enter the new name",
        "Condition 1 has an unknown field",
      ]),
    );
  });
  test("deliveryMethod is payment only", () => {
    expect(
      validateRule(
        rule({
          conditions: [
            { field: "deliveryMethod", op: "in", value: ["PICK_UP"] },
          ],
        }),
      ),
    ).toContain("Condition 1 works only in payment rules");
  });
  test("numbers must be 0 or more", () => {
    expect(
      validateRule(
        rule({ conditions: [{ field: "cartSubtotal", op: "gte", value: -1 }] }),
      ),
    ).toContain("Condition 1 needs a number of 0 or more");
    expect(
      validateRule(
        rule({
          conditions: [{ field: "cartSubtotal", op: "gte", value: "abc" }],
        }),
      ),
    ).toContain("Condition 1 needs a number of 0 or more");
  });
  test("move needs top or bottom", () =>
    expect(validateRule(rule({ action: "move" }))).toContain(
      "Move to top or bottom",
    ));
  test("null rule", () =>
    expect(validateRule(null)).toEqual(["Rule is missing"]));
});

describe("plan limit", () => {
  test(`free plan counts the first ${FREE_RULE_LIMIT} enabled rules across both kinds`, () => {
    const rules = [
      rule({ id: "1", kind: "payment", target: { text: "cod" } }),
      rule({ id: "2" }),
      rule({ id: "x", enabled: false }),
      rule({ id: "3", kind: "payment", target: { text: "bank" } }),
      rule({ id: "4" }),
    ];
    const cfg = buildConfig(rules, "free");
    expect(activeRules(cfg, "delivery").map((r) => r.id)).toEqual(["2"]);
    expect(activeRules(cfg, "payment").map((r) => r.id)).toEqual(["1", "3"]);
    expect(
      activeRules(buildConfig(rules, "pro"), "delivery").map((r) => r.id),
    ).toEqual(["2", "4"]);
  });
  test("invalid rules never reach checkout", () => {
    const cfg = {
      plan: "pro",
      rules: [
        {
          id: "bad",
          kind: "delivery",
          action: "explode",
          target: { text: "x" },
        },
        rule({ id: "ok" }),
      ],
    };
    expect(activeRules(cfg, "delivery").map((r) => r.id)).toEqual(["ok"]);
  });
  test("missing config is safe", () => {
    expect(activeRules(undefined, "delivery")).toEqual([]);
    expect(deliveryOperations({})).toEqual({ operations: [] });
    expect(paymentOperations(null)).toEqual({ operations: [] });
  });
});

describe("cart facts", () => {
  const input = {
    presentmentCurrencyRate: "1.25",
    cart: {
      cost: { subtotalAmount: { amount: "125.0" } },
      buyerIdentity: {
        isAuthenticated: true,
        purchasingCompany: null,
        customer: {
          hasTags: [
            { tag: "VIP", hasTag: true },
            { tag: "b2b", hasTag: false },
          ],
        },
      },
      lines: [
        {
          quantity: 2,
          merchandise: {
            weight: 500,
            weightUnit: "GRAMS",
            product: { hasTags: [{ tag: "Fragile", hasTag: true }] },
          },
        },
        { quantity: 1, merchandise: { __typename: "CustomProduct" } },
      ],
      deliveryGroups: [
        { deliveryAddress: { countryCode: "de", zip: "18 565" } },
      ],
    },
  };
  const f = cartFacts(input);
  test("converts buyer currency to store currency", () =>
    expect(f.subtotal).toBe(100));
  test("sums weight in kg and counts items", () => {
    expect(f.weightKg).toBe(1);
    expect(f.itemCount).toBe(3);
  });
  test("tags are case-insensitive", () => {
    expect(
      conditionHolds({ field: "customerTag", op: "hasAny", value: ["vip"] }, f),
    ).toBe(true);
    expect(
      conditionHolds(
        { field: "customerTag", op: "hasNone", value: ["B2B"] },
        f,
      ),
    ).toBe(true);
    expect(
      conditionHolds(
        { field: "productTag", op: "anyLine", value: ["fragile"] },
        f,
      ),
    ).toBe(true);
  });
  test("postal code prefix ignores spaces and case", () => {
    expect(
      conditionHolds({ field: "zipPrefix", op: "in", value: ["185"] }, f),
    ).toBe(true);
    expect(
      conditionHolds({ field: "zipPrefix", op: "notIn", value: ["185"] }, f),
    ).toBe(false);
  });
  test("country matching uppercases", () =>
    expect(
      conditionHolds({ field: "country", op: "in", value: ["DE"] }, f),
    ).toBe(true));
  test("unknown address does not satisfy notIn", () => {
    const g = cartFacts({ cart: { deliveryGroups: [] } });
    expect(
      conditionHolds({ field: "country", op: "notIn", value: ["DE"] }, g),
    ).toBe(false);
  });
  test("thresholds are inclusive for gte", () => {
    expect(
      conditionHolds({ field: "cartSubtotal", op: "gte", value: 100 }, f),
    ).toBe(true);
    expect(
      conditionHolds({ field: "cartSubtotal", op: "lt", value: 100 }, f),
    ).toBe(false);
  });
  test("collectTags dedupes and sorts", () => {
    expect(
      collectTags([
        rule({
          conditions: [
            { field: "customerTag", op: "hasAny", value: ["b", "a", "b"] },
            { field: "productTag", op: "anyLine", value: ["x"] },
          ],
        }),
      ]),
    ).toEqual({ customerTags: ["a", "b"], productTags: ["x"] });
  });
});

describe("simulate (cart tester)", () => {
  const sample = {
    subtotal: 600,
    country: "DE",
    zip: "10115",
    shipping: [
      { title: "Standard", cost: 4.9 },
      { title: "Express", cost: 14.9 },
    ],
    payments: ["Credit card", "PayPal", "Cash on Delivery (COD)"],
  };
  test("hide, rename and move together", () => {
    const rules = [
      rule({
        id: "a",
        kind: "payment",
        target: { text: "cash on delivery" },
        conditions: [{ field: "cartSubtotal", op: "gte", value: 500 }],
      }),
      rule({
        id: "b",
        action: "rename",
        target: { text: "standard" },
        newName: "Standard (2-4 days)",
      }),
      rule({
        id: "c",
        kind: "payment",
        action: "move",
        target: { text: "paypal" },
        position: "top",
      }),
    ];
    const r = simulate(rules, "free", sample);
    expect(r.payment).toEqual({
      visible: ["PayPal", "Credit card"],
      hidden: ["Cash on Delivery (COD)"],
    });
    expect(r.shipping).toEqual({
      visible: ["Standard (2-4 days)", "Express"],
      hidden: [],
    });
    expect(r.ignoredByPlan).toBe(0);
  });
  test("reports rules skipped by the free limit", () => {
    const rules = [1, 2, 3, 4, 5].map((i) => rule({ id: String(i) }));
    expect(simulate(rules, "free", sample).ignoredByPlan).toBe(2);
    expect(simulate(rules, "pro", sample).ignoredByPlan).toBe(0);
  });
  test("never hides every shipping option", () => {
    const r = simulate([rule({ target: { text: "s" } })], "free", sample);
    expect(r.shipping.hidden).toEqual(["Express"]);
    expect(r.shipping.visible).toEqual(["Standard"]);
  });
  test("customer tag in the sample", () => {
    const rules = [
      rule({
        kind: "payment",
        target: { text: "credit" },
        conditions: [
          { field: "customerTag", op: "hasAny", value: ["wholesale"] },
        ],
      }),
    ];
    expect(
      simulate(rules, "free", { ...sample, customerTags: ["Wholesale"] })
        .payment.hidden,
    ).toEqual(["Credit card"]);
    expect(simulate(rules, "free", sample).payment.hidden).toEqual([]);
  });
});

describe("Function budget", () => {
  test("200 lines and 20 rules stay fast", () => {
    const rules = Array.from({ length: 20 }, (_, i) =>
      rule({
        id: `r${i}`,
        target: { text: `opt${i}` },
        conditions: [{ field: "productTag", op: "anyLine", value: [`t${i}`] }],
      }),
    );
    const cfg = buildConfig(rules, "pro");
    const input = {
      presentmentCurrencyRate: "1",
      cart: {
        cost: { subtotalAmount: { amount: "10" } },
        lines: Array.from({ length: 200 }, () => ({
          quantity: 1,
          merchandise: {
            weight: 1,
            weightUnit: "KILOGRAMS",
            product: {
              hasTags: cfg.productTags.map((t) => ({
                tag: t,
                hasTag: t === "t3",
              })),
            },
          },
        })),
        deliveryGroups: [
          {
            deliveryAddress: { countryCode: "US" },
            deliveryOptions: Array.from({ length: 10 }, (_, i) => ({
              handle: `h${i}`,
              title: `opt${i}`,
              cost: { amount: "1" },
            })),
          },
        ],
      },
      deliveryCustomization: { metafield: { jsonValue: cfg } },
    };
    const t0 = performance.now();
    const out = deliveryOperations(input);
    expect(out.operations).toEqual([
      { deliveryOptionHide: { deliveryOptionHandle: "h3" } },
    ]);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
