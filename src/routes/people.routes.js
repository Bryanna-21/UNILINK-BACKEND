const router = require("express").Router();
const ctrl = require("../controllers/people.controller");
const auth = require("../middleware/auth.middleware");

router.get("/search", auth, ctrl.search);
router.get("/suggestions", auth, ctrl.suggestions);
router.get("/username/check", auth, ctrl.checkUsername);
router.put("/me/username", auth, ctrl.changeUsername);

router.get("/blocks", auth, ctrl.listBlocks);
router.post("/blocks/:userId", auth, ctrl.block);
router.delete("/blocks/:userId", auth, ctrl.unblock);

module.exports = router;
