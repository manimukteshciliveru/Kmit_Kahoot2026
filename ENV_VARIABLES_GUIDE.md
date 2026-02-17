# 🔐 Environment Variables Reference

## 🎯 What Goes Where?

```
Project Root (.env)
├── server/.env ← Backend variables
└── client/.env ← Frontend variables (dev only)
```

---

## 📊 Server Environment Variables

### Location: `server/.env`

Required for Production:
```dotenv
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/kahoot

# Authentication
JWT_SECRET=your_secret_from_openssl_rand
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=another_secret_from_openssl
JWT_REFRESH_EXPIRY=7d

# Server Config
PORT=5000
NODE_ENV=production

# CORS - Very Important!
CLIENT_URL=https://your-frontend-domain.com
ALLOWED_ORIGINS=https://your-frontend-domain.com,https://www.your-frontend-domain.com

# AI Services (Optional)
GOOGLE_AI_API_KEY=your_key
MISTRAL_API_KEY=your_key

# File Upload
MAX_FILE_SIZE=52428800
UPLOAD_DIR=uploads

# Cache (Optional for production)
REDIS_URL=redis://hostname:port
REDIS_PASSWORD=password
```

---

## 📊 Client Environment Variables

### Location: `client/.env` (Development Only)

For **LOCAL DEVELOPMENT**:
```dotenv
# These are ONLY for local development
# Leave empty in production - frontend auto-detects!
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000

# AI Keys (public, can be in code)
VITE_MISTRAL_API_KEY=public_key
VITE_GEMINI_API_KEY=public_key
```

**⚠️ IMPORTANT**: Do NOT set `VITE_API_URL` in Vercel/Render!  
The frontend will auto-detect and use the correct URL.

---

## 🚀 Setting Variables on Vercel

### Step 1: Go to Project Settings
1. Vercel Dashboard
2. Select your project
3. Settings → Environment Variables

### Step 2: Add These Variables

```
Name: MONGODB_URI
Value: mongodb+srv://user:pass@cluster.mongodb.net/kahoot
Environments: Production, Preview

Name: JWT_SECRET
Value: (paste from openssl rand -base64 32)
Environments: Production, Preview

Name: JWT_REFRESH_SECRET
Value: (paste another from openssl rand -base64 32)
Environments: Production, Preview

Name: NODE_ENV
Value: production
Environments: Production

Name: PORT
Value: 5000
Environments: Production

Name: CLIENT_URL
Value: https://your-frontend.vercel.app
Environments: Production

Name: ALLOWED_ORIGINS
Value: https://your-frontend.vercel.app
Environments: Production

Name: GOOGLE_AI_API_KEY
Value: (your key or leave empty)
Environments: Production

Name: MISTRAL_API_KEY
Value: (your key or leave empty)
Environments: Production
```

### Step 3: Redeploy
- Click the three dots → "Redeploy"
- Wait for deployment to complete

---

## 🚀 Setting Variables on Render

### Step 1: Go to Environment
1. Render Dashboard
2. Select your web service
3. Click on Environment

### Step 2: Add These Variables

```
MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/kahoot
JWT_SECRET = (paste from openssl rand -base64 32)
JWT_REFRESH_SECRET = (paste another from openssl rand -base64 32)
NODE_ENV = production
PORT = 5000
CLIENT_URL = https://your-frontend.onrender.com
ALLOWED_ORIGINS = https://your-frontend.onrender.com
GOOGLE_AI_API_KEY = (your key or leave empty)
MISTRAL_API_KEY = (your key or leave empty)
```

### Step 3: Deploy
- Manual Deploy or it auto-redeploys

---

## 🌐 For Different Deployment Scenarios

### Scenario 1: Vercel Backend + Vercel Frontend

**Backend (.env or Vercel):**
```
CLIENT_URL=https://your-app.vercel.app
ALLOWED_ORIGINS=https://your-app.vercel.app
```

**Frontend (Vercel):**
```
Leave VITE_API_URL empty - auto-detects
```

---

### Scenario 2: Render Backend + Render Frontend

**Backend (.env or Render):**
```
CLIENT_URL=https://your-app-web.onrender.com
ALLOWED_ORIGINS=https://your-app-web.onrender.com
```

**Frontend (Render):**
```
Leave VITE_API_URL empty - auto-detects
```

---

### Scenario 3: Vercel Backend + Render Frontend

**Backend (Vercel):**
```
CLIENT_URL=https://your-app-web.onrender.com
ALLOWED_ORIGINS=https://your-app-web.onrender.com,https://api-name.vercel.app
```

