# Family Fair

Family Fair is a free service for River Tech families and staff: a public, searchable directory where parents, children, and staff introduce themselves and share what they do with one another. River Tech charges no listing fees, receives no commissions, and earns no income from the directory or arrangements between participants. Parents and staff verify an email, submit a listing, and wait for school approval. There are no accounts to create, passwords, payments, or new paid services.

## Architecture and inspected sources

- Website baseline: `rivertechschool-org/river-tech-site`, `60e54c0`, GitHub Pages. Plain HTML/CSS/JS, matching the existing site; the locked navigation code and shared styles are unchanged.
- Existing forms use Google Apps Script, Sheets, and Drive. Family Fair uses one separate Apps Script project, one private listing spreadsheet, and one private photo folder. Existing form deployments are untouched.
- The live 2026–27 Register metadata, header row, and Columns contract were read on September 16, 2026. Eligibility uses columns named `Status`, `Parent email`, and `Parent 2 email`, with `Enrolled` or `Committed`. This includes full-time and à la carte families. No extra family roster is maintained.
- The current student portal was also inspected at `1237970`. Its parent flow uses email/password registration and login; its OTP exchange belongs to student PIN sign-in. Neither is an existing Register-based parent passwordless service suitable for reuse here.
- The server reads only the three eligibility columns, plus header names. It does not read student names, birth dates, grades, health notes, or family addresses. It never writes the Register.

## Public and listing-owner flow

`pages/family-fair.html` is linked from School Resources and the home-page footer, and included in the sitemap. Browsing and searching do not require sign-in. New content starts empty; no fictional examples are part of the deployed data.

The parent enters an email on file in the current Register, or a staff member enters an address in the private `STAFF_EMAILS` allowlist. The server matches it exactly after trimming/lowercasing, then emails an eight-digit one-time code. The browser receives the same message whether an address is eligible or not. Codes expire in ten minutes, allow five attempts, and work once. Requests are limited to five per address per hour, one per minute, and eighty globally per hour. Delivery also respects the Google mail quota. A resend replaces the earlier code.

A verified session lasts eight hours and stays only in the page's memory; reloading requires a fresh sign-in. Every protected request rechecks live eligibility. Signing out revokes the server session. Secrets, code hashes, session hashes, limits, and the admin allowlist stay in Script Properties; no credentials or Register IDs are in the frontend.

A listing has title, display name, category, a single-paragraph description (at most five sentences and 300 characters), optional square photo, and public contact details. Both the browser and server enforce the description limits through the shared `assets/js/family-fair-format.js` rules. A parent explicitly approves public display. Student listings use a single first name and the verified parent's email, enforced by the server. A student cannot supply a separate phone, email, or website. Administrators review descriptions/photos for sensitive details before approval.

New listings and edits are pending. Edits immediately hide previously published content. Parents and staff can edit/remove only their own listings, up to eight active listings per owner. Concurrent edits require the current version. Retrying the same saved submission request returns its result instead of creating a second row. Changes requested by the school appear in My listings. No automated notifications are sent beyond requested sign-in codes.

## Review

`pages/family-fair-admin.html` uses the same email-code flow with a separate server-side admin allowlist. It is marked noindex; security does not depend on hiding its URL. Reviewers can approve pending listings, request changes with a note, or take down published listings. Approval checks that the owner is still eligible. Public reads also exclude ineligible owners immediately. Staff access only permits adult/business listings. Student listings always require a currently eligible parent email, even if the owner is also staff. This is rechecked on submission, approval, public listing reads, and photo reads.

Only approved public fields are returned to visitors. Owner identity, status, consent time/version, review details, and photo file identifiers remain private. Contact information deliberately entered and approved for public display is public.

Square photos are resized directly. Rectangular photos open an inline square crop with drag positioning, keyboard-accessible position/zoom sliders, and an explicit confirmation. Cancelling preserves any previously chosen photo. Accepted crops are resized to at most 800 × 800 and re-encoded as JPEG. All public photo areas remain square at every screen size. The server rejects rectangular uploads, validates size and JPEG structure and strips EXIF/GPS and comment metadata. Files stay private in Drive. The API returns image bytes only for an approved listing or an authenticated owner/reviewer, never a public Drive link. Removed/replaced photos are trashed after the listing is saved. An ambiguous storage failure can leave a private orphan photo; it is never made public.

