# 🚀 Vercel Deployment Configuration - Fixed & Optimized

## ✅ Problems Fixed

We identified and fixed several issues that would cause Vercel deployments to fail:

### ❌ Issue 1: Mixed Routing Properties
**Error**: "Mixed routing properties error"
- **Problem**: Our config used both `routes` AND `headers` together
- **Vercel Rule**: Cannot use `routes` with `headers`, `rewrites`, `redirects`, etc.
- **Solution**: ✅ Updated to use separate configs for backend/frontend

### ❌ Issue 2: Missing OutputDirectory  
**Error**: "Missing public directory"
- **Problem**: Frontend build output must be clearly specified
- **Solution**: ✅ Added `outputDirectory: "dist"` in client/vercel.json

### ❌ Issue 3: Conflicting Configuration
**Error**: "Conflicting configuration files"
- **Problem**: Using old `builds` property instead of newer `functions`
- **Solution**: ✅ Updated to use modern `functions` configuration

---

## 📁 New Configuration Structure

```
Kahoot/
├── vercel.json (root - informational)
├── server/
│   ├── vercel.json ← Backend config
│   └── server.js
└── client/
    ├── vercel.json ← Frontend config
    ├── package.json
    └── vite.config.js
```

---

## 🎯 Deployment Instructions

### Recommended: Separate Projects (Best Practice)

#### Step 1: Deploy Backend on Vercel

```bash
1. Go to https://vercel.com
2. Click "Add New..." → "Project"
3. Import GitHub repository
4. Select "Root Directory" → "server"
5. Framework Preset: "Other"
6. Build Command: npm install
7. Start Command: node server.js

8. Environment Variables (Add these):
   - MONGODB_URI: mongodb+srv://user:pass@...
   - JWT_SECRET: (from openssl rand -base64 32)
   - JWT_EXPIRES_IN: 15m
   - CLIENT_URL: https://your-frontend.vercel.app
   - ALLOWED_ORIGINS: https://your-frontend.vercel.app

9. Click "Deploy"
```

**Result**: Backend URL like `https://kahoot-api-xxxxx.vercel.app`

#### Step 2: Deploy Frontend on Vercel

```bash
1. Go to https://vercel.com
2. Click "Add New..." → "Project"
3. Import SAME GitHub repository
4. Select "Root Directory" → "client"
5. Framework Preset: "Vite"
6. Build Command: npm run build
7. Output Directory: dist

8. Environment Variables (Optional):
   - VITE_API_URL: (leave empty - auto-detects)
   
9. Click "Deploy"
```

**Result**: Frontend URL like `https://kahoot-app-xxxxx.vercel.app`

#### Step 3: Update Backend URL in Frontend

After frontend is deployed:

1. Go back to Backend Project Settings
2. Update `CLIENT_URL` environment variable:
   ```
   CLIENT_URL=https://kahoot-app-xxxxx.vercel.app
   ```
3. Click "Redeploy"

---

## 📋 vercel.json Reference

### Backend Configuration (`server/vercel.json`)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "version": 2,
  "env": {
    "MONGODB_URI": "@mongodb_uri",
    "JWT_SECRET": "@jwt_secret",
    "CLIENT_URL": "@client_url"
  },
  "functions": {
    "server/server.js": {
      "maxDuration": 30,
      "memory": 1024,
      "runtime": "nodejs20.x"
    }
  }
}
```

**Explanation**:
- `@mongodb_uri` - Reads from environment variable `MONGODB_URI`
- `maxDuration: 30` - Function timeout is 30 seconds
- `memory: 1024` - 1GB memory for function
- `runtime: "nodejs20.x"` - Use Node.js 20

### Frontend Configuration (`client/vercel.json`)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/index.html",
      "headers": [{
        "key": "Cache-Control",
        "value": "no-cache, no-store"
      }]
    }
  ]
}
```

**Explanation**:
- `buildCommand`: Runs `npm run build` 
- `outputDirectory`: Looks for built files in `dist/`
- `rewrites`: Routes all paths to `index.html` (SPA routing)
- `headers`: Prevents caching of index.html

---

## ✅ Checklist Before Deploying

### Backend
- [ ] MongoDB URI is correct and database exists
- [ ] JWT_SECRET is generated and set
- [ ] JWT_EXPIRES_IN is set (e.g., "15m")
- [ ] CLIENT_URL matches your frontend URL
- [ ] ALLOWED_ORIGINS includes your frontend URL
- [ ] server/vercel.json exists
- [ ] All dependencies in server/package.json

