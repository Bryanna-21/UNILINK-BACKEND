"use strict";

const VALID_QUALIFICATION_LEVELS = new Set([
  "certificate",
  "diploma",
  "higher_diploma",
  "degree",
  "postgraduate",
  "other",
]);

const VALID_VERIFICATION_STATUSES = new Set([
  "verified",
  "needs_client_verification",
  "needs_official_verification",
]);

function normalizeText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeInstitutionName(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCode(value) {
  return normalizeText(value).toLowerCase();
}

function candidateKey(candidate) {
  return `${normalizeInstitutionName(candidate && candidate.institutionName ? candidate.institutionName : "")}:${normalizeCode(candidate && candidate.code ? candidate.code : "")}`;
}

function validateCatalogueCandidate(candidate) {
  const errors = [];
  const source = candidate && typeof candidate === "object" ? candidate : {};

  const title = normalizeText(source.title);
  const code = normalizeText(source.code);
  const institutionName = normalizeText(source.institutionName);
  const country = normalizeText(source.country);
  const qualificationLevel = normalizeText(source.qualificationLevel);
  const verificationStatus = normalizeText(source.verificationStatus);
  const sourceUrl = normalizeText(source.sourceUrl || source.verificationSource || "");

  if (!institutionName) {
    errors.push("Missing institutionName.");
  }

  if (!country) {
    errors.push("Missing country.");
  }

  if (!title) {
    errors.push("Missing required title.");
  }

  if (!code) {
    errors.push("Missing required code.");
  }

  if (!VALID_QUALIFICATION_LEVELS.has(qualificationLevel)) {
    errors.push(`Invalid qualificationLevel: ${qualificationLevel || "<empty>"}. Valid values are ${Array.from(VALID_QUALIFICATION_LEVELS).join(", ")}.`);
  }

  if (!VALID_VERIFICATION_STATUSES.has(verificationStatus)) {
    errors.push(`Invalid verificationStatus: ${verificationStatus || "<empty>"}. Valid values are ${Array.from(VALID_VERIFICATION_STATUSES).join(", ")}.`);
  }

  if (!sourceUrl) {
    errors.push("Missing sourceUrl or verificationSource.");
  }

  if (!source.sourceType) {
    errors.push("Missing sourceType.");
  }

  if (!source.researchDate) {
    errors.push("Missing researchDate.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    normalized: {
      ...source,
      institutionName,
      country,
      title,
      code,
      qualificationLevel,
      verificationStatus,
      sourceUrl,
      verificationSource: normalizeText(source.verificationSource || source.sourceUrl || ""),
      fieldOfStudy: normalizeText(source.fieldOfStudy || ""),
      description: normalizeText(source.description || ""),
      evidenceNotes: normalizeText(source.evidenceNotes || ""),
      sourceType: normalizeText(source.sourceType),
      researchDate: normalizeText(source.researchDate),
    },
  };
}

function detectDuplicateCandidates(candidates) {
  const seen = new Map();
  const duplicates = [];

  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (seen.has(key)) {
      duplicates.push({
        candidate,
        errors: [`Duplicate candidate code detected for ${candidate.institutionName} / ${candidate.code}.`],
      });
      continue;
    }
    seen.set(key, true);
  }

  return duplicates;
}

function resolveUniversityMatch(candidateInstitutionName, universityRecords) {
  const normalizedTarget = normalizeInstitutionName(candidateInstitutionName);

  if (!normalizedTarget) {
    return { ok: false, reason: "Institution name is missing." };
  }

  const records = Array.isArray(universityRecords) ? universityRecords : [];
  const exactMatches = records.filter((u) => normalizeInstitutionName(u && u.name ? u.name : "") === normalizedTarget);
  if (exactMatches.length === 1) {
    return { ok: true, university: exactMatches[0] };
  }

  const idMatches = records.filter((u) => String(u && u._id ? u._id : "") === String(candidateInstitutionName || ""));
  if (idMatches.length === 1) {
    return { ok: true, university: idMatches[0] };
  }

  if (exactMatches.length > 1) {
    return { ok: false, reason: `Ambiguous university match for ${candidateInstitutionName}.` };
  }

  const prefixMatches = records.filter((u) => normalizeInstitutionName(u && u.name ? u.name : "").includes(normalizedTarget));
  if (prefixMatches.length === 1) {
    return { ok: true, university: prefixMatches[0] };
  }

  if (prefixMatches.length > 1) {
    return { ok: false, reason: `Ambiguous university match for ${candidateInstitutionName}.` };
  }

  return { ok: false, reason: `No university match for ${candidateInstitutionName}.` };
}

function buildInstitutionGapReport({ countries = [] } = {}) {
  return {
    snapshotDate: "2026-10-22",
    generatedFrom: "supplied_inventory_snapshot",
    countries: countries.map((entry) => {
      const institutionsWithZeroCourses = Number(entry.institutionsWithZeroCourses || 0);
      const existingCourses = Number(entry.existingCourses || 0);
      const total = Number(entry.institutions || 0);
      return {
        country: entry.country,
        institutions: total,
        existingCourses,
        institutionsWithZeroCourses,
        priority: entry.priority || (institutionsWithZeroCourses > 0 ? "P1" : "P2"),
        notes: entry.notes || "Snapshot findings only; not a live database result.",
      };
    }),
  };
}

function buildInstitutionResearchQueue({ countries = [] } = {}) {
  const rows = [];
  for (const countryEntry of countries) {
    const institutions = Array.isArray(countryEntry.institutions) ? countryEntry.institutions : [];
    for (const institution of institutions) {
      rows.push({
        institution: institution.name,
        country: countryEntry.country,
        priority: institution.priority || countryEntry.priority || "P2",
        existingCourses: Number(institution.existingCourses || 0),
        researchStatus: institution.researchStatus || "needs_research",
        sourceUrl: institution.sourceUrl || countryEntry.regulatorUrl || "",
      });
    }
  }
  return rows;
}

module.exports = {
  VALID_QUALIFICATION_LEVELS,
  VALID_VERIFICATION_STATUSES,
  normalizeText,
  normalizeInstitutionName,
  normalizeCode,
  validateCatalogueCandidate,
  detectDuplicateCandidates,
  resolveUniversityMatch,
  candidateKey,
  buildInstitutionGapReport,
  buildInstitutionResearchQueue,
};

