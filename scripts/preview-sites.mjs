import { createRuntime } from './sites-runtime.mjs';
const runtime=await createRuntime({port:3002,persist:true});
console.log(`Sites-compatible local preview: ${await runtime.ready}`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await runtime.dispose();process.exit(0);});
