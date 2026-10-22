const fs = require("fs");
const path = require("path");

const VALID_QUALIFICATIONS = [
  "certificate",
  "diploma",
  "higher_diploma",
  "degree",
  "postgraduate",
  "other",
];

const VALID_VERIFICATION_STATUSES = [
  "verified",
  "needs_client_verification",
  "needs_official_verification",
];

const DEFAULT_CANDIDATES_PATH = path.join(__dirname, "..", "data", "catalogue-candidates.json");

function normalizeCode(value) {
  return String(value ?? "").trim();
}

function validateCandidate(candidate) {
  const errors = [];

  if (!candidate || typeof candidate !== "object") {
    return { valid: false, errors: ["Candidate is not an object."] };
  }

  if (!candidate.title || !String(candidate.title).trim()) {
    errors.push("title is required");
  }

  if (!candidate.code || !normalizeCode(candidate.code)) {
    errors.push("code is required");
  }

  if (!candidate.universityId || !String(candidate.universityId).trim()) {
    errors.push("universityId is required");
  }

  if (!candidate.qualificationLevel || !VALID_QUALIFICATIONS.includes(candidate.qualificationLevel)) {
    errors.push("qualificationLevel must be one of: " + VALID_QUALIFICATIONS.join(", "));
  }

  if (!candidate.verificationStatus || !VALID_VERIFICATION_STATUSES.includes(candidate.verificationStatus)) {
    errors.push("verificationStatus must be one of: " + VALID_VERIFICATION_STATUSES.join(", "));
  }

  if (!candidate.fieldOfStudy || !String(candidate.fieldOfStudy).trim()) {
    errors.push("fieldOfStudy is required");
  }

  if (!candidate.verificationSource || !String(candidate.verificationSource).trim()) {
    errors.push("verificationSource is required");
  }

  return { valid: errors.length === 0, errors };
}

function collectDuplicateCodes(candidates) {
  const seen = new Map();
  const duplicates = [];

  for (const candidate of candidates) {
    const code = normalizeCode(candidate.code).toLowerCase();
    if (!code) continue;

    if (!seen.has(code)) {
      seen.set(code, [candidate]);
      continue;
    }

    seen.get(code).push(candidate);
  }

  for (const [code, items] of seen.entries()) {
    if (items.length > 1) {
      duplicates.push({ code, items });
    }
  }

  return duplicates;
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, "utf8");
  if (!content.trim()) {
    return [];
  }

  return JSON.parse(content);
}

function resolveUniversityMatch(candidate, universityCatalog = []) {
  const candidateId = String(candidate.universityId ?? "").trim();
  const candidateName = String(candidate.universityName ?? "").trim();

  if (!candidateId && !candidateName) {
    return { ok: false, reason: "missing or ambiguous university match" };
  }

  const matches = universityCatalog.filter((entry) => {
    const entryId = String(entry.id ?? entry.universityId ?? "").trim();
    const entryName = String(entry.name ?? entry.universityName ?? "").trim();
    return (candidateId && entryId && entryId.toLowerCase() === candidateId.toLowerCase()) ||
      (candidateName && entryName && entryName.toLowerCase() === candidateName.toLowerCase());
  });

  if (matches.length !== 1) {
    return { ok: false, reason: matches.length === 0 ? "unresolved university" : "ambiguous university match" };
  }

  return { ok: true, university: matches[0] };
}

function runCatalogueImport(options = {}) {
  const {
    candidatePath = DEFAULT_CANDIDATES_PATH,
    apply = false,
    confirm = false,
    universityCatalog = [],
  } = options;

  if (!apply) {
    console.log("Catalogue import running in dry-run mode. No database writes will be attempted.");
  }

  const raw = loadJson(candidatePath);
  const candidates = Array.isArray(raw) ? raw : [];

  const valid = [];
  const rejected = [];

  for (const candidate of candidates) {
    const check = validateCandidate(candidate);
    if (!check.valid) {
      rejected.push({ candidate, errors: check.errors });
      continue;
    }

    const match = resolveUniversityMatch(candidate, universityCatalog);
    if (!match.ok) {
      rejected.push({ candidate, errors: [match.reason] });
      continue;
    }

    valid.push({ ...candidate, resolvedUniversity: match.university });
  }

  const duplicateCodes = collectDuplicateCodes(valid);
  for (const duplicate of duplicateCodes) {
    rejected.push({ candidate: duplicate.items[0], errors: [`duplicate code detected: ${duplicate.code}`] });
  }

  const accepted = valid.filter((entry) => {
    const code = normalizeCode(entry.code).toLowerCase();
    return !duplicateCodes.some((duplicate) => duplicate.code === code);
  });

  const writeCount = apply && confirm ? accepted.length : 0;

  return {
    ok: rejected.length === 0,
    dryRun: !apply,
    apply,
    confirm,
    candidatesTotal: candidates.length,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    duplicateCount: duplicateCodes.length,
    proposedWrites: writeCount,
    rejected,
    accepted,
  };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  const confirm = process.env.UNILINK_CATALOGUE_CONFIRM === "YES";
  const allowed = apply ? confirm : true;

  return { apply, confirm, allowed };
}

function main() {
  const args = parseCliArgs();

  if (args.apply && !args.confirm) {
    console.error("Unsafe write blocked: --apply requires UNILINK_CATALOGUE_CONFIRM=YES");
    process.exit(2);
  }

  const result = runCatalogueImport({ apply: args.apply, confirm: args.confirm });

  console.log(JSON.stringify({
    apply: args.apply,
    confirm: args.confirm,
    dryRun: !args.apply,
    candidatesTotal: result.candidatesTotal,
    acceptedCount: result.acceptedCount,
    rejectedCount: result.rejectedCount,
    duplicateCount: result.duplicateCount,
    proposedWrites: result.proposedWrites,
  }, null, 2));

  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  VALID_QUALIFICATIONS,
  VALID_VERIFICATION_STATUSES,
  normalizeCode,
  validateCandidate,
  collectDuplicateCodes,
  resolveUniversityMatch,
  runCatalogueImport,
  parseCliArgs,
};