### Frontend
- [ ] Vite build works locally: `npm run build`
- [ ] dist/ folder is created after build
- [ ] src/main.jsx exists
- [ ] client/vercel.json exists
- [ ] VITE_API_URL is left empty (for auto-detection)

---

## 🐛 Common Deployment Errors & Fixes

### Error: "Missing public directory"
```
✅ FIX: Ensure "outputDirectory": "dist" in client/vercel.json
```

### Error: "Missing build script"
```
✅ FIX: Ensure buildCommand is set in vercel.json:
"buildCommand": "npm run build"
```

### Error: "Mixed routing properties"
```
❌ WRONG: Using both "routes" and "headers"
✅ RIGHT: Use "rewrites" and "headers" together
```

### Error: "Failed to install builder dependencies"
```
✅ FIX: Check package.json dependencies are correct
✅ FIX: Delete node_modules and package-lock.json locally, run npm install
✅ FIX: Push changes to GitHub, redeploy
```

### Error: "Cannot load project settings"
```
✅ FIX: Remove .vercel folder: rm -rf .vercel
✅ FIX: Redeploy with vercel CLI or dashboard
```

### Error: "Invalid Edge Config connection string"
```
✅ FIX: Remove EDGE_CONFIG from environment variables if not using it
```

---

## 🔍 Verify Deployment

### Test Backend
```bash
# Replace with your actual backend URL
curl https://kahoot-api-xxxxx.vercel.app/api/health

# Should return:
# {"success":true,"message":"QuizMaster API is running"}
```

### Test Frontend
```bash
# Go to https://kahoot-app-xxxxx.vercel.app
# Should load the login page
# Check browser console for errors
```

### Test Login Flow
```bash
1. Open frontend URL
2. Enter credentials
3. Click "Sign In"
4. Should redirect to dashboard
5. Check browser Network tab for /api/auth/login request
```

---

## 📊 Environment Variables Reference

### What Goes Where?

```
VERCEL_BACKEND (server project):
├── MONGODB_URI ✓
├── JWT_SECRET ✓
├── JWT_EXPIRES_IN ✓
├── CLIENT_URL ✓
├── ALLOWED_ORIGINS ✓
├── GOOGLE_AI_API_KEY (optional)
└── MISTRAL_API_KEY (optional)

VERCEL_FRONTEND (client project):
├── VITE_API_URL (optional - leave empty)
└── VITE_MISTRAL_API_KEY (public key)
```

---

## 🚨 DO NOT Deploy

- ❌ Don't commit `.env` files to GitHub
- ❌ Don't use same JWT_SECRET for multiple environments
- ❌ Don't expose private API keys to frontend
- ❌ Don't set MONGODB_URI in frontend
- ❌ Don't use `vercel.json` to deploy both backend and frontend at once

---

## ✨ Advanced Configuration (Optional)

### Add Custom Domain

```bash
vercel domains add yourdomain.com
# Then point DNS to Vercel nameservers
```

### Enable Git Integration for Auto-Deploy

```bash
1. Frontend: Auto-deploys on git push to main
2. Backend: Auto-deploys on git push to main
```

### Set Up Preview Deployments

```bash
1. Create new branch (git checkout -b feature/new-feature)
2. Push branch (git push origin feature/new-feature)
3. Vercel automatically creates preview URL
4. After merge to main, promotes to production
```

---

## 📞 Need Help?

If deployment fails:

1. **Check Vercel Logs**:
   - Vercel Dashboard → Project → Deployments → Failed deployment → Logs

2. **Check Build Output**:
   - Look for npm errors
   - Check if dependencies are installed
   - Verify build command works locally

3. **Test Locally First**:
   ```bash
   cd server && npm run dev      # Test backend
   cd client && npm run dev      # Test frontend
   ```

4. **Verify Environment Variables**:
   - Are they set in Vercel?
   - Are they correct values?
   - Did you redeploy after changing them?

---

## 🎯 Summary

✅ Configuration is now Vercel-compliant  
✅ No more mixed routing property errors  
✅ Separate configs for backend and frontend  
✅ Ready to deploy to production  
✅ All common errors documented  

**Start deploying!** 🚀
