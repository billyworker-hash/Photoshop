const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const JavaScriptObfuscator = require('webpack-obfuscator');

module.exports = {
    target: 'node',
    mode: 'production',
    entry: './server.js',
    output: {
        filename: 'app.js',
        path: path.resolve(__dirname, 'build'),
        clean: true
    },
    externals: {
        // Exclude node_modules from bundling - they'll be installed separately
        'express': 'commonjs express',
        'mongoose': 'commonjs mongoose',
        'dotenv': 'commonjs dotenv',
        'cors': 'commonjs cors',
        'jsonwebtoken': 'commonjs jsonwebtoken',
        'bcryptjs': 'commonjs bcryptjs',
        'path': 'commonjs path'
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
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: false, // Keep console logs for server
                        drop_debugger: true,
                        pure_funcs: ['console.debug']
                    },
                    mangle: {
                        reserved: ['require', 'module', 'exports', '__dirname', '__filename']
                    }
                }
            })
        ]
    },
    plugins: [
        new webpack.BannerPlugin({
            banner: '#!/usr/bin/env node',
            raw: true
        }),
        new JavaScriptObfuscator({
            rotateStringArray: true,
            stringArray: true,
            stringArrayThreshold: 0.75,
            transformObjectKeys: true,
            unicodeEscapeSequence: false,
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 0.75,
            deadCodeInjection: true,
            deadCodeInjectionThreshold: 0.4,
            debugProtection: false, // Set to false for server code
            debugProtectionInterval: false,
            disableConsoleOutput: false, // Keep console for server logs
            domainLock: [],
            identifierNamesGenerator: 'hexadecimal',
            log: false,
            renameGlobals: false,
            reservedNames: [
                'require',
                'module',
                'exports',
                '__dirname',
                '__filename',
                'process',
                'global',
                'console',
                'Buffer'
            ],
            reservedStrings: [],
            selfDefending: true,
            sourceMap: false,
            sourceMapBaseUrl: '',
            sourceMapFileName: '',
            sourceMapMode: 'separate',
            splitStrings: true,
            splitStringsChunkLength: 5,
            stringArrayEncoding: ['base64'],
            target: 'node',
            numbersToExpressions: true,
            simplify: true
        }, ['app.js'])
    ],
    resolve: {
        extensions: ['.js', '.json']
    },
    node: {
        __dirname: false,
        __filename: false
    }
};
