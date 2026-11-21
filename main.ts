// Vice Atlas — GTA VI trophy guide, make.fun entry gta6-trophy-guide-01.
// Node 22, standard library only. This program hands the guide in: it copies
// the app/ folder and the screenshots/ folder from beside this file into the
// output directory (MAKEFUN_OUTPUT_DIR, or /output in the grader) and writes
// /output/dossier.json with the kit's buildDossier library, so the judge reads
// the same dossier the scorer rebuilds. Leave vendor/makefun-frontend.ts alone:
// the scorer requires dossier.json byte-identical to what its own copy writes.
//
// Serve the guide locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out-test && MAKEFUN_OUTPUT_DIR=out-test node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail loudly instead of handing in a broken entry: the guide is useless
// without its entry page, so refuse to build the dossier when it is missing.
if (!existsSync(join(here, 'app', 'index.html'))) {
  throw new Error('Vice Atlas: app/index.html is missing, refusing to build the dossier.');
}

mkdirSync(out, { recursive: true });
rmSync(join(out, 'app'), { recursive: true, force: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps: only text_max_bytes shapes the bytes; the others refuse
// an entry the scorer would refuse (more than 4 screenshots or one over 256 KiB;
// more than 993 files and directories in app/ or 48 MiB of app files).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
  }),
);

console.log('Vice Atlas handed in: app/ + screenshots/ copied to ' + out + ', dossier.json written.');
