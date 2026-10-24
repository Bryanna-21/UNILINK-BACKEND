"use strict";

// Starter list of Kenyan tertiary institutions. EVERY entry is seeded as "needs verification": the names
// come from public listings (CUE approved universities, TVETA lists, public sector lists) and have not
// been confirmed against the regulators' current registers. Names for the CUE universities are identical
// to scripts/seedKenyanUniversities.js so an existing record is matched, not duplicated.
// Add or correct institutions through the admin import, or here, and re-run the seed: it is idempotent.

const list = (type, names) => names.map((name) => ({ name, institutionType: type }));

const PUBLIC_UNIVERSITIES = [
  "University of Nairobi", "Moi University", "Kenyatta University", "Egerton University",
  "Jomo Kenyatta University of Agriculture and Technology", "Maseno University",
  "Masinde Muliro University of Science and Technology", "Dedan Kimathi University of Technology",
  "Chuka University", "Technical University of Kenya", "Technical University of Mombasa", "Pwani University",
  "Kisii University", "University of Eldoret", "Maasai Mara University",
  "Jaramogi Oginga Odinga University of Science and Technology", "Laikipia University",
  "South Eastern Kenya University", "Meru University of Science and Technology", "Multimedia University of Kenya",
  "University of Kabianga", "Karatina University", "Kibabii University", "Rongo University",
  "The Co-operative University of Kenya", "Taita Taveta University", "Murang'a University of Technology",
  "University of Embu", "Machakos University", "Kirinyaga University", "Garissa University", "Alupe University",
  "Kaimosi Friends University", "Tom Mboya University", "Tharaka University", "Bomet University",
  "National Defence University-Kenya", "Open University of Kenya", "National Intelligence Research University",
  "Kenya Advanced Institute of Science and Technology", "Kenya Medical Research Institute",
];

const PRIVATE_UNIVERSITIES = [
  "University of Eastern Africa, Baraton", "Catholic University of Eastern Africa (CUEA)", "Daystar University",
  "Scott Christian University", "United States International University", "Africa Nazarene University",
  "Kenya Methodist University", "St. Paul's University", "Pan Africa Christian University", "Strathmore University",
  "Kabarak University", "Mount Kenya University", "Africa International University",
  "Kenya Highlands Evangelical University", "Great Lakes University of Kisumu", "KCA University",
  "Adventist University of Africa", "KAG EAST University", "Umma University", "Presbyterian University of East Africa",
  "Aga Khan University", "Kiriri Women's University of Science and Technology", "The East African University",
  "Zetech University", "Lukenya University", "Management University of Africa", "Tangaza University",
  "Islamic University of Kenya", "Riara University", "Uzima University", "Gretsa University",
  "Amref International University",
];

const NATIONAL_POLYTECHNICS = [
  "The Kabete National Polytechnic", "Nairobi National Polytechnic", "The Kenya Coast National Polytechnic",
  "The Eldoret National Polytechnic", "The Kisii National Polytechnic", "The Kisumu National Polytechnic",
  "The Kitale National Polytechnic", "The Meru National Polytechnic", "The Nyeri National Polytechnic",
  "Sigalagala National Polytechnic", "North Eastern National Polytechnic", "Kaimosi Friends National Polytechnic",
  "Michuki National Polytechnic", "Mitunguu National Polytechnic", "Nyandarua National Polytechnic",
  "Ol'lessos National Polytechnic", "The Baringo National Polytechnic", "The Bumbe National Polytechnic",
  "The Bungoma National Polytechnic", "The Kaiboi National Polytechnic", "The Kericho National Polytechnic",
  "The Kiambu National Polytechnic", "The Kipsoen National Polytechnic", "The Kisiwa National Polytechnic",
  "The Mawego National Polytechnic", "The Nyamira National Polytechnic", "The Shamberere National Polytechnic",
  "Rift Valley National Polytechnic", "Mwea National Polytechnic", "Kenya School of TVET",
  "Morendat Institute of Oil and Gas National Polytechnic",
];

const TVET_COLLEGES = [
  "Kiambu Institute of Science and Technology", "Coast Institute of Technology", "Thika Technical Training Institute",
  "Kenya Institute of Highways and Building Technology", "Kenya Utalii College", "Kenya Water Institute",
  "Kenya Forestry College", "Kenya Industrial Training Institute", "Kenya Red Cross Training Institute",
  "Kenya Institute of Mass Communication", "Institute of Advanced Technology", "Kenya Institute of Surveying and Mapping",
];

const TEACHER_TRAINING = [
  "Kamwenja Teachers Training College", "Kagumo Teachers Training College", "Thogoto Teachers Training College",
  "Murang'a Teachers Training College", "Kigari Teachers Training College", "Machakos Teachers Training College",
  "Meru Teachers Training College", "Kericho Teachers Training College", "Asumbi Teachers Training College",
  "Mosoriot Teachers Training College", "Narok Teachers Training College", "Kilimambogo Teachers Training College",
  "Shanzu Teachers Training College", "Tambach Teachers Training College", "Nyahururu Teachers Training College",
  "Kenya Technical Trainers College", "Kenya Institute of Special Education",
];

const MEDICAL_TRAINING = [
  "Kenya Medical Training College", "Kenyatta National Hospital School of Nursing", "Kijabe College of Health Sciences",
];

const OTHER_TERTIARY = [
  "Kenya School of Law", "Kenya Institute of Management", "Kenya School of Government",
  "Kenya School of Monetary Studies",
];

module.exports = [
  ...list("university_public", PUBLIC_UNIVERSITIES),
  ...list("university_private", PRIVATE_UNIVERSITIES),
  ...list("national_polytechnic", NATIONAL_POLYTECHNICS),
  ...list("tvet_college", TVET_COLLEGES),
  ...list("teacher_training", TEACHER_TRAINING),
  ...list("medical_training", MEDICAL_TRAINING),
  ...list("other_tertiary", OTHER_TERTIARY),
];
