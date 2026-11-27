#!/usr/bin/env bash
# GitHub 私密仓库创建 + 上传 + Release 发行
# 前置：先在本机执行  .tools/bin/gh.exe auth login --web
set -euo pipefail
cd "$(dirname "$0")/.."

GH=".tools/bin/gh.exe"
REPO="joe/nbody-studio"
VERSION="v2.8.0"
TITLE="N-Body Studio v2.8.0 — 2D/3D 引力模拟 + 恒星演化"

echo "== 1/4 检查登录 =="
"$GH" auth status

echo "== 2/4 创建私密仓库 =="
if "$GH" repo view "$REPO" >/dev/null 2>&1; then
  echo "仓库已存在，跳过创建"
else
  "$GH" repo create "$REPO" --private --source=. --remote=origin --push \
    --description "2D/3D N-body gravity simulator — TypeScript + WebGL2 + Web Worker"
fi

echo "== 3/4 推送最新提交 =="
git push -u origin HEAD

echo "== 4/4 创建 Release 并上传安装包 =="
ASSETS=()
for f in \
  dist-packages/NBodyStudio-2.8.0-win-x64-portable.zip \
  dist-packages/使用说明.txt \
  showcase/nbody-studio-promo.mp4; do
  [ -f "$f" ] && ASSETS+=("$f")
done

"$GH" release create "$VERSION" "${ASSETS[@]}" \
  --title "$TITLE" \
  --notes-file RELEASE_NOTES.md \
  --verify-tag 2>/dev/null || \
"$GH" release create "$VERSION" "${ASSETS[@]}" \
  --title "$TITLE" \
  --notes-file RELEASE_NOTES.md

echo "完成：https://github.com/$REPO"
