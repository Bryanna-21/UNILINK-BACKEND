# How to Update app.js

Your current `src/app.js` has routes like this:

```javascript
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");  // YOUR EXISTING ADMIN ROUTES
const aiRoutes = require("./routes/ai.routes");
// ... other routes ...

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);  // THIS ALREADY EXISTS
app.use("/api/ai", aiRoutes);
```

---

## THE PROBLEM

Your **existing** `adminRoutes` import and mount is for a different admin routes file. We need to either:

1. **Option A**: Replace the old admin.routes.js with the new one (RECOMMENDED)
2. **Option B**: Rename our new admin.routes.js to something else (not ideal)

---

## SOLUTION: Option A (Replace)

### Step 1: Backup Old File
```bash
cd ~/UNILINK-BACKEND
cp src/routes/admin.routes.js src/routes/admin.routes.js.backup
```

### Step 2: Replace with New File
Extract the zip and copy `routes/admin.routes.js` to `src/routes/admin.routes.js`

This replaces the old admin routes with the new CRUD endpoints.

### Step 3: Copy Other Files
```bash
# Copy the controller
cp controllers/admin.controller.js src/controllers/

# Copy models
cp models/Admin.js src/models/
cp models/Unit.js src/models/

# Copy middleware
cp middleware/roleGuard.js src/middleware/
```

### Step 4: Verify Import in app.js
Your `src/app.js` should already have:
```javascript
const adminRoutes = require("./routes/admin.routes");
// ...
app.use("/api/admin", adminRoutes);
```

**No changes needed to app.js!** The import is already there.

---

## WHAT WAS IN OLD ADMIN ROUTES?

Check what routes were in your old `admin.routes.js`:

```bash
cat src/routes/admin.routes.js.backup | head -50
```

If it had routes like:
- `GET /dashboard` (dashboard stats)
- `GET /admins` (list admins)
- `POST /analytics` (analytics)
- etc.

We need to **merge them** with the new CRUD routes.

---

## MERGE SOLUTION (If Old Routes Had Other Endpoints)

If your old admin routes had endpoints we need to keep:

### Step 1: Check Old File
```bash
grep -n "router\." src/routes/admin.routes.js.backup
```

List all the routes that exist.

### Step 2: Merge into New File

Edit `src/routes/admin.routes.js` and add the old routes:

```javascript
const express = require("express");
const router = express.Router();
const {
  // New CRUD controllers
  createAdmin,
  listAdmins,
  updateAdmin,
  deleteAdmin,
  createUnit,
  listUnits,
  updateUnit,
  deleteUnit,
  createUniversity,
} = require("../controllers/admin.controller");

// OLD CONTROLLERS (if they exist in old file)
const { 
  getDashboardStats,  // IF THIS EXISTED
  getAnalytics,       // IF THIS EXISTED
  // ... any others from old file
} = require("../controllers/some.other.controller");

const { requireSuperadmin } = require("../middleware/roleGuard");
const authenticate = require("../middleware/auth");

// ============================================================
// NEW: ADMIN MANAGEMENT - Superadmin Only
// ============================================================
router.post("/admins", authenticate, requireSuperadmin, createAdmin);
router.get("/admins", authenticate, requireSuperadmin, listAdmins);
router.put("/admins/:id", authenticate, requireSuperadmin, updateAdmin);
router.delete("/admins/:id", authenticate, requireSuperadmin, deleteAdmin);

// ============================================================
// NEW: UNIT MANAGEMENT - Superadmin Only
// ============================================================
router.post("/units", authenticate, requireSuperadmin, createUnit);
router.get("/units", authenticate, requireSuperadmin, listUnits);
router.put("/units/:id", authenticate, requireSuperadmin, updateUnit);
router.delete("/units/:id", authenticate, requireSuperadmin, deleteUnit);

// ============================================================
// NEW: UNIVERSITY MANAGEMENT - Superadmin Only
// ============================================================
router.post("/universities", authenticate, requireSuperadmin, createUniversity);

// ============================================================
// OLD: KEEP EXISTING ROUTES (if any)
// ============================================================
// router.get("/dashboard", authenticate, getDashboardStats);  // IF EXISTED
// router.get("/analytics", authenticate, getAnalytics);      // IF EXISTED
// ... add any other old routes here ...

module.exports = router;
```

---

## STEP-BY-STEP: What to Do

### If You Don't Know What Was in Old admin.routes.js:

1. Open Terminal:
   ```bash
   cd ~/UNILINK-BACKEND
   cat src/routes/admin.routes.js | head -50
   ```

2. If it only had a few lines or was empty → **Just replace it** with our new file

3. If it had many endpoints → **Save old file and merge** (see solution above)

### Recommended Quickest Path:

```bash
cd ~/UNILINK-BACKEND

# Extract and copy everything
unzip BACKEND-MISSING.zip

# Replace admin routes (assuming old one had nothing important)
cp routes/admin.routes.js src/routes/admin.routes.js

# Copy other files
cp controllers/admin.controller.js src/controllers/
cp models/Admin.js src/models/
cp models/Unit.js src/models/
cp middleware/roleGuard.js src/middleware/

# Git
git add .
git commit -m "feat: add admin/unit/university CRUD endpoints"
git push origin main
```

---

## VERIFY IT WORKS

After deployment:

```bash
# Get a superadmin token
TOKEN=$(curl -X POST https://unilink-backend.onrender.com/api/auth/login \
  -d '{"email":"superadmin@unilink.local","password":"password"}' \
  | jq -r '.token')

# Test admin list
curl -X GET https://unilink-backend.onrender.com/api/admin/admins \
  -H "Authorization: Bearer $TOKEN"

# Should return 200 with empty array or admin list
```

---

## DON'T PANIC IF

**"Cannot find module '../controllers/admin.controller'"**
→ Make sure file is at `src/controllers/admin.controller.js`

**"Cannot find module '../middleware/roleGuard'"**
→ Make sure file is at `src/middleware/roleGuard.js`

**"Cannot find module '../models/Admin'"**
→ Make sure file is at `src/models/Admin.js`

All paths in the route file assume files are in `src/` subdirectories.

---

**TL;DR**: Copy files, replace old admin.routes.js, push, done. No app.js changes needed.
