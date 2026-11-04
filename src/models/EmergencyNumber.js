const mongoose = require("mongoose");

// The emergency numbers for one country, set by a superadmin (see utils/emergencyNumbers.rules.js
// for why nothing but Kenya is built in).
const emergencyNumberSchema = new mongoose.Schema({
  countryKey: { type: String, required: true, unique: true }, // "kenya"
  country: { type: String, required: true }, // "Kenya"
  numbers: [
    {
      _id: false,
      label: { type: String, required: true },
      number: { type: String, required: true },
    },
  ],
  updatedBy: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("EmergencyNumber", emergencyNumberSchema);
