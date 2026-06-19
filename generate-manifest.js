// generate-manifest.js

import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BUILD_DIR = './dist'; // Standard Cloudflare Pages build output dir
const MANIFEST_FILE = 'file-list.json';
const VERSION = Date.now(); // Simple versioning strategy

async function generateManifest() {
    console.log('🚀 Generating service worker manifest...');
    
    const publicPath = path.join(__dirname, BUILD_DIR);
    const outputFile = path.join(publicPath, MANIFEST_FILE);

    try {
        // Check if dist exists
        await fs.access(publicPath);
    } catch (err) {
        console.error(`❌ Build directory '${BUILD_DIR}' not found. Run build first.`);
        process.exit(1);
    }

    const files = [];

    // Recursive walk function
    async function walkDir(dir, relativePath = '') {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = path.join(relativePath, entry.name).replace(/\\/g, '/');

            if (entry.isDirectory()) {
                // Skip hidden folders and common ignore patterns
                if (entry.name.startsWith('.') || entry.name === '_redirects') continue;
                await walkDir(fullPath, relPath);
            } else {
                // Calculate hash and size
                const content = await fs.readFile(fullPath);
                const hash = createHash('sha256').update(content).digest('hex').substring(0, 8);
                
                files.push({
                    url: '/' + relPath,
                    size: content.length,
                    hash: `sha256-${hash}...`,
                    // Optional: Tag critical assets based on filename
                    critical: ['index.html', 'app.js', 'main.css'].some(name => relPath.includes(name))
                });
            }
        }
    }

    // Scan the build directory
    await walkDir(publicPath);

    const manifest = {
        version: VERSION,
        timestamp: new Date().toISOString(),
        files,
        metadata: {
            totalSize: files.reduce((sum, f) => sum + f.size, 0),
            totalFiles: files.length,
            generatedAt: new Date().toISOString()
        }
    };

    // Write manifest to the dist folder
    await fs.writeFile(outputFile, JSON.stringify(manifest, null, 2));
    console.log(`✅ Manifest generated: ${files.length} files, total size: ${(manifest.metadata.totalSize / 1024).toFixed(2)} KB`);
}

generateManifest().catch(err => {
    console.error('❌ Manifest generation failed:', err);
    process.exit(1);
});
