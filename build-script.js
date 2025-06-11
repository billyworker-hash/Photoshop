// Build script to create production bundle
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

console.log('🏗️  Starting CRM build process...\n');

// Create build directory if it doesn't exist
const buildDir = path.join(__dirname, 'build');
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
    console.log('✅ Created build directory');
}

// Step 1: Bundle and obfuscate server code
console.log('📦 Bundling and obfuscating server code...');
exec('npx webpack --config webpack.server.config.js', (error, stdout, stderr) => {
    if (error) {
        console.error('❌ Server build failed:', error);
        return;
    }
    
    if (stderr) {
        console.warn('⚠️  Webpack warnings:', stderr);
    }
    
    console.log('✅ Server code bundled and obfuscated');
    console.log(stdout);
    
    // Step 2: Copy necessary files
    copyBuildFiles();
});

function copyBuildFiles() {
    console.log('📁 Copying necessary files...');
    
    try {
        // Copy package.json with production dependencies only
        const originalPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const productionPackage = {
            name: originalPackage.name + '-build',
            version: originalPackage.version,
            description: originalPackage.description + ' (Production Build)',
            main: 'app.js',
            scripts: {
                start: 'node app.js'
            },
            dependencies: originalPackage.dependencies
        };
        
        fs.writeFileSync(
            path.join(buildDir, 'package.json'), 
            JSON.stringify(productionPackage, null, 2)
        );
        console.log('✅ Created production package.json');
        
        // Copy .env.example as template
        if (fs.existsSync('.env')) {
            const envContent = fs.readFileSync('.env', 'utf8');
            // Remove sensitive values but keep structure
            const envTemplate = envContent.replace(/=.*/g, '=YOUR_VALUE_HERE');
            fs.writeFileSync(path.join(buildDir, '.env.example'), envTemplate);
            console.log('✅ Created .env.example template');
        }
        
        // Copy public folder
        copyFolder('public', path.join(buildDir, 'public'));
        console.log('✅ Copied public folder');
        
        // Create uploads folder
        const uploadsDir = path.join(buildDir, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
            console.log('✅ Created uploads directory');
        }
        
        // Create README for build
        createBuildReadme();
        
        console.log('\n🎉 Build completed successfully!');
        console.log('📁 Build files are in the ./build directory');
        console.log('\n📋 Next steps:');
        console.log('1. cd build');
        console.log('2. npm install');
        console.log('3. Copy your .env file or rename .env.example to .env and configure');
        console.log('4. npm start');
        
    } catch (error) {
        console.error('❌ Error copying files:', error);
    }
}

function copyFolder(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const items = fs.readdirSync(src);
    
    for (const item of items) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        
        if (fs.statSync(srcPath).isDirectory()) {
            copyFolder(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function createBuildReadme() {
    const readmeContent = `# CRM System - Production Build

This is the production build of the CRM system with obfuscated code.

## Setup Instructions

1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Configure environment:
   - Copy \`.env.example\` to \`.env\`
   - Update the values with your actual configuration:
     - \`MONGODB_URI\`: Your MongoDB connection string
     - \`JWT_SECRET\`: A secure random string for JWT tokens
     - \`PORT\`: Port number (default: 5000)

3. Start the application:
\`\`\`bash
npm start
\`\`\`

## File Structure

- \`app.js\` - Main application file (bundled and obfuscated)
- \`public/\` - Frontend assets (HTML, CSS, JS)
- \`uploads/\` - File upload directory
- \`package.json\` - Production dependencies
- \`.env.example\` - Environment variables template

## Production Notes

- The server code has been bundled and obfuscated for security
- Only production dependencies are included
- Console logs are preserved for monitoring
- Make sure to secure your .env file and don't commit it to version control

## Default Admin Account

After first run, create an admin account through the registration endpoint or directly in MongoDB.

## Support

This is a production build. For development and source code access, refer to the original development version.
`;
    
    fs.writeFileSync(path.join(buildDir, 'README.md'), readmeContent);
    console.log('✅ Created README.md');
}
