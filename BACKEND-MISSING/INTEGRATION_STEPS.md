# Backend Integration - Admin Panel CRUD Operations

## Files Included

```
controllers/admin.controller.js   → All CRUD logic (Admin, Unit, University)
models/Admin.js                  → Admin schema with indexes
models/Unit.js                   → Unit schema with indexes
middleware/roleGuard.js          → Authorization middleware
routes/admin.routes.js           → All API endpoints
INTEGRATION_STEPS.md             → This file
```

---

## Step 1: Copy Files to Your Backend

Extract this zip in your `~/UNILINK-BACKEND` directory:

```bash
# Assume you're in the root of UNILINK-BACKEND
unzip BACKEND-MISSING.zip

# Files will be placed in:
# src/controllers/admin.controller.js
# src/models/Admin.js
# src/models/Unit.js
# src/middleware/roleGuard.js
# src/routes/admin.routes.js
```

---

## Step 2: Update src/app.js

Add the admin routes to your main app file:

```javascript
// In src/app.js, after other route imports (around line 20)
const adminRoutes = require("./routes/admin.routes");

// Then in the middleware section, add (around where other routes are mounted)
app.use("/api/admin", adminRoutes);
```

**Example location in app.js:**
```javascript
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");  // ADD THIS
const aiRoutes = require("./routes/ai.routes");

// ... middleware ...

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);  // ADD THIS
app.use("/api/ai", aiRoutes);
```

---

## Step 3: Verify Models Import

In `src/controllers/admin.controller.js`, we import:
```javascript
const Admin = require("../models/Admin");
const Unit = require("../models/Unit");
const University = require("../models/university.model");  // Your existing model
const AuditLog = require("../models/auditLog.model");      // Your existing model
```

Make sure:
- ✅ `University` model exists (should already have it)
- ✅ `AuditLog` model exists (should already have it)
- ✅ Paths match your actual model locations

If your models are in different locations, update the `require()` paths in `admin.controller.js`.

---

## Step 4: Create Superadmin User

Add at least one superadmin to your database:

```javascript
// Via MongoDB shell or your admin panel
db.users.insertOne({
  name: "Super Admin",
  email: "superadmin@unilink.local",
  password: "$2b$10$hashed_password_here",  // Use bcrypt
  role: "superadmin",
  status: "active",
  createdAt: new Date()
})
```

Or use a script:
```bash
# Create a seed script: src/seeds/createSuperadmin.js
node src/seeds/createSuperadmin.js
```

---

## Step 5: Test Endpoints

Once deployed, test with Postman or cURL:

```bash
# Login as superadmin first to get token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@unilink.local","password":"password"}'

# Response will include: { token: "...", user: { role: "superadmin" } }

# Test creating admin (replace TOKEN with your JWT)
curl -X POST http://localhost:5000/api/admin/admins \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@unilink.local",
    "universityId": "507f1f77bcf86cd799439011"
  }'

# Test list admins
curl -X GET http://localhost:5000/api/admin/admins \
  -H "Authorization: Bearer TOKEN"

# Test create unit
curl -X POST http://localhost:5000/api/admin/units \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "CS101",
    "name": "Introduction to CS",
    "description": "Fundamentals",
    "credits": 3,
    "universityId": "507f1f77bcf86cd799439011"
  }'
```

---

## Step 6: Deploy & Configure

**Environment variables** (add to .env):

```
CORS_ORIGINS=http://localhost:3000,https://unilink-admin-panel-lilac.vercel.app
NODE_ENV=production
```

**Deploy to Render:**
1. Push changes to GitHub
2. Render auto-deploys
3. Verify in Render logs: `GET /api/admin/admins` should work

---

## Expected Response Formats

### Create Admin (201)
```json
{
  "status": "success",
  "message": "Administrator created successfully",
  "data": {
    "id": "507f1f77bcf86cd799439012",
    "name": "John Doe",
    "email": "john@unilink.local",
    "universityId": "507f1f77bcf86cd799439011",
    "university": "University of Nairobi",
    "status": "active",
    "createdAt": "2026-09-07T10:30:00Z"
  }
}
```

### List Admins (200)
```json
{
  "status": "success",
  "data": [
    { "id": "...", "name": "John Doe", "email": "john@unilink.local", ... }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## Troubleshooting

**Error: "Cannot find module '../models/Admin'"**
- ✅ Make sure Admin.js is in correct location: `src/models/Admin.js`

**Error: "Forbidden - superadmin access required"**
- ✅ User isn't superadmin or token invalid
- ✅ Create superadmin user in database

**Error: "CORS policy: origin not allowed"**
- ✅ Add frontend URL to `CORS_ORIGINS` in .env
- ✅ Example: `https://unilink-admin-panel-lilac.vercel.app`

**404 on /api/admin/admins**
- ✅ Route not mounted in app.js
- ✅ Check: `app.use("/api/admin", adminRoutes);`

---

## Database Indexes

Automatically created by schema:
- `Admin.email` (unique)
- `Admin.universityId`
- `Admin.status`
- `Unit.code` (unique)
- `Unit.universityId`
- `Unit.status`

No manual index creation needed.

---

## Next Steps

1. ✅ Copy files from zip
2. ✅ Update src/app.js to include admin routes
3. ✅ Create superadmin user
4. ✅ Deploy to Render
5. ✅ Update CORS_ORIGINS if not already done
6. ✅ Test endpoints with Postman
7. ✅ Admin panel should now show data instead of empty states

---

**Timeline**: ~30 minutes to integrate, test, and deploy.

**Questions?** Check response formats in this guide. All 9 endpoints are production-ready.
