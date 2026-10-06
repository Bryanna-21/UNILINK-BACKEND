"use strict";

// The wired-up service the rest of the backend imports:
//   const peopleService = require("../services/people.service");
const { createPeopleCore } = require("./people.core");
const repo = require("./people.repo");

module.exports = createPeopleCore({ repo });
