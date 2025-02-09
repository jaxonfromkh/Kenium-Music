import { readdir } from 'fs/promises';
import { join, extname } from 'path';

export async function* FilereaderGenerator(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
        console.error(`Failed to read directory: ${dir}`, error);
        return;
    }
    
    for (const entry of entries) {
        const filePath = join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* FilereaderGenerator(filePath);
        } else if (extname(entry.name) === '.mjs') {
            yield filePath;
        }
    }
}
