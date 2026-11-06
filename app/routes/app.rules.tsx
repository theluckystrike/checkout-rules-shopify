import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { editorData, saveRuleAction } from "../lib/handlers.server";
import { MAX_CONDITIONS, fieldName, opName } from "../lib/rule-form";
import { FIELDS } from "../../shared/rules-engine.js";
import { Select } from "../components/Select";

const OP_OPTIONS = [
  ...new Set(Object.values(FIELDS).flatMap((f) => f.ops)),
].map((o) => [o, opName(o)] as const);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  return editorData(admin, new URL(request.url));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  return saveRuleAction(admin, billing, await request.formData());
};

type Data = Awaited<ReturnType<typeof editorData>>;

export function EditorView({
  data,
  errors,
}: {
  data: Data;
  errors?: string[];
}) {
  const r = data.rule;
  const kind = data.defaultKind;
  const conds = r?.conditions ?? [];
  const fieldList = Object.keys(FIELDS);
  return (
    <s-page heading={data.isNew ? "Add a rule" : "Edit rule"}>
      <s-link slot="breadcrumb-actions" href="/app">
        Rules
      </s-link>
      {data.missing ? (
        <s-banner tone="warning">
          That rule was not found. You can add a new one here.
        </s-banner>
      ) : null}
      {errors?.length ? (
        <s-banner tone="critical" heading="Check these fields">
          <s-unordered-list>
            {errors.map((e) => (
              <s-list-item key={e}>{e}</s-list-item>
            ))}
          </s-unordered-list>
        </s-banner>
      ) : null}
      <Form method="post">
        {r ? <input type="hidden" name="id" value={r.id} /> : null}
        <s-section heading="What to change">
          <s-stack gap="base">
            <s-text-field
              label="Name for this rule (only you see it)"
              name="label"
              value={r?.label ?? ""}
            />
            <Select
              label="Checkout step"
              name="kind"
              value={kind}
              options={[
                ["delivery", "Shipping options"],
                ["payment", "Payment methods"],
              ]}
            />
            <Select
              label="Action"
              name="action"
              value={r?.action ?? "hide"}
              options={[
                ["hide", "Hide it"],
                ["rename", "Rename it"],
                ["move", "Move it"],
              ]}
            />
            <s-grid gridTemplateColumns="1fr 2fr" gap="base">
              <Select
                label="Match"
                name="match"
                value={r?.target.match ?? "contains"}
                options={[
                  ["contains", "Name contains"],
                  ["equals", "Name is exactly"],
                ]}
              />
              <s-text-field
                label="Method name"
                name="text"
                value={r?.target.text ?? ""}
                details="As the buyer sees it at checkout, for example Express or Cash on Delivery. Not case sensitive."
              />
            </s-grid>
            <s-text-field
              label="New name (for rename)"
              name="newName"
              value={r?.newName ?? ""}
            />
            <Select
              label="Move to (for move)"
              name="position"
              value={r?.position ?? "top"}
              options={[
                ["top", "Top of the list"],
                ["bottom", "Bottom of the list"],
              ]}
            />
          </s-stack>
        </s-section>
        <s-section heading="When">
          <s-stack gap="base">
            <s-paragraph>
              Leave all conditions empty to apply the rule to every cart.
            </s-paragraph>
            <s-paragraph>
              Product tag, weight and item count conditions read every line in the cart. On carts with about 100
              lines or more, Shopify can stop a rule that uses them, and checkout then shows all options as usual.
            </s-paragraph>
            <Select
              label="Conditions must"
              name="when"
              value={r?.when ?? "all"}
              options={[
                ["all", "All be true"],
                ["any", "Any be true"],
              ]}
            />
            {Array.from({ length: MAX_CONDITIONS }, (_, i) => {
              const c = conds[i];
              const v = c
                ? Array.isArray(c.value)
                  ? c.value.join(", ")
                  : (c.value ?? "")
                : "";
              return (
                <s-grid key={i} gridTemplateColumns="1fr 1fr 2fr" gap="base">
                  <Select
                    label={`Condition ${i + 1}`}
                    name={`c${i}_field`}
                    value={c?.field ?? ""}
                    options={[
                      ["", "None"],
                      ...fieldList.map(
                        (f) =>
                          [
                            f,
                            `${fieldName(f)}${FIELDS[f].paymentOnly ? " (payment rules)" : ""}`,
                          ] as const,
                      ),
                    ]}
                  />
                  <Select
                    label="Test"
                    name={`c${i}_op`}
                    value={c?.op ?? ""}
                    options={OP_OPTIONS}
                  />
                  <s-text-field
                    label="Value"
                    name={`c${i}_value`}
                    value={String(v)}
                    details="Numbers in store currency or kg. Lists are comma separated, for example DE, AT or PICK_UP."
                  />
                </s-grid>
              );
            })}
          </s-stack>
        </s-section>
        <s-section>
          <s-stack direction="inline" gap="base">
            <s-button type="submit" variant="primary">
              Save rule
            </s-button>
            <s-button href="/app/tester" variant="secondary">
              Try it in the cart tester
            </s-button>
          </s-stack>
        </s-section>
      </Form>
    </s-page>
  );
}

export default function RuleEditor() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>() as
    { errors?: string[] } | undefined;
  return <EditorView data={data} errors={result?.errors} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
