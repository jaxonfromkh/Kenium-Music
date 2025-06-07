import fg from 'fast-glob';

export async function* FilereaderGenerator(dir) {
    try {
        const files = await fg('**/*.mjs', {
            cwd: dir,
            absolute: true,
            onlyFiles: true,
            followSymbolicLinks: false,
        });
        
        for (const file of files) {
            yield file;
        }
    } catch (error) {
        console.error(`Failed to read directory: ${dir}`, error);
    }
}