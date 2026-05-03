# 部署與金鑰設定

GitHub Pages 只能放靜態網頁，不能隱藏 API key。這版已把前端的 CWA / MOENV key 移除，改成呼叫後端：

```text
/api/weather
```

## 推薦部署方式：Vercel

1. 到 https://vercel.com 用 GitHub 登入。
2. Import 你的 `weather-outfit-app` repository。
3. 在 Project Settings → Environment Variables 新增：

```text
CWA_API_KEY=你的中央氣象署APIKey
MOENV_API_KEY=你的環境部APIKey
```

4. 重新 Deploy。

完成後請使用 Vercel 給你的網址，而不是 GitHub Pages 網址。因為 GitHub Pages 沒有 `/api/weather` 後端。

## 已公開過的 key

你原本的 key 曾經出現在公開網頁原始碼裡。建議到 CWA / MOENV 後台重新產生新 key，並把舊 key 停用或刪除。
