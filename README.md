# CollMan — Collateral Management System

CollMan is the source-controlled repository for the Collateral Management System project.

## Repository policy

**GitHub is the source of truth.** A development task must not be reported as complete until its source changes are committed, pushed to this repository, and the resulting GitHub commit is verified.

Required workflow for each future development task:
1. Read the latest repository state before making changes.
2. Implement and review the requested changes; keep credentials and sensitive documents out of commits.
3. Run relevant checks for the code touched (format/lint, type-check, tests, build, security checks as appropriate). If checks cannot run, explicitly report this.
4. Commit changes with a descriptive message, using a feature branch and pull request for higher-risk changes when appropriate.
5. Push to GitHub and verify the remote commit SHA or pull request. When working directly on `main`, confirm the branch contains the commit.
6. Report the commit SHA/link, files changed, check results, and whether any changes remain unpushed. **Do not claim completion or production deployment without evidence.**

## Change tracking

Use conventional-style commit messages when feasible:
- `feat:` new functionality
- `fix:` defect correction
- `docs:` documentation
- `test:` automated test coverage
- `refactor:` structural improvements
- `chore:` maintenance and tooling

## Source materials

Business requirements and appraisal workbooks are available as project reference materials; their presence in a working session does not mean they are committed to GitHub. Confirm permission and information sensitivity before adding source documents to this public repository.

## Notes on synchronization

Repository updates from development work performed through ChatGPT require an explicit GitHub write operation for each change set. This README establishes the working convention; it does **not** install an always-running synchronizer for edits made outside this workflow.


## Restricted pilot deployment (2026-10-29)

Cloudflare Worker `collman` has been deployed to `https://collman.elang-haqeem.workers.dev`, protected by a Cloudflare Access administrator-only policy and verified Access JWT. The deployed code is in `deploy/cloudflare/worker.mjs`.

**This pilot is NOT the operational bank application.** It performs sample BRB/NP calculations only, does not persist any data, and must not receive real customer or collateral information. The earlier full Python foundation package and migrations are not yet synchronized into this GitHub repository. They remain in the delivery artifact. Release is explicitly blocked pending backend data persistence, bank RBAC/ABAC and SoD, legal/GIS validation, approved master data, PII protection, complete reporting, and production UAT.

ASUMSI: The restricted adapter and associated access policy exist solely for technical verification.
