const mongoose = require("mongoose");

// One shared room for admins and superadmins. Access is enforced in the routes
// (requireAdminOrSuperadmin), not here.
const staffMessageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  text: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model("StaffMessage", staffMessageSchema);
