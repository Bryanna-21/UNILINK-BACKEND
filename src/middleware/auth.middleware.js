const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { createAuth } = require("./auth.core");

// See auth.core.js. `require("./auth.middleware")` is still the plain authenticate function
// every route already uses; `.allowRestricted` is the variant for appeals and standing.
module.exports = createAuth({ jwt, User });