## Production deployment

Dan authorized publication on September 17, 2026. The tested standalone project was promoted to production with a fresh authentication secret, cleared test sign-in state, the verified current Register, and new empty private listing/photo storage. Dan is the sole authorized reviewer. Staging records remain separate. The committed endpoint points to this dedicated production deployment.

1. In the school's Google account, create a **standalone Apps Script project**, a **private blank spreadsheet** for Family Fair listings, and a **private Drive folder** for listing photos. Do not reuse or append to the Register, Placement Board, or an existing form project. Limit access to the deployment owner and authorized reviewers.
2. Add `Code.gs` and `appsscript.json` from this folder, and add `assets/js/family-fair-format.js` as a script file named `Format.gs`. The format file is shared with the website; keep both copies on the same version. Set the following **Script Properties**, never public source:

   | Property | Value |
   | --- | --- |
   | `REGISTER_ID` | ID of the verified current River Tech Register |
   | `REGISTER_TAB` | `Register` |
   | `LISTINGS_ID` | ID of the separate private Family Fair spreadsheet |
   | `PHOTOS_FOLDER_ID` | ID of the private photo folder |
   | `STAFF_EMAILS` | Comma-separated, verified current staff contact emails; listing access only, not review access |
   | `ADMIN_EMAILS` | Comma-separated emails of Dan's approved reviewers |
   | `AUTH_SECRET` | A new cryptographically random 32-byte secret, encoded as base64 (44 characters) |

3. Run `setupFamilyFair` in the Apps Script editor. It verifies headers/private photo storage and creates only the listing header. Complete the script's Google authorization with the deployment owner. The owner needs read access to the Register, edit access to the two new storage locations, and permission to send verification mail. Code-level Register access is read-only; Apps Script's Sheets scope itself is broad, so limit who can edit the script.
4. First use **separate staging storage and a fictional Register with the same headers**. Deploy as a web app, execute as the owner, access **Anyone**. Authenticate actual test mailboxes through the ordinary code flow. There is no test override or bypass in the production code. Check the entire browser-to-Google path: redirects/CORS, real inbox receipt, wrong/expired codes, create with photo, private pending state, admin review, public read, edit/resubmit, and removal. Do not write test rows into the live Register or notify real families as a test.
5. Once the staging checks pass and launch is authorized, configure the live Register and empty production listing/photo storage. Put the production `/exec` URL in `assets/js/family-fair-config.js`, bump its query version on both pages, and publish the reviewed branch. Pushing `main` publishes GitHub Pages; local Apps Script source does not auto-deploy.
6. Read back the actual website and production endpoint. Perform an authorized test using an appropriate current parent and designated reviewer; confirm the message in the real test inbox and the saved listing in the private spreadsheet. Remove that test listing after checking it. Verify normal public browsing from a signed-out browser.

Staff addresses were verified against Dan’s current Google Contacts **Staff** group (15 members) on September 17, 2026. The allowlist is private configuration, not published source and not a domain wildcard. Add/remove verified addresses there when staff membership changes; removals apply to existing sessions and public listings immediately. This simple list is maintained explicitly, not automatically synced to Contacts. Admin access remains a separate allowlist.

For a school-year rollover, verify the new Register's three headers/status values, change `REGISTER_ID`, and clear `session:` and `otp:` properties. Do not copy forward an old eligibility snapshot. To roll back a launch, restore the website commit and disable the dedicated Apps Script deployment; retain the private listing records.

