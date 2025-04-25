import glob from 'tiny-glob';

export async function* FilereaderGenerator(dir) {
    try {
        const files = await glob('**/*.mjs', {
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