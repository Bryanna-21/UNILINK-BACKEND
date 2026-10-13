const mongoose = require("mongoose");

// A loan or sponsorship that an admin tells students about. UniLink only lists these and links out
// to the provider; it never takes applications or handles money.
const schema = new mongoose.Schema({
  type: { type: String, enum: ["loan", "sponsorship"], required: true, index: true },
  title: { type: String, required: true, maxlength: 150 },
  provider: { type: String, required: true, maxlength: 120 },
  description: { type: String, required: true, maxlength: 2000 },
  eligibility: { type: String, default: "", maxlength: 1000 },
  amountText: { type: String, default: "", maxlength: 80 },
  link: { type: String, default: "", maxlength: 500 },
  deadline: { type: Date, default: null },
  universityId: { type: String, required: true, index: true }, // a university id, or "GLOBAL" for all of UniLink
  postedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model("FinancialOpportunity", schema);
