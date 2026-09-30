const mongoose = require("mongoose");

// Sensitivity tiers gate lecturer visibility independent of course
// scoping. "restricted" types (abuse) are never shown to a lecturer
// automatically, even for their own students/course - they route to
// admin/safeguarding-authorized roles only. Other types are visible
// to a scoped lecturer once course-linked, or university-linked for
// a general/campus-wide report (see courseId comment below).
const RESTRICTED_TYPES = ["abuse"];
const VALID_TYPES = ["medical", "safety", "abuse", "sos", "help_request"];

// "help_request" is deliberately NOT an emergency in the same sense as
// the other four types — it's a general, non-urgent assistance ask
// (see requestHelp in the controller). It shares this model rather than
// getting its own collection so it inherits status tracking, admin
// notification, and audit logging for free, but it must never be mixed
// into the same triage view as a real emergency (especially SOS)
// without an explicit opt-in — see getAuthorizedReports'
// `includeHelpRequests` handling in the controller.
const NON_EMERGENCY_TYPES = ["help_request"];

const EmergencyReportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // Denormalized onto the report at creation time from the reporting
  // user's own record, NOT trusted from client input (see
  // reportEmergency). Used for both admin university-scoping and, for
  // reports with no courseId, lecturer scoping - a lecturer at the
  // same university sees a general/campus-wide report even though
  // there's no course relationship to authorize against.
  universityId: { type: String },

  // Optional. Set when filed from a course context. A lecturer may
  // see this report if courseId matches a course they teach
  // (Course.lecturerId) - OR, if courseId is null, if universityId
  // matches theirs (a general emergency is relevant to every lecturer
  // at that university, not scoped to one course).
  courseId: { type: String, default: null },

  type: { type: String, enum: VALID_TYPES, required: true },
  message: { type: String },
  location: { type: String },

  // GPS coordinates, distinct from the free-text `location` above
  // (e.g. "Library, 2nd floor") — set only for type "sos", where a
  // precise point matters and a human description alone isn't
  // enough. Optional on every other type; never required at the
  // schema level since a non-SOS report has no reason to carry it.
  coordinates: {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },

  // Set at creation for type "sos" only — the reporting user's own
  // trustedContacts snapshotted at the moment of the alert, not a
  // live reference to User.trustedContacts. If the user edits their
  // contact list later, this report still shows who was actually
  // notified at the time, not who's on the list now.
  notifiedContacts: [
    {
      name: String,
      phone: String,
      notifiedAt: { type: Date, default: Date.now },
      smsStatus: { type: String, enum: ["sent", "failed", "not_configured"], default: "not_configured" },
    },
  ],

  status: {
    type: String,
    enum: ["OPEN", "ACKNOWLEDGED", "RESPONDING", "ESCALATED", "RESOLVED", "DISMISSED"],
    default: "OPEN",
  },
  priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },

  // Set when a lecturer or admin takes ownership of responding.
  // Distinct from resolvedBy - a report can be assigned without yet
  // being resolved.
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  // Staff-only annotations, never shown to the reporting student.
  // Subdocument array so multiple responders can each leave a note
  // with their own attribution, rather than one overwritable field.
  internalNotes: [
    {
      authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      note: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    },
  ],

  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

EmergencyReportSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

EmergencyReportSchema.statics.RESTRICTED_TYPES = RESTRICTED_TYPES;
EmergencyReportSchema.statics.VALID_TYPES = VALID_TYPES;
EmergencyReportSchema.statics.NON_EMERGENCY_TYPES = NON_EMERGENCY_TYPES;

module.exports = mongoose.model("EmergencyReport", EmergencyReportSchema);
