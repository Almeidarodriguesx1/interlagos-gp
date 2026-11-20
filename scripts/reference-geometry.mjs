// Generate the pristine reference on this CPU: libm results can differ across architectures.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, copyFileSync, symlinkSync, rmSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export function referenceGeometry() {
  const temp = mkdtempSync(join(tmpdir(),'interlagos-geometry-'));
  try {
    const archive = execFileSync('git',['archive','87238534d4e5a2addd6b9d851c95fe430a8674bc','src','package.json','tsconfig.json'],{maxBuffer:32*1024*1024});
    execFileSync('tar',['-x','-C',temp],{input:archive});
    symlinkSync(realpathSync('node_modules'),join(temp,'node_modules'),'dir');
    mkdirSync(join(temp,'scripts'));
    copyFileSync('scripts/verify-models.ts',join(temp,'scripts/verify-models.ts'));
    copyFileSync('scripts/reference-geometry.mjs',join(temp,'scripts/reference-geometry.mjs'));
    return execFileSync(process.execPath,['--import','tsx','scripts/verify-models.ts','--print'],{cwd:temp,encoding:'utf8'}).trim();
  } finally {
    rmSync(temp,{recursive:true,force:true});
  }
}
