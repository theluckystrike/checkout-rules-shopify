import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { testerAction, testerData } from "../lib/handlers.server";
import { DEFAULT_SAMPLE } from "../lib/sample";
import { Select } from "../components/Select";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  const d = await testerData(admin, billing);
  return { plan: d.plan, ruleCount: d.ruleCount };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  return testerAction(admin, billing, await request.formData());
};

type Result = Awaited<ReturnType<typeof testerAction>>;

function Column({
  title,
  visible,
  hidden,
}: {
  title: string;
  visible: string[];
  hidden: string[];
}) {
  return (
    <s-section heading={title}>
      <s-stack gap="small-200">
        {visible.map((v, i) => (
          <s-text key={`v${i}`}>
            {i + 1}. {v}
          </s-text>
        ))}
        {hidden.map((h, i) => (
          <s-stack key={`h${i}`} direction="inline" gap="small-200">
            <s-badge tone="critical">Hidden</s-badge>
            <s-text tone="neutral">{h}</s-text>
          </s-stack>
        ))}
      </s-stack>
    </s-section>
  );
}

export function TesterView({
  ruleCount,
  out,
}: {
  ruleCount: number;
  out?: Result;
}) {
  const f = out?.fields ?? DEFAULT_SAMPLE;
  return (
    <s-page heading="Cart tester">
      <s-paragraph>
        Build a sample cart and see what the buyer gets at checkout with your{" "}
        {ruleCount} saved rule
        {ruleCount === 1 ? "" : "s"}. The tester runs the same code as the
        checkout Functions.
      </s-paragraph>
      <Form method="post">
        <s-section heading="Sample cart">
          <s-stack gap="base">
            <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
              <s-text-field
                label="Subtotal (store currency)"
                name="subtotal"
                value={f.subtotal}
              />
              <s-text-field
                label="Country code"
                name="country"
                value={f.country}
              />
              <s-text-field label="Postal code" name="zip" value={f.zip} />
            </s-grid>
            <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
              <s-text-field
                label="Items"
                name="itemCount"
                value={f.itemCount}
              />
              <s-text-field
                label="Weight (kg)"
                name="weightKg"
                value={f.weightKg}
              />
              <Select
                label="Chosen delivery type"
                name="deliveryMethod"
                value={f.deliveryMethod}
                options={[
                  ["SHIPPING", "Shipping"],
                  ["PICK_UP", "Store pickup"],
                  ["PICKUP_POINT", "Pickup point"],
                  ["LOCAL", "Local delivery"],
                ]}
              />
            </s-grid>
            <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
              <s-text-field
                label="Customer tags"
                name="customerTags"
                value={f.customerTags}
              />
              <s-text-field
                label="Product tags in cart"
                name="productTags"
                value={f.productTags}
              />
              <Select
                label="B2B buyer"
                name="b2b"
                value={f.b2b}
                options={[
                  ["no", "No"],
                  ["yes", "Yes"],
                ]}
              />
              <Select
                label="Logged in"
                name="loggedIn"
                value={f.loggedIn}
                options={[
                  ["no", "No"],
                  ["yes", "Yes"],
                ]}
              />
            </s-grid>
            <s-grid gridTemplateColumns="repeat(2, 1fr)" gap="base">
              <s-text-area
                label="Shipping options (name: price)"
                name="shipping"
                value={f.shipping}
                rows={4}
              />
              <s-text-area
                label="Payment methods (one per line)"
                name="payments"
                value={f.payments}
                rows={4}
              />
            </s-grid>
            <s-button type="submit" variant="primary">
              Run the rules
            </s-button>
          </s-stack>
        </s-section>
      </Form>
      {out ? (
        <s-stack gap="base">
          <s-box padding="small-200" />
          {out.result.ignoredByPlan > 0 ? (
            <s-banner tone="warning">
              {out.result.ignoredByPlan} rule
              {out.result.ignoredByPlan === 1 ? " was" : "s were"} skipped by
              the free plan limit.
            </s-banner>
          ) : null}
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <Column
              title="Shipping options the buyer sees"
              {...out.result.shipping}
            />
            <Column
              title="Payment methods the buyer sees"
              {...out.result.payment}
            />
          </s-grid>
        </s-stack>
      ) : null}
    </s-page>
  );
}

export default function Tester() {
  const { ruleCount } = useLoaderData<typeof loader>();
  const out = useActionData<typeof action>();
  return <TesterView ruleCount={ruleCount} out={out} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
