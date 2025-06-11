const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const JavaScriptObfuscator = require('webpack-obfuscator');
const fs = require('fs');

// Custom plugin to concatenate JS files in correct order
class ConcatenateJSPlugin {
    apply(compiler) {
        compiler.hooks.emit.tapAsync('ConcatenateJSPlugin', (compilation, callback) => {
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
            
            let concatenatedContent = '';
            
            // Read and concatenate all JS files
            jsFiles.forEach(filePath => {
                try {
                    const fullPath = path.resolve(__dirname, filePath);
                    const content = fs.readFileSync(fullPath, 'utf8');
                    concatenatedContent += `\n// === ${filePath} ===\n${content}\n`;
                } catch (error) {
                    console.warn(`Warning: Could not read ${filePath}:`, error.message);
                }
            });
            
            // Add the concatenated content to the compilation
            compilation.assets['app.js'] = {
                source: () => concatenatedContent,
                size: () => concatenatedContent.length
            };
            
            callback();
        });
    }
}

module.exports = {
    mode: 'production',
    entry: path.resolve(__dirname, 'build-entry.js'), // Dummy entry point
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: 'temp.js', // Will be replaced by our concatenated file
        clean: true,
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: true, // Remove console.log statements
                        drop_debugger: true, // Remove debugger statements
                    },
                    mangle: {
                        toplevel: true, // Mangle top-level variable names
                    },
                },
            }),
        ],
    },    plugins: [
        // First concatenate all JS files
        new ConcatenateJSPlugin(),
        // Copy and process HTML files
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            inject: true,
            minify: {
                removeComments: true,
                collapseWhitespace: true,
                removeRedundantAttributes: true,
                useShortDoctype: true,
                removeEmptyAttributes: true,
                removeStyleLinkTypeAttributes: true,
                keepClosingSlash: true,
                minifyJS: true,
                minifyCSS: true,
                minifyURLs: true,
            },
        }),
        new HtmlWebpackPlugin({
            template: './public/login.html',
            filename: 'login.html',
            inject: false, // Don't inject the main bundle into login page
            minify: {
                removeComments: true,
                collapseWhitespace: true,
                removeRedundantAttributes: true,
                useShortDoctype: true,
                removeEmptyAttributes: true,
                removeStyleLinkTypeAttributes: true,
                keepClosingSlash: true,
                minifyJS: true,
                minifyCSS: true,
                minifyURLs: true,
            },
        }),
        // Copy CSS files and other static assets
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'public/css',
                    to: 'css'
                }
            ],
        }),
        // Obfuscate the JavaScript code
        new JavaScriptObfuscator({
            rotateStringArray: true,
            stringArray: true,
            stringArrayThreshold: 0.75,
            transformObjectKeys: true,
            unicodeEscapeSequence: false,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 0.75,
            deadCodeInjection: true,
            deadCodeInjectionThreshold: 0.4,
            debugProtection: true,
            debugProtectionInterval: true,
            disableConsoleOutput: true,
            domainLock: [],
            identifierNamesGenerator: 'hexadecimalNumber',
            log: false,
            renameGlobals: false,
            selfDefending: true,
            sourceMap: false,
            splitStrings: true,
            splitStringsChunkLength: 10,
            target: 'browser',
        }, ['temp.js']) // Exclude our temp file from obfuscation since we handle app.js
    ],
    resolve: {
        extensions: ['.js'],
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    }
};
