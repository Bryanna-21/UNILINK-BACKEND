# Legal risk register, workstream 1 (Privacy Notice and acknowledgement)

Prepared 24 Oct 2026 against: backend `main` 6735838, frontend and mobile zips uploaded 22 Oct 2026 (older than current main for those two). Only items I verified in code are "confirmed". Provider dashboards (Render, Cloudinary, Twilio, database host) were **not** inspected.

Severity: High, Medium, Low. "Fixed here" means fixed by this change; otherwise the fix is a later workstream or an owner decision.

## A. Confirmed defects and gaps (evidence in code)

| ID | Sev | Finding | Evidence | Concern | Status |
|---|---|---|---|---|---|
| LR-001 | Medium | Account deletion leaves the **username** and the university, campus, course, programme, year and semester on the anonymised account | `src/controllers/profile.controller.js` `deleteMyAccount`, line 440 onward: wipes name, email, photo links, bio, phone, admission number, trusted contacts, push token; no `user.username`, no academic fields | A username can identify a person; the old web page implied fuller erasure | **Notice now states exactly what stays** (tests lock this to the code). Erasing the username is a code change for the deletion workstream; owner decision Q9 |
| LR-002 | High | Uploaded files are **not deleted** from Cloudinary when an account is deleted | Same function has no Cloudinary call; `src/services/contentRemover.js` says files are deliberately not destroyed; only post deletion destroys media (`post.controller.js` line 544) | A person's photos and documents outlive "deletion"; old page said "photo" was erased | **Notice now says files are not automatically deleted.** Fix needed in the deletion workstream; owner decision Q9 |
| LR-003 | High | **No age data is collected or enforced** | `User` model has no date of birth or age field; register requires only name, email, password, university (`src/routes/auth.routes.js` lines 202, 223) | Children's data (DPA s.33) cannot be handled if minors cannot be identified | Not fixed. Needs owner decision Q4 first; do not ship a gate that is not enforced |
| LR-004 | High | The old web Privacy page was static, unversioned, with no record of who read it and no contact details unless an env var was set | `src/pages/Privacy.js` (frontend, 2 Oct draft) | Duty to notify (s.29); no evidence of notice | **Fixed here**: versioned notice, acknowledgement record, prompt after sign-in |
| LR-005 | Medium | The old page said coordinates are stored "where provided", but no client collects GPS | Mobile `app/(tabs)/emergency.tsx` line 23: "No GPS yet"; no `expo-location` dependency; model has unused `coordinates` (`EmergencyReport.js` line 49) | Inaccurate promise about data collected | **Fixed here**: notice says UniLink does not read GPS |
| LR-007 | Low | Brevo is the email provider in use; `resend` and `nodemailer` are listed dependencies but not used | `src/utils/otp.util.js` line 1 uses `sib-api-v3-sdk`; `package.json` lines 29 and 30 | Unused packages widen the supply-chain surface; old page named no provider | Notice names Brevo. Removing the two unused packages is a trivial later cleanup |
| LR-008 | Low | The website's "Privacy" settings card said "Coming soon" | `src/pages/Settings.js` (frontend) | A nonfunctional promise | **Fixed here**: shows the real notice version and link |
| LR-009 | Medium | The website has no way to delete an account | No delete call in the frontend source | Rights should be usable on every surface, or the limit stated | Notice and Settings now say so honestly; a web delete flow is a later item |

## B. Potential risks (need legal or operational judgement)

| ID | Sev | Concern | Why it matters |
|---|---|---|---|
| LR-006 | High | **Trusted contacts are third parties** whose name and phone number UniLink stores and texts, without telling or asking them. The Twilio message contains the student's name and location text (`src/utils/sms.util.js` line 43) | ODPC has found breaches of ss.28 and 29 where emergency-contact details were used without notifying those people (Zerox determination, see sources). Not binding on UniLink, but the same pattern. Owner decision Q5 |
| LR-010 | Medium | Web login token is kept in `localStorage` (`AuthContext.js` lines 19, 41, 66) | Readable by any injected script (XSS). A later security workstream should assess |
| LR-011 | Medium | No HTTP rate-limiting library was found in dependencies or `app.js` | Brute-force and abuse protection for login and OTP could not be confirmed; to be audited in the authentication workstream (not assumed either way) |
| LR-012 | Medium | Statement that sensitive reports are restricted to authorised staff was carried from the earlier draft and **not re-verified** | The notice was softened to "restricted further"; the emergency workstream must verify the scoping |
| LR-013 | Medium | Whether `smsStatus: "sent"` means the provider accepted the request or the message was delivered was **not examined** | The SOS workstream must verify delivery reporting (the brief forbids implying delivery that was only attempted) |

## C. Unverified legal obligations
Registration with the ODPC; the lawful basis for each purpose; breach-notification deadline (s.43); cross-border transfer conditions and safeguards; whether a data protection impact assessment is needed; retention periods; provider contract terms. See `privacy-notice-sources.md` and `owner-decisions.md`.

## D. Launch decision for this workstream
**Block launch:** (1) the eight `LEGAL_*` details unset, so the public notice still shows "[Owner to provide]"; (2) minimum-age policy undecided (LR-003); (3) trusted-contacts position undecided (LR-006); (4) notice not yet reviewed by a Kenyan lawyer.
**Resolve promptly, with a dated plan:** deletion gaps (LR-001, LR-002); web account deletion (LR-009); the mobile app showing the notice and the acknowledgement prompt (not in this package); provider contracts and transfer safeguards.
**Accept or monitor:** unused dependencies (LR-007); unused `coordinates` field (LR-005).

## Tests run for this workstream
Backend: `npm test` 464 of 464 pass (430 existing plus 34 new). Two deliberate code changes (adding an analytics dependency; making deletion erase the username) were applied to a scratch copy and the new tests failed as intended. Frontend: `react-scripts test` 25 of 25 pass (the frontend had no tests before), and `react-scripts build` compiles. Nothing was run against production, a real database, or a browser.
