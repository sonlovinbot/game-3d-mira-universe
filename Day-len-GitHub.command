#!/bin/bash
# Nháy đúp để đẩy code lên https://github.com/sonlovinbot/game-3d-mira
# GitHub Actions sẽ tự build và xuất bản lên GitHub Pages.
cd "$(dirname "$0")"
REMOTE="https://github.com/sonlovinbot/game-3d-mira.git"
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REMOTE"
git branch -M main
echo "Đang đẩy nhánh main lên $REMOTE …"
echo "(Nếu được hỏi đăng nhập: Username là tên GitHub, Password là Personal Access Token.)"
if git push -u origin main; then
  echo ""
  echo "Xong. Xem tiến trình deploy: https://github.com/sonlovinbot/game-3d-mira/actions"
  echo "Lần đầu: vào Settings → Pages → Source chọn \"GitHub Actions\"."
  echo "Link game: https://sonlovinbot.github.io/game-3d-mira/"
  open "https://github.com/sonlovinbot/game-3d-mira/actions"
else
  echo ""
  echo "Push không thành công. Kiểm tra quyền đăng nhập GitHub trên máy này rồi thử lại."
fi
read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng…"
