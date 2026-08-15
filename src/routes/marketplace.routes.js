const router = require("express").Router();
const ctrl = require("../controllers/marketplace.controller");
const auth = require("../middleware/auth.middleware");
const { uploadImage } = require("../middleware/upload.middleware");

// Listings
router.get("/listings", auth, ctrl.getListings);
router.post("/listings", auth, ctrl.createListing);
router.get("/listings/:id", auth, ctrl.getListingById);
router.patch("/listings/:id/sold", auth, ctrl.markListingSold);
router.post("/listings/:id/image", auth, uploadImage.single("image"), ctrl.addListingImage);

// Job Listings
router.get("/jobs", auth, ctrl.getJobListings);
router.post("/jobs", auth, ctrl.createJobListing);

module.exports = router;
