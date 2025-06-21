# 🌊 API Xâm Nhập Mặn TP.HCM

[![Node.js](https://img.shields.io/badge/Node.js-14.x-green.svg)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.26.2-blue.svg)](https://fastify.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue.svg)](https://postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-Cache-red.svg)](https://redis.io/)

Hệ thống API backend cho việc giám sát và quản lý dữ liệu xâm nhập mặn tại Thành phố Hồ Chí Minh. Được xây dựng với Fastify framework, hỗ trợ xử lý dữ liệu độ mặn, khí tượng thủy văn và quản lý người dùng.

## 🚀 Chạy nhanh

```bash
# Clone & cài đặt
git clone <repo-url>
cd backend
npm install

# Cấu hình
cp .env.example .env
# Chỉnh sửa thông tin DB trong .env

# Chạy
npm run dev    # Development
npm start      # Production
```

## 🔧 Yêu cầu

- Node.js 14+
- PostgreSQL
- Redis

## 📋 API chính

### Auth
- `POST /api/login` - Đăng nhập
- `POST /api/signup` - Đăng ký

### Dữ liệu độ mặn
- `GET /api/salinity-points` - Danh sách điểm đo
- `GET /api/salinity-table/:kihieu` - Dữ liệu theo điểm
- `POST /api/salinity-export` - Xuất Excel

**8 điểm đo**: CRT (Cầu Rạch Tra), CTT (Cầu Thủ Thiêm), COT (Cầu Ông Thìn), CKC (Cống Kênh C), KXAH (Kênh Xáng đứng 1), MNB (Mũi Nhà Bè), PCL (Phà Cát Lái), KXD2 (Kênh Xáng đứng 2)

### Khác
- `GET /api/user` - Quản lý user
- `GET /api/feedback` - Phản hồi
- `GET /api/documentation` - API docs

## 🐳 Docker

```bash
docker compose up -d  # Redis + GeoServer
```

## ⚙️ Config .env

```env
PORT=4000
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=your_pass
DB_NAME=xamnhapman_tphcm
REDIS_HOST=localhost
ACCESS_TOKEN=your_secret
```

## 👨‍💻 Tác giả

**Nguyen Vo Yen Linh** - 21166139@st.hcmuaf.edu.vn

---
*Khóa luận tốt nghiệp - Hệ thống giám sát xâm nhập mặn TP.HCM*