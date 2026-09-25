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

const hasChanges = () => {
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
  return status.trim() !== '';
};

const release = () => {
  run('npm', ['version', getBump()]);

  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const tag = `v${version}`;

  run('pnpm', ['publish']);
  run('git', ['push', '--follow-tags']);
  run('gh', ['release', 'create', tag, '--verify-tag', '--generate-notes']);
};

run('npm', ['whoami']);

const stashed = hasChanges();
if (stashed) {
  run('git', ['stash', 'push', '--include-untracked', '--message', 'release: unfinished work']);
}

try {
  release();
} finally {
  if (stashed) {
    run('git', ['stash', 'pop']);
  }
}
