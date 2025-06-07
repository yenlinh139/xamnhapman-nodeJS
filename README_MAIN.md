# 🌊 Xâm Nhập Mặn TPHCM - Backend API

API backend cho hệ thống theo dõi xâm nhập mặn tại TP.HCM, được xây dựng bằng Fastify và tối ưu hóa cho Raspberry Pi.

## 🚀 Tính năng chính

- **RESTful API** với Fastify framework
- **Cơ sở dữ liệu PostgreSQL** cho lưu trữ dữ liệu
- **Redis** cho caching và session management
- **JWT Authentication** với access/refresh tokens
- **GeoServer** tích hợp cho dữ liệu địa lý
- **PM2** process management
- **Docker** containerization
- **Swagger/OpenAPI** documentation

## 🏗️ Kiến trúc hệ thống

```
├── src/
│   ├── server.js              # Entry point
│   ├── controllers/           # Business logic
│   ├── routes/               # API routes
│   ├── middlewares/          # Custom middlewares
│   ├── connection/           # Database & Redis
│   └── utils/                # Helper functions
├── ecosystem.config.js       # PM2 configuration
├── docker-compose.yml        # Docker services
└── RASPBERRY_PI_DEPLOYMENT.md # Deployment guide
```

## 🛠️ Công nghệ sử dụng

- **Runtime**: Node.js 18+
- **Framework**: Fastify
- **Database**: PostgreSQL
- **Cache**: Redis
- **Process Manager**: PM2
- **Containerization**: Docker
- **Authentication**: JWT
- **Logging**: Pino + Winston

## 📋 Yêu cầu hệ thống

### Minimum Requirements
- Node.js >= 14.x
- PostgreSQL >= 12
- Redis >= 6
- RAM >= 2GB (khuyến nghị 4GB+ cho Raspberry Pi)

### Raspberry Pi Specific
- Raspberry Pi 3B+ hoặc mới hơn
- Raspbian OS 64-bit
- MicroSD card >= 32GB

## 🚀 Cài đặt và chạy

### 1. Clone repository
\`\`\`bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
\`\`\`

### 2. Cài đặt dependencies
\`\`\`bash
npm install
\`\`\`

### 3. Cấu hình environment
\`\`\`bash
cp .env.example .env
# Chỉnh sửa file .env với thông tin cấu hình của bạn
\`\`\`

### 4. Khởi động services
\`\`\`bash
# Khởi động Redis và GeoServer
docker-compose up -d

# Khởi động ứng dụng
npm run dev
\`\`\`

## 🍓 Deploy trên Raspberry Pi

### Quick Setup
\`\`\`bash
# Clone và setup tự động
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
chmod +x start-raspberry.sh
./start-raspberry.sh
\`\`\`

### Manual Setup
Xem chi tiết trong [RASPBERRY_PI_DEPLOYMENT.md](./RASPBERRY_PI_DEPLOYMENT.md)

## 📊 PM2 Commands

\`\`\`bash
npm run pm2:start     # Khởi động với PM2
npm run pm2:status    # Kiểm tra trạng thái
npm run pm2:logs      # Xem logs
npm run pm2:restart   # Restart ứng dụng
npm run pm2:stop      # Dừng ứng dụng
\`\`\`

## 🔍 Monitoring

\`\`\`bash
# Kiểm tra hệ thống (Raspberry Pi)
npm run raspberry:monitor

# Xem logs realtime
npm run pm2:logs

# Monitor PM2
pm2 monit
\`\`\`

## 📚 API Documentation

Khi ứng dụng đang chạy, truy cập:
- **API Docs**: http://localhost:4000/docs
- **API Base**: http://localhost:4000/api

## 🔧 Scripts có sẵn

\`\`\`bash
npm run dev           # Development mode
npm run start         # Production mode
npm run build         # Build ứng dụng
npm run format        # Format code
npm run test          # Chạy tests

# PM2 Scripts
npm run pm2:start     # Start with PM2
npm run pm2:restart   # Restart PM2
npm run pm2:stop      # Stop PM2
npm run pm2:logs      # View logs

# Raspberry Pi Scripts
npm run raspberry:start    # Auto setup on Pi
npm run raspberry:monitor  # System monitoring
npm run raspberry:docker   # Start optimized containers
\`\`\`

## 🌐 Endpoints chính

\`\`\`
GET  /                    # Health check
GET  /docs               # API documentation

# Authentication
POST /api/auth/login     # User login
POST /api/auth/register  # User registration
POST /api/auth/refresh   # Refresh token

# Salinity Data
GET  /api/salinity       # Get salinity data
POST /api/salinity       # Create salinity data

# Maps
GET  /api/maps/regions   # Get map regions
POST /api/maps/regions   # Create map region

# Users
GET  /api/users          # Get users
POST /api/users          # Create user
PUT  /api/users/:id      # Update user
DELETE /api/users/:id    # Delete user
\`\`\`

## 🔒 Security

- JWT-based authentication
- BCrypt password hashing
- Rate limiting (100 requests/2 minutes per IP)
- CORS configuration
- Environment variables for sensitive data

## 📝 Database Schema

Dự án sử dụng PostgreSQL với các bảng chính:
- \`users\` - Quản lý người dùng
- \`salinity_data\` - Dữ liệu độ mặn
- \`map_regions\` - Vùng bản đồ
- \`feedback\` - Phản hồi người dùng

## 🤝 Contributing

1. Fork repository
2. Tạo feature branch (\`git checkout -b feature/amazing-feature\`)
3. Commit changes (\`git commit -m 'Add amazing feature'\`)
4. Push to branch (\`git push origin feature/amazing-feature\`)
5. Tạo Pull Request

## 📄 License

Dự án này được phát hành dưới giấy phép ISC.

## 👥 Authors

- **Nguyen Vo Yen Linh** - *Initial work*

## 🆘 Support

Nếu gặp vấn đề:
1. Kiểm tra [Issues](https://github.com/your-username/your-repo-name/issues)
2. Xem [Deployment Guide](./RASPBERRY_PI_DEPLOYMENT.md)
3. Kiểm tra logs: \`npm run pm2:logs\`

## 📊 Monitoring URLs

Khi deployed:
- **API**: http://your-pi-ip:4000
- **Docs**: http://your-pi-ip:4000/docs  
- **GeoServer**: http://your-pi-ip:8080/geoserver
- **PM2 Web**: http://your-pi-ip:9615 (nếu cài pm2-web)
