import { setupProductsAndPlans, isPaypalConfigured } from "../src/lib/paypal.js";

async function main() {
  if (!isPaypalConfigured()) {
    console.error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set in this environment.");
    process.exit(1);
  }
  console.log("Creating PayPal product + 3 subscription plans (Pro $19, Pro+ $39, Elite $99)...");
  const result = await setupProductsAndPlans();
  console.log("\n=== DONE ===");
  console.log(JSON.stringify(result, null, 2));
  console.log("\nSet these as Replit Secrets:");
  console.log(`  PAYPAL_PRO_PLAN_ID=${result.plans.pro}`);
  console.log(`  PAYPAL_PRO_PLUS_PLAN_ID=${result.plans.pro_plus}`);
  console.log(`  PAYPAL_ELITE_PLAN_ID=${result.plans.elite}`);
}

main().catch((e) => {
  console.error("Setup failed:", e);
  process.exit(1);
});
