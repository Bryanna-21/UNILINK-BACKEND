# UniLink Backend

Backend API for UniLink — a student-focused platform for sharing notes, assignments, and academic discussions.

## Catalogue importer

This repository includes a dry-run-safe academic catalogue importer and snapshot-based coverage reports for Kenya and Nigeria.

### Required safeguards

- Default execution is dry-run.
- `--apply` alone is not sufficient.
- `UNILINK_CATALOGUE_CONFIRM=YES` is also required.
- The importer validates all candidates before any write attempt.
- University matches must be unambiguous.
- Duplicate candidate codes are rejected case-insensitively.
- Existing course records are never overwritten.

### Run the importer in dry-run mode

```bash
node scripts/importCatalogueCandidates.js
```

### Future apply mode

```bash
UNILINK_CATALOGUE_CONFIRM=YES node scripts/importCatalogueCandidates.js --apply
```

### Reports and data

- `data/catalogue-candidates.json`
- `data/catalogue-sources.json`
- `reports/institution-gap-report.json`
- `reports/institution-gap-report.csv`
- `reports/research-queue.csv`
- `scripts/generateCatalogueReports.js`

The snapshot report distinguishes between the supplied inventory snapshot and any live database state. It does not claim that the live database matches the supplied snapshot.

### Seeding the institution catalogue (separate from the importer above)

`scripts/seedCatalogue.js` seeds institutions by type, starter courses (certificate, diploma, higher diploma, degree) and illustrative
unit structures, all marked "needs verification". It is a dry run by default; writing needs `--apply` **and**
`UNILINK_CATALOGUE_CONFIRM=YES`. The importer above only validates candidate files and never writes.

```bash
node scripts/seedCatalogue.js
UNILINK_CATALOGUE_CONFIRM=YES node scripts/seedCatalogue.js --apply
```

Earlier overlapping seed scripts are kept, not runnable, under `docs/archive-earlier-session/`.

---

## 🚀 Features

- Create posts (notes, assignments, summaries)
- Fetch posts
- REST API structure
- Ready for deployment

---

## 🛠 Tech Stack

- Node.js
- Express.js

---

## 📁 Project Structure

src/
- app.js
- server.js
- routes/
- controllers/

---

## 📡 API Endpoints

### Base URL
