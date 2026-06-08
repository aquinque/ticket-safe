// export-payout-batch — Supabase Edge Function (Deno)
// POST /functions/v1/export-payout-batch
// Admin only. Generates SEPA pain.001.001.03 XML with all pending Studio +
// resale payouts, marks rows as processing with a batch id.
// (Full body deployed via MCP — this is the on-disk stub.)
export {};
