#!/usr/bin/env node
// 把 .githooks/ 下的钩子安装到当前仓库的 .git/hooks/。
// 只覆盖同名文件，不会触碰 git-lfs 自己管理的钩子
// （post-checkout / post-commit / post-merge / pre-push）以及其他钩子。
// 由 package.json 的 prepare / hooks:install 自动调用，克隆仓库装完依赖即可生效。
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(repoRoot, '.githooks');

if (!existsSync(sourceDir)) {
  console.log('[hooks] .githooks directory not found, nothing to install.');
  process.exit(0);
}

let hooksDir;
try {
  const gitPath = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  hooksDir = resolve(repoRoot, gitPath);
} catch {
  console.log('[hooks] not a git repository, skipping hook installation.');
  process.exit(0);
}

mkdirSync(hooksDir, { recursive: true });

for (const name of readdirSync(sourceDir)) {
  const source = join(sourceDir, name);
  const target = join(hooksDir, name);
  // 统一为 LF：Windows 上的 CRLF 会把 shebang 变成 "#!/bin/sh\r"，导致钩子无法执行。
  const content = readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
  writeFileSync(target, content, 'utf8');
  try {
    chmodSync(target, 0o755);
  } catch {
    // Windows 不支持 POSIX 权限位，Git for Windows 依然会执行 .git/hooks 下的钩子。
  }
  console.log(`[hooks] installed ${name} -> ${target}`);
}