**Frontend (Render):**
```
VITE_API_URL=https://api-name.vercel.app/api
```

---

### Scenario 4: Both on GitHub (Docker)

**Backend (.env):**
```
CLIENT_URL=https://your-domain.com
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/kahoot
```

**Frontend (.env):**
```
VITE_API_URL=https://api.your-domain.com
VITE_SOCKET_URL=https://api.your-domain.com
```

---

## 🔐 Security Checklist

When setting environment variables:

- [ ] **NEVER** commit `.env` files to GitHub!
- [ ] Use `.gitignore` to exclude `.env`
- [ ] Generate NEW secrets (don't use examples)
- [ ] Use strong passwords (20+ characters)
- [ ] Keep MongoDB password different from root password
- [ ] Rotate secrets periodically
- [ ] Use separate databases for dev and production
- [ ] Enable MongoDB IP whitelist
- [ ] Use HTTPS only in production URLs

---

## 📝 Environment Variable Types

### Backend Variables

| Variable | Type | Required | Example |
|----------|------|----------|---------|
| MONGODB_URI | String | ✅ Yes | `mongodb+srv://...` |
| JWT_SECRET | String | ✅ Yes | 44-char random string |
| JWT_REFRESH_SECRET | String | ✅ Yes | 44-char random string |
| JWT_EXPIRES_IN | String | ✅ Yes | `15m` |
| JWT_REFRESH_EXPIRY | String | ✅ Yes | `7d` |
| PORT | Number | ✅ Yes | `5000` |
| NODE_ENV | String | ✅ Yes | `production` |
| CLIENT_URL | URL | ✅ Yes | `https://app.com` |
| ALLOWED_ORIGINS | String | ⚠️ Important | Comma-separated URLs |
| GOOGLE_AI_API_KEY | String | ❌ No | API key |
| MISTRAL_API_KEY | String | ❌ No | API key |
| REDIS_URL | String | ❌ No | Redis connection |
| MAX_FILE_SIZE | Number | ❌ No | `52428800` |
| UPLOAD_DIR | String | ❌ No | `uploads` |

### Frontend Variables

| Variable | Setting | Development | Production |
|----------|---------|-------------|------------|
| VITE_API_URL | .env | `http://localhost:5000/api` | Leave empty (auto-detect) |
| VITE_SOCKET_URL | .env | `http://localhost:5000` | Leave empty (auto-detect) |
| VITE_MISTRAL_API_KEY | .env | Public key | Public key |
| VITE_GEMINI_API_KEY | .env | Public key | Public key |

---

## 🆘 Troubleshooting

### Problem: "Cannot read environment variable"
```
❌ Check: Is the variable name spelled correctly?
✅ Verify on platform dashboard: env variables are set
✅ Redeploy after adding variables
```

### Problem: "CORS error" or "API connection failed"
```
❌ Check: Is CLIENT_URL correct?
✅ Verify ALLOWED_ORIGINS includes your frontend URL
✅ Check for typos in URLs
```

### Problem: "Invalid MongoDB connection"
```
❌ Check: Is MONGODB_URI correct?
✅ Test connection string in MongoDB Atlas
✅ Verify username and password
✅ Check IP whitelist (should be 0.0.0.0/0 or your IP)
```

### Problem: "JWT errors" or "Cannot sign token"
```
❌ Check: Is JWT_SECRET set and not empty?
✅ Verify it's a valid base64 string
✅ Regenerate with openssl rand if unsure
```

---

## 🔄 How Auto-Detection Works

### Frontend Auto-Detection:
1. Check if `VITE_API_URL` is set → Use it
2. If in production (`import.meta.env.PROD`) → Use `window.location.origin + /api`
3. Otherwise → Default to `http://localhost:5000/api`

### Example:
- Deployed to `https://app.vercel.app`
- Auto-detects API at `https://app.vercel.app/api`
- No configuration needed!

---

## 📞 Quick Reference

### Generate Secrets:
```bash
# Generate JWT_SECRET (Windows PowerShell)
$bytes = New-Object Byte[] 32
[Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($bytes)
[Convert]::ToBase64String($bytes)

# Generate JWT_SECRET (Mac/Linux)
openssl rand -base64 32
```

### MongoDB Atlas:
1. Create account: https://www.mongodb.com/cloud/atlas
2. Create free cluster
3. Create database user
4. Add IP: 0.0.0.0/0 (allows all IPs)
5. Get connection string from "Connect" button

### Test Connection:
```bash
# Replace with your actual credentials
# Use MongoDB Compass or mongosh to test

mongosh "mongodb+srv://username:password@cluster.mongodb.net/kahoot"
```

