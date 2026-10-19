const router = require("express").Router();
const ctrl = require("../controllers/library.controller");
const auth = require("../middleware/auth.middleware");
const { requireFeature } = require("../middleware/featureGuard");
const { uploadDocument } = require("../middleware/upload.middleware");

// Physical books
router.get("/books", auth, ctrl.getBooks);
router.post("/books", auth, ctrl.addBook);
router.post("/books/:id/borrow", auth, ctrl.borrowBook);
router.patch("/loans/:loanId/return", auth, ctrl.returnBook);
router.get("/my-loans", auth, ctrl.getMyLoans);

// Digital resources
router.get("/digital", auth, ctrl.getDigitalResources);
router.post("/digital", auth, requireFeature("uploads"), uploadDocument.single("file"), ctrl.uploadDigitalResource);

module.exports = router;
