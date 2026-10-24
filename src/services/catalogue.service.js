"use strict";

// The wired-up catalogue service the controller imports.
const { createCatalogueCore } = require("./catalogue.core");
const repo = require("./catalogue.repo");

module.exports = createCatalogueCore({ repo });
