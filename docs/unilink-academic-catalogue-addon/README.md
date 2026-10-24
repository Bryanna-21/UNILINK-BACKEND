# UniLink Kenyan Tertiary Catalogue Add-on

This is a safe, additive backend add-on prepared for the current UniLink schema.
It is deliberately **not a claim that every listed programme is officially offered**
by the named institution. Institutions are catalogued as provisional candidates;
programme records must be confirmed by the client and the relevant institution.

## Contents
- `scripts/seedKenyanTertiaryInstitutions.js` — idempotently adds Kenyan tertiary institutions to the existing `University` collection.
- `scripts/seedProvisionalDiplomaNursingCourses.js` — template/importer for explicitly unverified diploma and nursing programmes; it only creates courses for institution names you explicitly configure.
- `patches/schema-and-controller-checklist.md` — required integration points for `courseId`, programme verification metadata, course-specific unit scheduling, login `/me` responses, and My Units.
- `patches/mobile-session-regression-checklist.md` — focused checklist for the app-update sign-out / course-selection regression.

## Important
1. Back up the database and repository before running scripts.
2. Do not run scripts against production until the client confirms the institution and programme list.
3. The existing `University` model currently does not declare `institutionType`; Mongoose strict mode drops undeclared fields. Apply the schema changes in the checklist before relying on those fields.
4. Existing `Course` has a unique `(universityId, code)` index. The course importer updates records by institution+code and does not delete anything.
5. Do not run any destructive seed script. This package contains no delete/drop operations.
6. The ZIP is an integration add-on, not a validated replacement for the whole backend/mobile repositories. Run the existing test suite and mobile type/build checks after applying the integration checklist.
