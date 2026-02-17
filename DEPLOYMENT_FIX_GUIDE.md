# 🚀 Complete Deployment & Login Fix Guide

## ✅ Issues Fixed

1. **CORS Configuration** - Now accepts dynamic origins based on environment variables
2. **API URL Auto-Detection** - Client automatically detects API URL in production
3. **Socket.io URL Auto-Detection** - Client automatically detects WebSocket URL
4. **Environment Variables** - Better configuration for Vercel, Render, and GitHub
5. **Error Handling** - Improved logging and error messages for debugging

---

## 📋 Prerequisites

Before deploying, ensure you have:
- [ ] MongoDB Atlas connection string
- [ ] JWT_SECRET (generate one!)
- [ ] API keys for AI services (optional)
- [ ] GitHub repository initialized
- [ ] Vercel and/or Render accounts

---

## 🔧 Step 1: Generate Required Secrets

### Generate a Strong JWT_SECRET

```bash
# On Windows (PowerShell)
$bytes = New-Object Byte[] 32
[Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($bytes)
$secret = [Convert]::ToBase64String($bytes)
Write-Host $secret

# On Mac/Linux
openssl rand -base64 32
```

---

## 🗄️ Step 2: MongoDB Setup

### Option A: MongoDB Atlas (Recommended for Production)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user with password
4. Add IP address (allow 0.0.0.0/0 for all IPs)
5. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/database`
6. Replace `<password>` in the URI with your actual password

### Option B: Local MongoDB

```
MONGODB_URI=mongodb://localhost:27017/kahoot
```

---

## 🔐 Step 3: Environment Variables

### Backend (.env in server folder)

```dotenv
# ========================================
# CRITICAL: Set these on Vercel/Render!
# ========================================

# Database
MONGODB_URI=mongodb+srv://username:password@your-cluster.mongodb.net/kahoot

# Authentication
JWT_SECRET=your_generated_secret_here
JWT_EXPIRES_IN=15m

# Server
PORT=5000
NODE_ENV=production

# CORS - Add your actual URLs here!
CLIENT_URL=https://your-frontend.vercel.app
ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://your-frontend.onrender.com

# AI Services (Optional)
GOOGLE_AI_API_KEY=your_key_here
MISTRAL_API_KEY=your_key_here
```

### Frontend (.env.local in client folder - for local dev only)

```dotenv
# These are NOT needed for production! 
# Production auto-detects from current URL

VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

---

## 📤 Step 4: Vercel Deployment

### 4.1 Update .gitignore

Ensure your `.gitignore` includes:
```
.env
.env.local
.env.*.local
node_modules/
dist/
build/
uploads/
logs/
*.log
.DS_Store
```

### 4.2 Prepare for Vercel

**Create `vercel.json` in root:**

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server/server.js",
      "use": "@vercel/node",
      "config": {
        "maxDuration": 30
      }
    },
    {
      "src": "client",
      "use": "@vercel/static-build",
      "config": {
        "buildCommand": "npm run build",
        "outputDirectory": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server/server.js"
    },
    {
      "src": "/(.*)",
      "dest": "client/index.html"
    }
  ]
}
```

**Alternative: Deploy Backend and Frontend Separately**

#### Backend on Vercel (Recommended)

1. Push code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Click "New Project"
4. Select your GitHub repository
5. **Root Directory**: `server`
6. Build Command: `npm install`
7. Start Command: `node server.js`
8. Add Environment Variables:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `NODE_ENV=production`
   - `CLIENT_URL=https://your-frontend.vercel.app`
9. Deploy

#### Frontend on Vercel

1. Create separate Vercel project
2. **Root Directory**: `client`
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Environment Variables:
   - `VITE_API_URL` ← (Optional, auto-detects in production)
6. Deploy

---

## 📮 Step 5: Render Deployment

### 5.1 Backend on Render

