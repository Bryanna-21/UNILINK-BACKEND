"use strict";

const { countryKey, pickNumbers } = require("../utils/emergencyNumbers.rules");

// Looks up the emergency numbers for a university's country. Dependencies are injected for tests.
function createNumbersService({ University, EmergencyNumber }) {
  async function forCountry(countryName) {
    const key = countryKey(countryName);
    const record = key ? await EmergencyNumber.findOne({ countryKey: key }).lean() : null;
    return pickNumbers({ record, countryName });
  }

  async function forUniversity(universityId) {
    let countryName = null;
    if (universityId) {
      try {
        const university = await University.findById(universityId).select("country").lean();
        countryName = (university && university.country) || null;
      } catch (error) {
        countryName = null; // a malformed id means no known country, not a failure
      }
    }
    return forCountry(countryName);
  }

  return { forCountry, forUniversity };
}

let instance = null;
function real() {
  if (!instance) {
    instance = createNumbersService({
      University: require("../models/University"),
      EmergencyNumber: require("../models/EmergencyNumber"),
    });
  }
  return instance;
}

module.exports = {
  createNumbersService,
  forUniversity: (...a) => real().forUniversity(...a),
  forCountry: (...a) => real().forCountry(...a),
};
