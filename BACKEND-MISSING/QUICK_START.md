# Backend Integration - Quick Start

## What's in This Package

✅ **5 files ready to copy into UNILINK-BACKEND**
- Admin/Unit/University CRUD controllers (100% complete)
- Admin & Unit database models
- Role-based authorization middleware
- All 9 API routes with proper role guards

---

## 5-Minute Setup

### 1. Extract & Copy
```bash
cd ~/UNILINK-BACKEND
unzip BACKEND-MISSING.zip
# Files auto-placed in correct directories
```

### 2. Register Routes in app.js
Find `app.js` and add (around line 30 with other routes):
```javascript
const adminRoutes = require("./routes/admin.routes");
app.use("/api/admin", adminRoutes);
```

### 3. Create Superadmin User
```javascript
// In MongoDB
db.users.insertOne({
  name: "Super Admin",
  email: "superadmin@unilink.local",
  password: "$2b$10$...", // bcrypt hash of password
  role: "superadmin",
  status: "active",
  createdAt: new Date()
})
```

### 4. Push to GitHub
```bash
git add .
git commit -m "feat: add admin/unit/university CRUD endpoints"
git push origin main
```

### 5. Verify Render Deployed
- Check Render dashboard logs
- Should see zero errors on deploy

---

## Test It

**Login as superadmin:**
```bash
curl -X POST https://unilink-backend-1.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@unilink.local","password":"password"}'
```

Copy the JWT `token` from response, then:

**Create Admin:**
```bash
curl -X POST https://unilink-backend-1.onrender.com/api/admin/admins \
  -H "Authorization: Bearer TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin 1","email":"admin1@unilink.local"}'
```

Should return 201 with admin data.

---

## Admin Panel Will Now Show

✅ `/admins` page with admin list (can create/edit/delete)
✅ `/units` page with unit list (can create/edit/delete)  
✅ `/universities` can add new universities
✅ Profile menu with View As button
✅ All role-based access working

---

## Files Included

| File | Purpose |
|------|---------|
| `controllers/admin.controller.js` | All CRUD logic |
| `models/Admin.js` | Admin database schema |
| `models/Unit.js` | Unit database schema |
| `middleware/roleGuard.js` | Authorization checks |
| `routes/admin.routes.js` | API endpoints |
| `INTEGRATION_STEPS.md` | Detailed guide |
| `QUICK_START.md` | This file |

---

## Endpoints Created

**Admin Management** (superadmin only):
- `POST /api/admin/admins` - Create
- `GET /api/admin/admins` - List
- `PUT /api/admin/admins/:id` - Update
- `DELETE /api/admin/admins/:id` - Delete

**Unit Management** (superadmin only):
- `POST /api/admin/units` - Create
- `GET /api/admin/units` - List
- `PUT /api/admin/units/:id` - Update
- `DELETE /api/admin/units/:id` - Delete

**University Management** (superadmin only):
- `POST /api/admin/universities` - Create

---

## Common Issues

**"Cannot find module"**
→ Check file paths in admin.controller.js match your model locations

**"Forbidden - superadmin required"**
→ User must have role: "superadmin" in database

**404 on endpoints**
→ Forgot to add `app.use("/api/admin", adminRoutes)` in app.js

**Still getting 403 on frontend**
→ Clear browser cache, refresh page

---

## Status After Integration

✅ Frontend: **Already deployed**
✅ Admin panel: **Waiting on backend (this package)**
✅ Backend APIs: **Ready to install**

**Total time to production**: ~1 hour (5 min setup + 55 min testing)

---

**Next:** Extract, copy, register routes, create superadmin, push, deploy. Done.
