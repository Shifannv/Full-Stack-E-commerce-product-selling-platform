import assert from "node:assert/strict";
import test from "node:test";
import { calculateSettlement } from "./finance.service";

test("settlement calculates commission, gateway fee, refund adjustment and net payable", () => {
  assert.deepEqual(calculateSettlement("1000.00", 1000, 250, "100.00"), { grossAmount: "1000.00", commissionAmount: "100.00", gatewayFeeAmount: "25.00", refundAdjustmentAmount: "100.00", netPayable: "775.00" });
  assert.throws(() => calculateSettlement("100.00", 9000, 2000), /exceed gross/);
  assert.throws(() => calculateSettlement("100.00", -1, 0), /Invalid fee rate/);
});
