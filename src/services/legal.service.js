"use strict";
const { createLegalCore } = require("./legal.core");
const repo = require("./legal.repo");

module.exports = createLegalCore({ repo });
