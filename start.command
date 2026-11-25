#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "请先安装 Node.js 22.12+，然后重新运行。"; exit 1
fi
if [ ! -d node_modules ]; then npm ci; fi
printf '\n浏览器请打开 http://127.0.0.1:4183/ 。按 Ctrl+C 停止服务。\n'
npm run dev
