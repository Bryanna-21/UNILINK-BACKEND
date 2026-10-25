# Legal workstream 1: Privacy Notice and acknowledgement (DRAFT)

Prepared 24 Oct 2026. These are working documents for the owner and a Kenyan lawyer. **Nothing here is legal advice, and nothing has been approved by a lawyer or the ODPC.** The Privacy Notice is served as a draft until `LEGAL_REVIEW_STATUS=reviewed` is set.

Files: `legal-risk-register.md` (findings, evidence, status), `privacy-notice-sources.md` (law checked, with uncertainty), `owner-decisions.md` (questions only the owner or a lawyer can answer).

## What this change adds
- `GET /api/legal/privacy` (public): the versioned notice, with the owner's details filled in or visibly marked missing.
- `GET /api/legal/status` and `POST /api/legal/acknowledge` (signed in): has this person confirmed the current version; record that they did. Evidence is append-only in `policyacknowledgements` (user, notice, version, source, time; no IP address, no device data).
- Tests that tie the notice to the code (processors, deletion behaviour, AI and SMS contents, no analytics SDK). If the code changes, the test fails until the notice and its version are updated.

This is an **acknowledgement of a notice, not consent**. Optional processing that needs consent would be a separate record with its own withdrawal. None exists yet.

## Environment variables (set on Render; none are secrets)
| Variable | Meaning |
|---|---|
| `LEGAL_OPERATOR_NAME` | legal name of the operator |
| `LEGAL_CONTACT_EMAIL` | privacy contact / rights requests |
| `LEGAL_POSTAL_ADDRESS` | postal or physical address |
| `LEGAL_ODPC_REGISTRATION` | registration number, or a statement that it is not required (lawyer to confirm) |
| `LEGAL_DPO_CONTACT` | DPO contact, or "None appointed" |
| `LEGAL_HOSTING_LOCATIONS` | countries where the API, database and file storage actually run |
| `LEGAL_RETENTION_PERIODS` | retention for safety reports, moderation records, backups |
| `LEGAL_AGE_POLICY` | the age statement, decided with a lawyer |
| `LEGAL_REVIEW_STATUS` | set to `reviewed` only after a lawyer has reviewed the notice |

Unset variables show as `[Owner to provide: ...]` in the public notice. That is intentional: an unfinished notice must not look finished.

## Rollback
The change is additive. To roll back: revert the commit (it adds files, one `app.use` line, and one collection that nothing else reads). The `policyacknowledgements` collection can stay or be dropped; nothing depends on it. The web changes are separate (see the frontend package).

## Compatibility
Old mobile builds and old web builds are unaffected: no existing endpoint changed and nothing blocks on acknowledgement server-side. Enforcement is client-side only (the web prompt). Do not enable any server-side block until the mobile app also shows the prompt.
