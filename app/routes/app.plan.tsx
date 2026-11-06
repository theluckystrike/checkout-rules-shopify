import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { planAction, planData } from "../lib/handlers.server";
import { PRICES, PRO_ANNUAL, PRO_MONTHLY, TRIAL_DAYS } from "../lib/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  return planData(admin, billing);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  return planAction(admin, billing, await request.formData());
};

type Data = Awaited<ReturnType<typeof planData>>;

export function PlanView({
  data,
  notice,
}: {
  data: Data;
  notice?: { ok: boolean; message: string };
}) {
  const pro = data.plan === "pro";
  return (
    <s-page heading="Plan">
      {notice?.message ? (
        <s-banner tone={notice.ok ? "success" : "critical"}>
          {notice.message}
        </s-banner>
      ) : null}
      {data.test ? (
        <s-banner tone="info">
          This is a development store, so Shopify makes test charges only. No
          money moves.
        </s-banner>
      ) : null}
      <s-stack gap="base">
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <s-section heading="Free">
            <s-stack gap="base">
              <s-text type="strong">$0, forever</s-text>
              <s-unordered-list>
                <s-list-item>
                  3 rules on at a time, shipping and payment together
                </s-list-item>
                <s-list-item>
                  Hide, rename and move, with every condition
                </s-list-item>
                <s-list-item>Cart tester</s-list-item>
              </s-unordered-list>
              {pro ? null : <s-badge tone="success">Current plan</s-badge>}
            </s-stack>
          </s-section>
          <s-section heading="Pro">
            <s-stack gap="base">
              <s-text type="strong">
                ${PRICES[PRO_MONTHLY]} a month, or ${PRICES[PRO_ANNUAL]} a year
              </s-text>
              <s-unordered-list>
                <s-list-item>No limit on rules</s-list-item>
                <s-list-item>Everything in Free</s-list-item>
                <s-list-item>
                  {TRIAL_DAYS}-day free trial, billed by Shopify on your Shopify
                  invoice
                </s-list-item>
              </s-unordered-list>
              {pro ? (
                <s-stack gap="base">
                  <s-badge tone="success">Current plan</s-badge>
                  <Form method="post">
                    <input type="hidden" name="intent" value="cancel" />
                    <s-button type="submit" tone="critical" variant="secondary">
                      Cancel Pro
                    </s-button>
                  </Form>
                </s-stack>
              ) : (
                <s-stack direction="inline" gap="base">
                  <Form method="post">
                    <input type="hidden" name="intent" value="subscribe" />
                    <input type="hidden" name="plan" value={PRO_MONTHLY} />
                    <s-button type="submit" variant="primary">
                      Start Pro for ${PRICES[PRO_MONTHLY]} a month
                    </s-button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="intent" value="subscribe" />
                    <input type="hidden" name="plan" value={PRO_ANNUAL} />
                    <s-button type="submit" variant="secondary">
                      Pay ${PRICES[PRO_ANNUAL]} a year
                    </s-button>
                  </Form>
                </s-stack>
              )}
            </s-stack>
          </s-section>
        </s-grid>
        <s-section heading="If you cancel">
          <s-paragraph>
            Your rules stay saved. Checkout keeps running the first 3 enabled
            rules, so nothing breaks at checkout.
          </s-paragraph>
        </s-section>
      </s-stack>
    </s-page>
  );
}

export default function Plan() {
  const data = useLoaderData<typeof loader>();
  const notice = useActionData<typeof action>();
  return <PlanView data={data} notice={notice} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
