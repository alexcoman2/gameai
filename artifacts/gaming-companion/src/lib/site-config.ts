/**
 * Company / legal entity details shown on the public legal pages and used
 * as the "Merchant of Record contact" for Paddle live-mode verification.
 *
 * These MUST be filled in with real values before flipping Paddle from
 * sandbox to live — Paddle's compliance team will reject any URL whose
 * contact info is generic or unreachable.
 *
 * Override at build time with VITE_* environment variables if you'd
 * rather not hard-code them.
 */
export const SITE_CONFIG = {
  productName: "Unstuck",
  legalEntityName:
    import.meta.env.VITE_LEGAL_ENTITY_NAME ?? "Alexandru Coman",
  contactEmail:
    import.meta.env.VITE_CONTACT_EMAIL ?? "comanalex972@gmail.com",
  refundsEmail:
    import.meta.env.VITE_REFUNDS_EMAIL ?? "comanalex972@gmail.com",
  privacyEmail:
    import.meta.env.VITE_PRIVACY_EMAIL ?? "comanalex972@gmail.com",
  // ISO 3166-1 alpha-2 country code of the governing-law jurisdiction.
  jurisdiction:
    import.meta.env.VITE_LEGAL_JURISDICTION ?? "the United States",
  // "Last updated" date for the legal documents. Bumped manually whenever
  // we materially change Terms / Privacy / Refund text.
  legalEffectiveDate: "May 23, 2026",
};
