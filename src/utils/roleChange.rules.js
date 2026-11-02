"use strict";

// Who may change whose role, and to what. Pure, so every rule is tested without a database.
//
//   admin       may turn a student into a lecturer, and a lecturer back into a student, but only
//               inside their own university (a platform admin, with no university, may do it in any).
//   superadmin  may also make admins, and turn an admin back into a lecturer or student.
//   nobody      may change their own role, touch a superadmin, or create a superadmin here.
//
// planRoleChange returns { ok:true, set:{...}, from, to } or { ok:false, status, message }.

const ASSIGNABLE = ["student", "lecturer", "admin"];

const fail = (status, message) => ({ ok: false, status, message });
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

const isPlatformLevel = (actor) => actor.role === "superadmin" || !actor.universityId;

function planRoleChange({ actor, target, newRole, universityId, platformWide, department }) {
  if (!actor || (actor.role !== "admin" && actor.role !== "superadmin")) return fail(403, "Only admins can change roles.");
  if (!target || target.deletedAt) return fail(404, "User not found.");
  if (!ASSIGNABLE.includes(newRole)) return fail(400, "Choose student, lecturer or admin.");
  if (sameId(actor.id, target.id)) return fail(403, "You cannot change your own role.");
  if (target.role === "superadmin") return fail(403, "A superadmin account cannot be changed here.");
  if (target.removedAt) return fail(409, "This account was removed and cannot be changed.");
  if (target.role === newRole) return fail(409, `This user is already a ${newRole}.`);

  const promoting = newRole === "lecturer" || newRole === "admin";
  if (promoting && target.status !== "active") return fail(409, "Only active accounts can be promoted.");
  if (promoting && !target.isVerified) return fail(409, "This account has not verified its email yet.");

  const superadmin = actor.role === "superadmin";

  // Who may touch this target at all.
  if (target.role === "admin" && !superadmin) return fail(403, "Only the superadmin can change an admin.");
  if (newRole === "admin" && !superadmin) return fail(403, "Only the superadmin can make an admin.");

  // An admin tied to a university only reaches people in that university.
  if (!superadmin && !isPlatformLevel(actor) && !sameId(actor.universityId, target.universityId)) {
    return fail(403, "You can only change roles inside your own university.");
  }

  const set = { role: newRole };

  if (newRole === "admin") {
    // Least privilege by default: the new admin stays tied to the person's own university.
    // Only an explicit platformWide:true makes an admin who can act on every university.
    if (platformWide === true) {
      set.universityId = null;
    } else {
      const uni = universityId || target.universityId;
      if (!uni) return fail(400, "Choose a university for this admin, or make them platform-wide.");
      set.universityId = String(uni);
    }
  } else {
    // student or lecturer: the person keeps the university they already belong to. A supplied
    // university is used only to fill a gap (a platform admin who is being demoted has none);
    // this never moves anyone between universities.
    const uni = target.universityId || universityId;
    if (!uni) return fail(400, "Choose a university for this user.");
    if (!target.universityId) set.universityId = String(uni);
  }

  if (newRole === "lecturer" && typeof department === "string" && department.trim()) {
    set.department = department.trim().slice(0, 100);
  }

  return { ok: true, from: target.role, to: newRole, set };
}

module.exports = { ASSIGNABLE, planRoleChange };
