const router = require("express").Router();
const { buildConfig } = require("../utils/config.rules");

// Public on purpose: the app reads this before and after login. Static flags only,
// nothing about any user.
router.get("/", (req, res) => {
  res.set("Cache-Control", "public, max-age=60");
  res.status(200).json({ status: "success", data: buildConfig(process.env) });
});

module.exports = router;
