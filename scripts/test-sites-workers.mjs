import { spawn } from 'node:child_process';
const child=spawn(process.execPath,['--test','tests/sites.test.js'],{stdio:'inherit',env:{...process.env,SITES_TEST_RUNTIME:'workers'}});
child.on('exit',code=>process.exitCode=code??1);
