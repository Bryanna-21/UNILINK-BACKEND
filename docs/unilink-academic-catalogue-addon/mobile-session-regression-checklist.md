# Mobile regression checklist: update logs user out / loses course selection

The report may have two distinct causes: (1) the app's auth token is removed or not rehydrated after an update; (2) the backend response omits `courseId`, so academic setup cannot restore it. Test both.

## Test before changes
1. Sign in, select institution/course/year/semester, fully close the app, reopen.
2. Confirm `/api/auth/me` returns the same `courseId`, programme, year and semester.
3. Install an OTA update without clearing app data; reopen and check whether token remains in SecureStore and user state hydrates.
4. Record whether the JWT is actually expired (backend currently signs tokens for 24 hours).

## Fix requirements
- Do not clear SecureStore token or auth store just because app version/runtime changed unless there is a documented migration/security reason.
- Auth hydration should read the stored token, call `/api/auth/me`, and only clear credentials on an explicit 401/403 or invalid/revoked token.
- Handle network errors as offline/unavailable, not as proof that the user is logged out.
- `courseId` must come from the persisted user profile, not only in-memory component state or a temporary form draft.
- Keep offline cache keyed by user ID and course ID; invalidate or switch keys only when the user deliberately changes course/institution.
- After course selection, enrol idempotently, persist profile, update auth store from the server response, then navigate.
- If courseId is present and valid, do not show course selection again just because the app was updated.
- Test fresh login, app restart, OTA update, expired token, offline launch, deliberate institution change, and course deletion/mismatch.

## Required validation
- Backend: `npm test`.
- Mobile: project TypeScript check and Expo/Metro production bundle build.
- Review `git diff --check`, `git diff --stat`, `git status --short`.
- Do not commit or push until tests pass and the user explicitly approves.
