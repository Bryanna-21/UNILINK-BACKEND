const router = require("express").Router();
const ctrl = require("../controllers/event.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth, ctrl.getEvents);
router.post("/", auth, ctrl.createEvent);
router.get("/:id", auth, ctrl.getEventById);
router.post("/:id/rsvp", auth, ctrl.rsvpToEvent);
router.get("/:id/my-rsvp", auth, ctrl.getMyRsvpForEvent);
router.post("/check-in", auth, ctrl.checkInWithQr);

module.exports = router;
