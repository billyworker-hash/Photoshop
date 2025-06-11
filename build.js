const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Define the order of JS files to concatenate
const jsFiles = [
    'public/js/ApiManager.js',
    'public/js/Dashboard.js',
    'public/js/Leads.js',
    'public/js/Customers.js',
    'public/js/Depositors.js',
    'public/js/Upload.js',
    'public/js/Fields.js',
    'public/js/app.js'
];

// Create build directory if it doesn't exist
const buildDir = path.join(__dirname, 'build');
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

// Copy static assets
function copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Copy CSS files
copyDirectory(path.join(__dirname, 'public/css'), path.join(buildDir, 'css'));

// Process HTML files
function processHtmlFile(inputPath, outputPath) {
    let content = fs.readFileSync(inputPath, 'utf8');
    
    // Replace individual script tags with single bundled script
    const scriptPattern = /<script[^>]*src="js\/(ApiManager|Dashboard|Leads|Customers|Depositors|Upload|Fields|app)\.js"[^>]*><\/script>/g;
    
    // Remove individual script tags
    content = content.replace(scriptPattern, '');
    
    // Add single bundled script tag before closing body tag
    if (inputPath.includes('index.html')) {
        content = content.replace('</body>', '    <script src="app.js"></script>\n</body>');
    }
    
    // Minify HTML (basic minification)
    content = content
        .replace(/>\s+</g, '><')
        .replace(/\s+/g, ' ')
        .trim();
    
    fs.writeFileSync(outputPath, content);
}

// Process HTML files
processHtmlFile(path.join(__dirname, 'public/index.html'), path.join(buildDir, 'index.html'));
processHtmlFile(path.join(__dirname, 'public/login.html'), path.join(buildDir, 'login.html'));

// Concatenate all JS files
let concatenatedContent = '';

console.log('Concatenating JavaScript files...');
jsFiles.forEach(filePath => {
    try {
        const fullPath = path.resolve(__dirname, filePath);
        const content = fs.readFileSync(fullPath, 'utf8');
        concatenatedContent += `\n/* === ${filePath} === */\n${content}\n`;
        console.log(`✓ Added ${filePath}`);
    } catch (error) {
        console.warn(`⚠ Warning: Could not read ${filePath}:`, error.message);
    }
});

console.log('Obfuscating JavaScript...');

// Obfuscate the concatenated JavaScript
const obfuscationResult = JavaScriptObfuscator.obfuscate(concatenatedContent, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: true,
    debugProtectionInterval: true,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimalNumber',
    log: false,
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: true,
    stringArray: true,
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    target: 'browser',
    unicodeEscapeSequence: false
});

// Write the obfuscated result
const outputPath = path.join(buildDir, 'app.js');
fs.writeFileSync(outputPath, obfuscationResult.getObfuscatedCode());

console.log('✓ Build completed successfully!');
console.log(`✓ Obfuscated JavaScript written to: ${outputPath}`);
console.log(`✓ Build directory: ${buildDir}`);
console.log(`✓ Original size: ${(concatenatedContent.length / 1024).toFixed(2)} KB`);
console.log(`✓ Obfuscated size: ${(obfuscationResult.getObfuscatedCode().length / 1024).toFixed(2)} KB`);
