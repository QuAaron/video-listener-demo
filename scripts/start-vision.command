#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v llama-server >/dev/null; then
  echo '请先安装近期 llama.cpp。Mac 有 Homebrew 时可复制运行：brew install llama.cpp'
  echo '官方发布：https://github.com/ggml-org/llama.cpp/releases（支持 Qwen3.5 的近期版本）'
  exit 1
fi
if curl -fsS --max-time 2 http://127.0.0.1:11437/health >/dev/null 2>&1; then
  echo '11437端口已占用，请确认并关闭旧Demo模型服务；本脚本不会读取或覆盖其他服务。'
  exit 1
fi
mkdir -p .vision-models
base='https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/f6d5376be1edb4d416d56da11e5397a961aca8ae'
get_model() {
 local name="$1" sha="$2" dest=".vision-models/$1"
 if [ ! -f "$dest" ]; then
  echo "首次联网下载 $name（仅下载权重，不上传内容）"
  curl -fL "$base/$name" -o "$dest.part"
  mv "$dest.part" "$dest"
 fi
 echo "$sha  $dest" | shasum -a 256 -c - || { echo '权重校验失败，请人工检查文件；不会使用不匹配权重。'; exit 1; }
}
get_model Qwen3.5-2B-Q5_K_M.gguf 1885b3a9195f8cc09da9a7a7a75afdc1e8d5cbf9fc4a499c3961dddea37098ac
get_model mmproj-F16.gguf 7035e9cb8d7c6a9681d07eef9a364783e86ea4cd73faab2eabb4f43a101830c7
echo '本机模型启动，固定127.0.0.1:11437；无需账号/key。保持终端运行，Ctrl-C退出并释放模型内存。'
exec llama-server -m .vision-models/Qwen3.5-2B-Q5_K_M.gguf --mmproj .vision-models/mmproj-F16.gguf --alias qwen3.5-2b-q5-local --host 127.0.0.1 --port 11437 --ctx-size 8192 --parallel 1 --threads 4 --cache-ram 0 --no-slots --image-min-tokens 1024 --image-max-tokens 1024 --jinja --no-webui --offline --cors-origins http://127.0.0.1:4183,http://localhost:4183
