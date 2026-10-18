"use strict";

// Who receives a broadcast. Pure so the filter can be tested without a database.
const GLOBAL = "GLOBAL";

// Active, not removed or deleted. A user with no status field counts as active (older accounts).
function buildAudienceFilter({ universityId, campusId, roles }) {
  const filter = {
    role: { $in: roles },
    removedAt: null,
    deletedAt: null,
    status: { $nin: ["terminated", "suspended"] },
  };
  if (universityId && universityId !== GLOBAL) filter.universityId = String(universityId);
  if (campusId) filter.campusId = String(campusId);
  return filter;
}

module.exports = { GLOBAL, buildAudienceFilter };
