// Centralized role checks. Existing controllers each redefine this
// logic locally (course.controller.js, timetable.controller.js,
// attendance.controller.js inline it; community/event/library/
// resources.controller.js each define their own local isStaff()).
// New code should import from here instead of adding a twelfth copy.
// Migrating the existing nine call sites to this helper is a
// separate, deliberate cleanup pass — not bundled into this change.

exports.isLecturer = (role) => role === "lecturer";
exports.isStaff = (role) => role === "lecturer" || role === "admin";
