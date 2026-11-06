import { describe, expect, test } from "vitest";
import { describeRule, ruleFromForm } from "../app/lib/rule-form";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("ruleFromForm", () => {
  test("parses a payment rule with list and number conditions", () => {
    const { rule, errors } = ruleFromForm(
      fd({
        kind: "payment",
        action: "hide",
        match: "contains",
        text: "Cash on Delivery",
        when: "all",
        c0_field: "cartSubtotal",
        c0_op: "gte",
        c0_value: "499,90",
        c1_field: "country",
        c1_op: "in",
        c1_value: "DE, AT,\nCH",
        c2_field: "",
      }),
    );
    expect(errors).toEqual([]);
    expect(rule.conditions).toEqual([
      { field: "cartSubtotal", op: "gte", value: 499.9 },
      { field: "country", op: "in", value: ["DE", "AT", "CH"] },
    ]);
    expect(rule.id).toMatch(/^r/);
  });
  test("keeps the id when editing", () => {
    expect(
      ruleFromForm(
        fd({ kind: "delivery", action: "hide", text: "x" }),
        "keep-me",
      ).rule.id,
    ).toBe("keep-me");
  });
  test("empty number is an error, not zero", () => {
    const { errors } = ruleFromForm(
      fd({
        kind: "delivery",
        action: "hide",
        text: "x",
        c0_field: "weightKg",
        c0_op: "gte",
        c0_value: "",
      }),
    );
    expect(errors).toContain("Condition 1 needs a number of 0 or more");
  });
  test("rename needs a new name", () => {
    expect(
      ruleFromForm(fd({ kind: "delivery", action: "rename", text: "x" }))
        .errors,
    ).toContain("Enter the new name");
  });
  test("b2b condition has no value", () => {
    const { rule, errors } = ruleFromForm(
      fd({
        kind: "payment",
        action: "hide",
        text: "bank",
        c0_field: "b2b",
        c0_op: "isNot",
        c0_value: "ignored",
      }),
    );
    expect(errors).toEqual([]);
    expect(rule.conditions).toEqual([{ field: "b2b", op: "isNot" }]);
  });
});

describe("describeRule", () => {
  test("reads as one sentence", () => {
    const { rule } = ruleFromForm(
      fd({
        kind: "payment",
        action: "hide",
        text: "COD",
        when: "any",
        c0_field: "cartSubtotal",
        c0_op: "gte",
        c0_value: "500",
        c1_field: "deliveryMethod",
        c1_op: "in",
        c1_value: "PICK_UP",
      }),
    );
    expect(describeRule(rule)).toBe(
      "Hide 'COD' when Cart subtotal is at least 500 or Chosen delivery type is one of PICK_UP",
    );
  });
  test("no conditions", () => {
    const { rule } = ruleFromForm(
      fd({ kind: "delivery", action: "move", text: "Free", position: "top" }),
    );
    expect(describeRule(rule)).toBe("Move 'Free' to the top always");
  });
});
