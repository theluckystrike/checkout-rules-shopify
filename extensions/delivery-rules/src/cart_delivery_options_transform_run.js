// @ts-check
import { deliveryOperations } from "../../../shared/rules-engine.js";

/**
 * @param {any} input
 * @returns {{operations: any[]}}
 */
export function cartDeliveryOptionsTransformRun(input) {
  return deliveryOperations(input);
}
