# Universal collateral release

This change extends the existing PostgreSQL application. It is not a replacement deployment or a return to the legacy Cloudflare database.

## Release ordering

1. Preserve the target PostgreSQL database backup and existing migration checksums. Review the intended Vercel team, project, branch, commit and database environment.
2. Run `npm ci` and `npm run build`.
3. Apply the additive migration using `npm run db:migrate` against the **direct connection of the intended database**. `0005_universal_collateral` adds category, document-reference, security, eligibility, currency, valuation-input and tenant-catalog fields. It does not rewrite valuations or historical approvals. Only legacy `Lainnya` records are categorized as `OTHER`; existing property records remain `PROPERTY`.
4. Run `npm run db:verify`. Do not publish the new API/UI against an unmigrated database. Migration is deliberately not triggered by public requests or by builds.
5. Deploy the reviewed commit to the existing PostgreSQL preview target. Perform authenticated bank UAT: property and non-property create/edit/reload; incomplete submission denial; Maker–Checker–Reviewer–Approver; reviewer independent eligibility; blocked/expired assets; Admin catalog; FX; CSV; desktop/mobile; existing historical property views.
6. Production promotion requires the intended environment/database and bank release gates. A local build or ready preview is not evidence that production has been migrated or released.

## Data semantics

- Asset currency is an ISO-style three-letter code; values entered for native balances/prices must follow that currency and documented quotation basis. Final valuations and portfolio totals are IDR.
- All displayed valuation results remain indicative and depend on source reports, current quotes, actual unit basis, manual FX, approved policies and authorized appraisal staff.
- Additional Admin types inherit a category schema. New category-specific attributes or valuation logic still require a reviewed schema/code change.
- Document references are not files. Verification status is a recorded staff assessment, not cryptographic or registry proof.
- Registration, bank acceptance and regulatory recognition are distinct. This release implements the first two workflow layers; regulator-specific mapping/recognition remains outside the automatic engine.
- New submit/approve gates also apply to unapproved historical records; complete the category data and evidence before advancing them. Already approved records retain their historical status and values.

## Isolated local QA

`npm run dev` runs a **non-persistent synthetic PostgreSQL WASM database**, without any production credentials. Login: `admin@test.invalid` / `SyntheticPassword123!`. This account exists only in the local QA server and is never provisioned by the Vercel production API. The `/qa` route provides a synthetic session fixture for browser testing without entering credentials; `/mobile-qa` embeds the app at a 390-pixel viewport. These routes exist only in `scripts/dev-isolated.mjs`, not the deployed API. Restarting the server resets this QA database. Do not input real customer records.

## Rollback

Keep the additive database columns when rolling back the application. Never drop category data or reset the shared database. The old API may not understand new categories, and its property-only editing can overwrite values; disable writes to new-category records until a compatible release is restored. Preserve newly recorded independent eligibility and document references.

## Verification evidence for this change

- `npm run build`: syntax/configuration checks and 25 automated tests passed, with no skipped tests in that command.
- All 74 built-in types validated against their schemas and allowed methods; all 16 category workflows persisted through an isolated PostgreSQL WASM instance.
- Browser QA: switching property → deposits updates attributes/documents/security; a synthetic deposit saved and reloaded correctly; nominal IDR 80,000,000 with 5% haircut rendered IDR 76,000,000 after API persistence; Admin added a synthetic machinery subtype and the catalog increased from 74 to 75 types in the isolated instance.
- Mobile QA: vehicle form at a 390-pixel iframe viewport measured 375-pixel document scroll width, with no horizontal overflow.
- Browser QA found and fixed premature detail rendering during API loading and custom-type code generation on non-secure local origins.
- Live PostgreSQL credentials, migration execution, network pool/concurrency checks and production release were not performed by these isolated tests.
