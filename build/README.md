# CRM System - Production Build

This is the production build of the CRM system with obfuscated code.

## Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
   - Copy `.env.example` to `.env`
   - Update the values with your actual configuration:
     - `MONGODB_URI`: Your MongoDB connection string
     - `JWT_SECRET`: A secure random string for JWT tokens
     - `PORT`: Port number (default: 5000)

3. Start the application:
```bash
npm start
```

## File Structure

- `app.js` - Main application file (bundled and obfuscated)
- `public/` - Frontend assets (HTML, CSS, JS)
- `uploads/` - File upload directory
- `package.json` - Production dependencies
- `.env.example` - Environment variables template

## Production Notes

- The server code has been bundled and obfuscated for security
- Only production dependencies are included
- Console logs are preserved for monitoring
- Make sure to secure your .env file and don't commit it to version control

## Default Admin Account

After first run, create an admin account through the registration endpoint or directly in MongoDB.

## Support

This is a production build. For development and source code access, refer to the original development version.
