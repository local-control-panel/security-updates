import { execFileSync } from 'node:child_process';
// CI supplies an already fetched base commit. No shell evaluation of branch names.
const base = process.argv[2];
if (!base || !/^[a-f0-9]{40}$/.test(base)) throw new Error('Expected full base commit SHA');
const changes = execFileSync('git', ['diff','--name-status','--no-renames',base,'HEAD','--','releases','payloads'], {encoding:'utf8'}).trim().split('\n').filter(Boolean);
for (const line of changes) if (!line.startsWith('A\t')) throw new Error(`Published inputs are append-only: ${line}`);
console.log('Published release inputs are append-only.');
