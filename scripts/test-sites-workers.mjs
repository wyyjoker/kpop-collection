import { spawn } from 'node:child_process';
const child=spawn(process.execPath,['--test','tests/sites.test.js','tests/sites-catalog-worker.worker.js'],{stdio:'inherit',env:{...process.env,SITES_TEST_RUNTIME:'workers'}});
child.on('exit',code=>process.exitCode=code??1);
