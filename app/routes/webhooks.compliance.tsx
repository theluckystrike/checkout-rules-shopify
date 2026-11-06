import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// The app stores no customer data. Rules live in Shopify metafields, sessions in our database.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} compliance webhook for ${shop}`);
  if (topic === "SHOP_REDACT") {
    await db.session.deleteMany({ where: { shop } });
  }
  return new Response();
};
