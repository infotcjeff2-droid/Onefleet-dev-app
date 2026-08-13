# syntax=docker/dockerfile:1
#
# gpsProxy.js 只使用 Node.js 內建模組（http, https, fs, path, crypto）。
# 這是最小化的生產映像。

FROM node:20-alpine

WORKDIR /app

COPY server/gpsProxy.js ./
COPY server/sessionCrypto.js ./

# 限制記憶體，防止 Node.js 用太多
ENV NODE_OPTIONS="--max-old-space-size=256"
ENV PORT=3001

EXPOSE 3001

# 環境變數（在 Fly.io CLI 設定）：
#   fly secrets set GPS_ADMIN_ACCOUNT=your_account
#   fly secrets set GPS_ADMIN_PASSWORD_MD5=your_md5_password
#   fly secrets set GPS_SESSION_KEY=your_32byte_base64_key  # 可選，啟用 session 加密
#
# 本地 Docker：
#   docker run -p 3001:3001 \
#     -e GPS_ADMIN_ACCOUNT=xxx \
#     -e GPS_ADMIN_PASSWORD_MD5=xxx \
#     fleet-pro-gps-proxy

CMD ["node", "gpsProxy.js"]
