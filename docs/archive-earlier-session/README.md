# Archive: files from the earlier catalogue session

Nothing in this folder is run by the app or by `npm test`. It keeps work that overlaps the main catalogue feature
(`scripts/seedCatalogue.js`) or that was superseded, so nothing is lost:

- `seedKenyanTertiaryInstitutions.*.js`, `seedKenyanTTCs.js`, `seedProvisionalDiplomaNursingCourses.js`: earlier seeds. The same
  institutions and diploma / nursing courses are covered by `scripts/seedCatalogue.js`. Do not run both against one database.
- `generateCatalogueReports.inventory-variant.js`: a second version of the report generator that was committed under a broken name.
- `*.c6eae9c*`: older versions of the importer, its test and its candidate file, also recovered from the broken commit.

The relative `require` paths in these files point at the project root, so they will not run from here without being moved.
