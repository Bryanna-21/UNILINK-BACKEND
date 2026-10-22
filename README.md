# UniLink Backend

Backend API for UniLink — a student-focused platform for sharing notes, assignments, and academic discussions.

## Academic catalogue add-on

This repository now includes a safe, additive catalogue package for Kenya and Nigeria:

- `data/catalogue-candidates.json`
- `data/catalogue-sources.json`
- `reports/institution-gap-report.json`
- `reports/institution-gap-report.csv`
- `reports/research-queue.csv`
- `scripts/importCatalogueCandidates.js`
- `scripts/generateCatalogueReports.js`
- `tests/catalogueImporter.test.js`
- `docs/catalogue/README.md`

The importer defaults to dry-run mode and will not write to MongoDB unless both of these are true:

1. `--apply` is supplied.
2. `UNILINK_CATALOGUE_CONFIRM=YES` is set in the environment.

For full evidence and execution details, see `docs/catalogue/README.md`.

## Existing project structure

```text
src/
  app.js
  server.js
  routes/
  controllers/
```

## Notes

- The package is additive and duplicate-safe.
- It follows the real `Course` and `University` schema conventions.
- The default behaviour is intentionally non-destructive.
