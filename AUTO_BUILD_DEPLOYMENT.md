# Auto-Build Deployment Guide for Render

## Overview
This setup allows you to push source code to GitHub and have Render automatically build and deploy the obfuscated version.

## Workflow
1. **Development**: Edit source files (`server.js`, `models.js`, etc.)
2. **Push to GitHub**: Push your source code (not the build folder)
3. **Auto-Deploy**: Render pulls code, builds automatically, runs obfuscated `app.js`

## Render Configuration

### Build Settings
- **Build Command**: `npm install` (will trigger `postinstall` which runs `npm run build`)
- **Start Command**: `npm start` (runs `node build/app.js`)
- **Node Version**: 18.x or higher

### Environment Variables
Set in Render Dashboard:
```
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
NODE_ENV=production
```

## What Happens During Deployment

1. **Render pulls** your source code from GitHub
2. **Runs `npm install`** which installs all dependencies
3. **Triggers `postinstall`** script that runs `npm run build`
4. **Build process** creates obfuscated `build/app.js`
5. **Starts app** with `npm start` (runs `node build/app.js`)

## Files to Push to GitHub

**Include these in your repository:**
```
├── server.js              # Main server file
├── models.js              # Database models  
├── package.json           # With build scripts
├── webpack.server.config.js # Webpack config
├── build-script.js        # Build automation
├── .babelrc              # Babel config
├── public/               # Frontend files
├── uploads/              # Upload directory
└── .env.example          # Environment template
```

**DON'T include:**
- `build/` folder (generated automatically)
- `node_modules/` 
- `.env` (use environment variables in Render)

## Development Workflow

### Local Development
```bash
npm run dev          # Run with nodemon for development
```

### Test Build Locally
```bash
npm run build        # Create obfuscated build
npm start           # Test the obfuscated version
```

### Deploy to Production
```bash
git add .
git commit -m "Updated CRM features"
git push origin main  # Render auto-deploys
```

## Benefits
✅ **Automatic builds** - No manual build step needed  
✅ **Source code in Git** - Easy version control  
✅ **Code protection** - Production uses obfuscated code  
✅ **Development friendly** - Edit source, push, deploy  
✅ **Fast iterations** - Just push changes to deploy  

## Troubleshooting

### Build Fails
- Check build logs in Render dashboard
- Ensure all devDependencies are listed in package.json
- Verify webpack and babel configs are present

### App Won't Start  
- Check that `build/app.js` was created during build
- Verify environment variables are set in Render
- Check start command points to `build/app.js`
