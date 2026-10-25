"use strict";
// Records an earlier clean-up had already deactivated still need a campus under the single KMTC institution.
const test = require("node:test");
const assert = require("node:assert/strict");
const r = require("../src/utils/consolidation.rules");

const I = (id, name, extra = {}) => ({ _id: id, name, status: "active", ...extra });
const base = [I("k", "Kenya Medical Training College")];

test("every campus-record that is not blocked gets a campus, whether it is still active or already inactive", () => {
  const p = r.planKmtcConsolidation({ institutions: [...base, I("1", "Kenya Medical Training College - A Campus"), I("2", "Kenya Medical Training College - B Campus", { status: "inactive" })] });
  assert.deepEqual(p.campuses.map((c) => [c.campusName, c.action, c.ensureCampus]), [["A Campus", "consolidate", true], ["B Campus", "already-inactive", true]]);
});
test("a blocked record (students or enrolments) gets no campus and is not retired", () => {
  const p = r.planKmtcConsolidation({ institutions: [...base, I("1", "Kenya Medical Training College - A Campus")], studentsByUni: { 1: 3 } });
  assert.equal(p.campuses[0].action, "blocked");
  assert.equal(p.campuses[0].ensureCampus, false);
});
test("the counts shape is unchanged", () => {
  const p = r.planKmtcConsolidation({ institutions: [...base, I("1", "Kenya Medical Training College - A Campus", { status: "inactive" })] });
  assert.deepEqual(Object.keys(p.counts).sort(), ["alreadyInactive", "blocked", "consolidate", "total"]);
});
