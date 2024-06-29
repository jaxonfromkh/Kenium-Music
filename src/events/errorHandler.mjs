export const Event = {
    name: 'error',
    CustomEvent: true,
    run: async() => {
        process.on('unhandledRejection', error => {
            console.log(error)
        })
        process.on('uncaughtException', error => {
            console.log(error)
        })
        process.on('multipleResolves', (type, promise, reason) => {
            console.log(`Multiple resolves: ${type}, ${promise}, ${reason}`);
        });
        process.on('warning', warning => {
            console.log(warning);
        });
        process.on('rejectionHandled', promise => {
            console.log(`Rejection handled: ${promise}`);
        });
        process.on('beforeExit', code => {
            console.log(`Before exit with code: ${code}`);
        });
        process.on('exit', code => {
            console.log(`Exiting with code: ${code}`);
        });
        process.on('multipleResolves', (type, promise, reason) => {
            console.log(`Multiple resolves: ${type}, ${promise}, ${reason}`);
        });
        process.on('uncaughtExceptionMonitor', error => {
            console.log(error);
        });
    }
}