Google service behavior checked against the official [Content Service](https://developers.google.com/apps-script/guides/content), [Utilities](https://developers.google.com/apps-script/reference/utilities/utilities), and [Lock Service](https://developers.google.com/apps-script/reference/lock/lock-service) documentation. The real Google staging checks below passed on September 17, 2026. Production setup also completed successfully against the actual Register and empty private listing/photo storage; the website smoke test follows publication.

## Local verification

Requires Node.js 20 or newer; no package install.

```sh
node --test tests/family-fair/*.test.mjs
node tests/family-fair/preview.mjs
```

Open `http://127.0.0.1:4177/pages/family-fair.html`.

The preview executes the production `Code.gs` through local Google-service adapters. The adapters use fictional records, an in-memory spreadsheet/photo store, and a visible **test mailbox**; no real email or Google writes occur. Parent: `parent@example.test`; second parent: `second@example.test`; another current family: `other@example.test`; staff without an enrolled family: `staff@example.test`; admin: `reviewer@example.test`. View requested codes at `/__test/inbox`. The preview's endpoint replacement is server-only and is not written into the deployed configuration.

Do not deploy the preview server or expose its port. It binds only to `127.0.0.1`, rejects other hosts/origins, and loses its fictional data when stopped.

For the Google staging check, run the same preview with `FAMILY_FAIR_STAGING_API` set to the dedicated staging `/exec` URL. The browser calls Google directly, so this tests the real cross-origin path without editing the website's production configuration. This mode disables the local API and test mailbox and clearly labels that verification codes are delivered by email. Use only the separate test Register and storage described above.

### Verification performed on September 16, 2026

- **16/16 automated tests passed**, including 13 executing the real `Code.gs`: lifecycle, eligibility in both parent columns, code expiry/replay/attempts/rate limits, role separation, ownership, revocation, withdrawal, validation, duplicate retry, stale-version conflicts, student restrictions, photo privacy/EXIF removal, recovery from provider failures, and server rejection of rectangular photos and long/multi-paragraph descriptions. Shared-format tests cover sentence counting, abbreviations, and square crop bounds for landscape, portrait, and square images.
- **Browser flow passed against the local adapters:** wrong code → valid code → parent listing with photo → hidden pending → admin approval → signed-out public viewing/search/category filtering → edit hides listing → admin requests changes → parent reads note and resubmits → reapproval. Student creation, second-parent sign-in, removal confirmation, and logout were also exercised through the UI.
- **Revised form verified:** six sentences and line breaks rejected; square photos accepted directly; rectangular crop adjusted by drag and keyboard sliders; confirmation produces a square JPEG; cancellation preserves the prior selection; the same file can be selected again for a new crop. A square photo passed submission, approval, and public display. The crop controls and square card fit the 390-pixel phone layout without horizontal overflow.
- **Visual checks:** desktop, 390-pixel phone layout and listing dialog, and 320-pixel width; no horizontal overflow. Existing mobile menu opens/closes; its intentional slow fade is preserved. No browser console warnings/errors were observed in the final check. Page IDs and local asset references are valid. The shared navigation script and stylesheet are byte-identical to baseline.

### Deployed staging verification on September 17, 2026

- A dedicated Google Apps Script web app ran the reviewed source, with separate private listing/photo storage and a fictional Register. The real enrollment Register and production website were unchanged. The deployment owner completed Google authorization; `setupFamilyFair` completed successfully.
- The local website called the deployed Google endpoint directly, with no proxy or local service adapters. Anonymous listing reads, cross-origin POST requests, Google redirects, actual parent and reviewer code emails, and both sign-ins passed. A wrong code was rejected. Expiry, replay, and rate-limit edge cases remain covered by the automated tests above.
- A fictional parent listing with a rectangular photo was cropped to a 500 × 500 JPEG, submitted, and read back as pending in the actual private spreadsheet. Signed-out visitors saw no listing. Drive permission readback confirmed the photo was private to the deployment owner.
- School approval made the listing and square photo available to signed-out visitors. Search and category filters passed. A stale parent edit was rejected; after refreshing, an edit saved as pending and disappeared from public view. A reviewer note reached the parent's My listings view; the parent corrected and resubmitted it, and reapproval published the corrected text.
- Removal persisted as `removed` in the spreadsheet. The public directory and review queue returned to empty. The photo folder was empty, and Google Drive's viewer confirmed the test photo was in the trash. Both authenticated sessions were signed out after testing.
- This staging pass established the full Google service flow before Dan authorized the production launch described above.

### Staff access verification on September 17, 2026

- **20/20 automated tests passed.** New tests cover a staff listing through approval, photo delivery, edits and removal; exact staff address matching; no extra administrator rights; rejection of student listings from staff-only identities; staff removal; and loss of student-listing eligibility when a staff member's family leaves.
- The browser flow passed with a fictional staff-only address: emailed test code, adult form with Student disabled, submission hidden pending review, school approval, signed-out public display, and removal after refreshing the changed listing version. No real staff received test messages.
- The existing production deployment was updated to **version 2**, retaining its URL, Register and private storage. `Code.gs` was read back against the tested source. The private staff allowlist was read back as the 15 verified Staff contact addresses, including Luke; Dan remains the sole reviewer.
