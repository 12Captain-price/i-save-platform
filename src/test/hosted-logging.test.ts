import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
it('suppresses raw errors and private argument objects in actual hosted Node logging',()=>{
 const result=spawnSync(process.execPath,['--import','./src/lib/error-capture.ts','-e',"console.error(new Error('synthetic-sensitive-marker'),{private:'synthetic-private-marker'})"],{env:{...process.env,ISAVE_ENV:'production'},encoding:'utf8'});
 expect(result.status).toBe(0);expect(result.stderr).toContain('private details suppressed');
 expect(result.stderr).not.toContain('synthetic-sensitive-marker');expect(result.stderr).not.toContain('synthetic-private-marker');
});