1. Push to GitHub
2. Go to [Render](https://render.com)
3. Click "New +" → "Web Service"
4. Connect GitHub repository
5. **Settings:**
   - Name: `kahoot-api`
   - Environment: `Node`
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && npm start`
   - Instance Type: Free (or upgrade if needed)

6. **Add Environment Variables:**
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `NODE_ENV=production`
   - `CLIENT_URL=https://your-frontend.onrender.com`

7. Deploy

### 5.2 Frontend on Render

1. Create new "Static Site" on Render
2. Connect GitHub repository
3. **Settings:**
   - Name: `kahoot-web`
   - Publish Directory: `client/dist`
   - Build Command: `cd client && npm install && npm run build`

4. Deploy

---

## ✅ Step 6: Post-Deployment Configuration

### Update CORS on Backend

After frontend is deployed, set the correct `CLIENT_URL` and `ALLOWED_ORIGINS`:

**For Vercel Backend:**
- Go to Vercel Project Settings
- Update Environment Variable: `CLIENT_URL`

**For Render Backend:**
- Go to Render Dashboard
- Select your web service
- Update Environment Variable: `CLIENT_URL`

Example values:
```
# If frontend is on Vercel
CLIENT_URL=https://kahoot-app.vercel.app
ALLOWED_ORIGINS=https://kahoot-app.vercel.app,https://kahoot-app.onrender.com

# If frontend is on Render
CLIENT_URL=https://kahoot-web.onrender.com
ALLOWED_ORIGINS=https://kahoot-web.onrender.com,https://kahoot-app.vercel.app
```

---

## 🧪 Step 7: Testing Login

### Test Health Endpoint

```bash
# Backend health check
curl https://your-backend-url/api/health

# Should return:
{
  "success": true,
  "message": "QuizMaster API is running"
}
```

### Test Login Endpoint

```bash
curl -X POST https://your-backend-url/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student@example.com","password":"password123"}'
```

Expected response:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "...",
      "name": "...",
      "email": "...",
      "role": "student",
      "token": "..."
    }
  }
}
```

---

## 🐛 Troubleshooting

### Issue: "Login failed" in UI

**Check browser console for errors:**
1. Open DevTools (F12)
2. Go to Console tab
3. Look for error messages
4. Check Network tab to see API requests

**Common Causes:**
- [ ] MongoDB connection is down
- [ ] JWT_SECRET not set on server
- [ ] CORS blocking the request (check Origin in Network tab)
- [ ] API URL is incorrect

### Issue: CORS Error

**If you see CORS error:**

1. Check your frontend URL is in `ALLOWED_ORIGINS`
2. Check `CLIENT_URL` matches your frontend URL
3. Restart backend after updating environment variables

### Issue: MongoDB Connection Failed

```bash
# Test MongoDB connection string
# Add this to server.js temporarily:

const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ MongoDB Error:', err));
```

### Issue: Token Invalid or Expired

- Check JWT_SECRET matches between registration and login
- JWT tokens expire in 15 minutes by default
- Refresh tokens should be used for long sessions

---

## 📝 Key Changes Made

### Backend (server.js)
- ✅ Dynamic CORS configuration with environment variables
- ✅ Support for custom `ALLOWED_ORIGINS`
- ✅ Better logging for debugging

### Frontend (api.js)
- ✅ Auto-detection of API URL in production
- ✅ Fallback to localStorage for development
- ✅ Better error logging

### Frontend (SocketContext.jsx)
- ✅ Auto-detection of Socket.io URL
- ✅ Proper logging for connection debugging

### Environment Files
- ✅ Updated with production URLs
- ✅ Better documentation for required variables

---

## 🚀 Quick Deployment Checklist

- [ ] Generate JWT_SECRET
- [ ] Set up MongoDB Atlas account
- [ ] Get MongoDB connection string
- [ ] Push code to GitHub
- [ ] Deploy backend (Vercel or Render)
- [ ] Deploy frontend (Vercel or Render)
- [ ] Set environment variables on both platforms
- [ ] Test health endpoint
- [ ] Test login endpoint
- [ ] Test login in UI
- [ ] Check console logs for errors

---

## 💡 Pro Tips

1. **Use different MongoDB instances** for dev and prod
2. **Rotate JWT_SECRET regularly** for security
3. **Use GitHub Secrets** for CI/CD deployments
4. **Monitor logs** in Vercel/Render dashboards
5. **Test locally first** before deploying to production
6. **Use rate limiting** to prevent brute force attacks

---

## 📞 Support

If you still have issues:

1. Check server logs on Vercel/Render dashboard
2. Check browser DevTools console and Network tab
3. Verify MongoDB connection with MongoDB Atlas dashboard
4. Ensure all environment variables are correctly set
5. Restart the backend deployment after changing env vars

