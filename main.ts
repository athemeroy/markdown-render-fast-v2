import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
// Serialize each rendered document immediately, so its HTML can be released
// before parsing the next one. JSON.stringify preserves all JSON string edges.
const json = new Array<string>(cases.length);
for (let i = 0; i < cases.length; i++) {
  json[i] = JSON.stringify(parse(cases[i].markdown));
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'html.json'), '[' + json.join(',') + ']');
