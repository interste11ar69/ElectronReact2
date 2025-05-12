const fs = require('fs').promises;
const path = require('path');

// --- Configuration ---
const rootDir = '.'; // Use '.' for the current directory
const outputFile = 'project-tree.txt';
const ignoreList = [
    // Core ignores
    'node_modules',
    '.next',
    '.git',
    // Build/Cache/Output
    'dist',
    'build',
    'out',
    'coverage',
    '.swc',
    // Editor/OS specific
    '.vscode',
    '.idea',
    '.DS_Store',
    'Thumbs.db',
    // Logs & Environment files (often sensitive or noisy)
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    '.env.test',
    'npm-debug.log*',
    'yarn-debug.log*',
    'yarn-error.log*',
    '*.log',

    // --- NEWLY ADDED / REFINED IGNORES ---
    'migrations',         // Ignore prisma migrations directory
    'dev.db',             // Ignore local dev database file
    'uploads',            // Ignore user uploads directory within public/
    'generated',          // Ignore generated code directories (like Prisma client in src/generated)
    'package-lock.json',  // Ignore lock files (add others if needed: yarn.lock, pnpm-lock.yaml)
    'yarn.lock',
    'pnpm-lock.yaml',
    'next-env.d.ts',      // Ignore Next.js auto-generated types
    'generate-tree.js',   // Ignore this script itself
    // --- End NEWLY ADDED / REFINED IGNORES ---

    outputFile // Ignore the script's own output file (already present)
];
// --- End Configuration ---

const ignoreSet = new Set(ignoreList);

async function generateTree(dir, prefix = '') {
    let output = '';
    let entries;

    try {
        // Read directory contents, getting file types directly
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
        // Handle potential permission errors gracefully
        // FIXED: Used backticks for template literal
        console.warn(`\n[Warning] Could not read directory: ${dir} (${err.code || err.message})`);
        return `${prefix}└── [Error reading directory]\n`;
    }

    // Filter out ignored entries
    const filteredEntries = entries.filter(entry => !ignoreSet.has(entry.name));

    // Sort entries: directories first, then files, alphabetically
    filteredEntries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < filteredEntries.length; i++) {
        const entry = filteredEntries[i];
        const connector = i === filteredEntries.length - 1 ? '└── ' : '├── ';
        const entryPath = path.join(dir, entry.name);

        output += prefix + connector + entry.name + '\n';

        if (entry.isDirectory()) {
            const newPrefix = prefix + (i === filteredEntries.length - 1 ? '    ' : '│   ');
            // Recursively call for subdirectories
            output += await generateTree(entryPath, newPrefix);
        }
        // Files are just listed, no further recursion needed
    }
    return output;
}

async function main() {
    const resolvedRootDir = path.resolve(rootDir);
    // FIXED: Used backticks for template literals
    console.log(`Generating project tree for: ${resolvedRootDir}`);
    console.log(`Ignoring: ${Array.from(ignoreSet).join(', ')}`);

    // Start the tree output with the root directory name
    let treeOutput = path.basename(resolvedRootDir) + '\n';
    treeOutput += await generateTree(resolvedRootDir); // Pass resolved path

    try {
        await fs.writeFile(outputFile, treeOutput);
        // FIXED: Used backticks for template literal
        console.log(`\nProject tree successfully saved to: ${outputFile}`);
    } catch (err) {
        // FIXED: Used backticks for template literal
        console.error(`\n[Error] Failed to write output file: ${outputFile}`, err);
    }
}

main().catch(console.error);