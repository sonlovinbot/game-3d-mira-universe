#!/bin/bash
# Nháy đúp file này trong Finder để chạy game Mira ở http://localhost:5190
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
if ! command -v npm >/dev/null 2>&1; then
  echo "Máy chưa có Node.js. Cài bản LTS tại https://nodejs.org rồi nháy đúp lại file này."
  open "https://nodejs.org"
  read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng…"
  exit 1
fi
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  echo "Đang cài thư viện (chỉ lần đầu)…"
  npm install || { read -n 1 -s -r -p "Cài thất bại. Nhấn phím bất kỳ để đóng…"; exit 1; }
fi
echo "Đang mở http://localhost:5190 — giữ cửa sổ này mở trong lúc chơi, đóng lại để tắt game."
npx vite --port 5190 --open
