# Required schema/controller integration

This checklist is intentionally explicit because the current backend schema is strict and silently drops undeclared fields.

## 1. `src/models/University.js`
Add fields:
```js
institutionType: {
  type: String,
  enum: [
    "university", "national_polytechnic", "tvet_college",
    "technical_institute", "teacher_training_college",
    "medical_training_college", "other_tertiary"
  ],
  default: "university"
},
catalogueVerificationStatus: {
  type: String,
  enum: ["verified", "needs_client_verification", "needs_official_verification"],
  default: "needs_client_verification"
},
verificationSource: { type: String, default: null },
```
Existing university records default to `university`. Candidate entries should remain marked unverified until checked.

## 2. `src/models/Course.js`
Add:
```js
qualificationLevel: {
  type: String,
  enum: ["certificate", "diploma", "higher_diploma", "degree", "postgraduate", "other"],
  default: "degree"
},
fieldOfStudy: { type: String, default: "" },
verificationStatus: {
  type: String,
  enum: ["verified", "needs_client_verification", "needs_official_verification"],
  default: "needs_client_verification"
},
verificationSource: { type: String, default: null },
unitAssignments: [{
  unitId: { type: String, required: true },
  yearOfStudy: { type: Number, min: 1, max: 6, default: null },
  semester: { type: Number, min: 1, max: 3, default: null }
}],
```
Keep legacy `unitIds` while migrating. Unit assignment is course-specific, so a global unit can be scheduled differently on different courses. Preserve the existing unique `(universityId, code)` index; importer should upsert by that key.

## 3. `src/models/User.js`
Add a persisted course reference:
```js
courseId: { type: String, default: null },
```
This uses the current codebase's string IDs. Validate the ID with `unitsRules.isObjectId` before saving.

## 4. `src/controllers/profile.controller.js` (`updateMyProfile`)
- Destructure `courseId` from `req.body`.
- Load current user and `Course` when courseId is supplied.
- `courseId: null` clears the selection.
- A non-empty ID must pass `unitsRules.isObjectId`, refer to an existing course, and have `String(course.universityId) === String(effectiveUniversityId)`.
- If `universityId` changes and the request omits `courseId`, explicitly set `courseId = null`.
- Include `courseId` in the update response `.select(...)`.
- Preserve programme/year/semester values unless the client explicitly changes them; when the institution changes, clear these too if the UI doesn't collect replacements in the same request.
- Add tests for a valid course, malformed/missing course, institution mismatch, clearing course, and institution change clearing stale course.

## 5. `src/routes/auth.routes.js`
- Add `courseId: user.courseId || null` to `userResponseShape`.
- Include `courseId` in `/me` select.
- Ensure login response uses `userResponseShape` and verify the response tests assert the courseId survives a fresh login.
- Do not put courseId into JWT as a substitute for database persistence; it can change independently of a token.

## 6. `src/services/units.repo.js`
- Include `courseId` in the user select if the repo user shape is used by client-facing academic flows.

## 7. `src/controllers/course.controller.js`
`getUnitsForCourse` should merge the unit documents with their matching `course.unitAssignments` entries, returning `yearOfStudy` and `semester` for each unit. Sort by year, semester, then code. Existing legacy `unitIds` should still return units with null year/semester.
`attachUnit` should accept optional `yearOfStudy` and `semester`, validate the same ranges (year 1–6, semester 1–3), and upsert a unique assignment per `unitId` without duplicating `unitIds`. Preserve the existing lecturer/admin role checks and add course ownership/university authorization if absent.

## 8. Mobile app integration still required
This ZIP does not replace mobile source files. In `app/(tabs)/academics.tsx`, change the bottom section from “My Courses” cards to “My Units”, fetch `GET /courses/:courseId/units` for `user.courseId`, group by returned year/semester, show unit code/name and use offline cache. Keep other Academics navigation unchanged.
In `app/auth/academic-setup.tsx`, initialize selected course from `user.courseId`, and only route to setup when required academic fields are genuinely missing. Changing institution must clear selected course and stale draft values. On save, keep `courseId`, programme, year, semester in auth state.
Check the auth store/persistence and API client after an OTA/native app update. A release update should not unconditionally clear the token or auth store; on launch, hydrate secure storage and call `/api/auth/me` before redirecting to login/setup. If token expiry (currently JWT `expiresIn: "24h"`) is the cause, decide whether to implement refresh tokens; don't simply extend JWT lifetime without a revocation/security plan.
