"use strict";

// POST   /api/profile/trusted-contacts            add a contact (validated, capped at 5, no duplicates)
// DELETE /api/profile/trusted-contacts/:contactId remove one
//
// These answer before the older, unchecked versions in profile.controller.js (see app.js). The
// list is read with the old GET /api/profile/trusted-contacts, which is unchanged.

const { validateNewContact, MAX_CONTACTS } = require("../utils/trustedContact.rules");

function createTrustedContacts({ User, isValidId }) {
  async function add(req, res) {
    try {
      const me = await User.findById(req.user.id).select("trustedContacts").lean();
      if (!me) return res.status(404).json({ status: "error", message: "User not found." });

      const check = validateNewContact(req.body, me.trustedContacts);
      if (!check.ok) return res.status(check.status).json({ status: "error", message: check.message });

      // The cap is part of the update itself, so two quick taps cannot slip a sixth contact in.
      const updated = await User.findOneAndUpdate(
        { _id: req.user.id, [`trustedContacts.${MAX_CONTACTS - 1}`]: { $exists: false } },
        { $push: { trustedContacts: check.contact } },
        { new: true }
      )
        .select("trustedContacts")
        .lean();
      if (!updated) {
        return res.status(409).json({ status: "error", message: `You can have up to ${MAX_CONTACTS} trusted contacts. Remove one first.` });
      }
      return res.status(201).json({ status: "success", data: updated.trustedContacts });
    } catch (error) {
      console.error("[trusted-contacts] add failed:", error.message);
      return res.status(500).json({ status: "error", message: "Could not save the contact." });
    }
  }

  async function remove(req, res) {
    try {
      const { contactId } = req.params;
      if (!isValidId(contactId)) return res.status(400).json({ status: "error", message: "Invalid contact." });
      const updated = await User.findByIdAndUpdate(req.user.id, { $pull: { trustedContacts: { _id: contactId } } }, { new: true })
        .select("trustedContacts")
        .lean();
      if (!updated) return res.status(404).json({ status: "error", message: "User not found." });
      return res.status(200).json({ status: "success", data: updated.trustedContacts });
    } catch (error) {
      console.error("[trusted-contacts] remove failed:", error.message);
      return res.status(500).json({ status: "error", message: "Could not remove the contact." });
    }
  }

  return { add, remove };
}

let instance = null;
function real() {
  if (!instance) {
    instance = createTrustedContacts({
      User: require("../models/User"),
      isValidId: (v) => /^[0-9a-f]{24}$/i.test(String(v)),
    });
  }
  return instance;
}

module.exports = {
  createTrustedContacts,
  add: (req, res) => real().add(req, res),
  remove: (req, res) => real().remove(req, res),
};
