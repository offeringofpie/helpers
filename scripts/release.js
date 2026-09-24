import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    minor: { type: 'boolean', default: false },
    major: { type: 'boolean', default: false },
  },
});

const getBump = () => {
  if (values.major) {
    return 'major';
  }

  if (values.minor) {
    return 'minor';
  }

  return 'patch';
};

const run = (command, args) => {
  execFileSync(command, args, { stdio: 'inherit' });
};

run('npm', ['version', getBump()]);

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const tag = `v${version}`;

run('pnpm', ['publish']);
run('git', ['push', '--follow-tags']);
run('gh', ['release', 'create', tag, '--verify-tag', '--generate-notes']);
