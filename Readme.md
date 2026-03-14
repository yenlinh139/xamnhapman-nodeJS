# API Xam Nhap Man TP.HCM (Backend)

## 1. Yeu cau

- Node.js >= 14 (khuyen nghi 18+)
- PostgreSQL
- Redis
- PM2 (neu chay production): `npm i -g pm2`

## 2. Cai dat lan dau

```bash
cd backend
cp .env.example .env
# Chinh sua thong tin DB/Redis/token trong .env

npm install
```

## 3. Chay local

```bash
# Development
npm run dev

# Chay giong production (khong PM2)
npm start
```

## 4. Chay production bang PM2

Du an da co `ecosystem.config.js`.

```bash
# Start
npm run pm2:start

# Theo doi trang thai/log
npm run pm2:status
npm run pm2:logs
```

## 5. Quy trinh deploy sau khi pull code tu git

```bash
cd /path/to/backend

# Lay code moi
git pull

# Cap nhat dependencies cho production
npm install --production
# Hoac: npm ci --omit=dev

# Restart service
npm run pm2:restart || npm run pm2:start

# Kiem tra lai trang thai
npm run pm2:status
```

## 6. Khoi tao server production moi (1 lan)

```bash
cd /path/to/backend
cp .env.example .env
# Chinh sua .env

npm install --production
npm run pm2:start

# Luu process de tu khoi dong lai sau reboot
pm2 save
pm2 startup
```

## 7. Kiem tra nhanh sau deploy

```bash
curl http://localhost:4000/
curl http://localhost:4000/api/salinity-points
curl http://localhost:4000/api/hydrometeorology-stations
```