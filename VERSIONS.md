# Version log

Every released build of Salon OS, newest first.

## 1.5.14 — 2026-08-14

Baseline. The version number starts here; everything before this shipped
unversioned, identified only by commit.

  - Square POS tiles, and a retail sales view for head office
  - Poppins wordmark on black; system status moved out of Admin behind a
    developer allowlist
  - Glass sign-in, one typeface, desktop-only counter and warehouse
  - Inventory split into retail and salon-use; System page; backup reporting
  - Co-branded wordmark; per-salon name and logo
  - Customer names and phone numbers withheld from the sales export for
    everyone except the account owner

---

**How this file is written.** `./scripts/release.sh [major|minor|patch]`
bumps `APP_VERSION` in `src/lib/version.ts` and `package.json`, adds the entry
above, commits and tags. Nothing here should be edited by hand: the running app
reports the same constant, and a changelog that disagrees with the build is
worse than no changelog.

Releasing is not deploying. A release can be built more than once — after an
infrastructure fix, say — so one version may span several commits. That is why
the console footer and `/api/health` show both the version and the exact commit.
