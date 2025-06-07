# 🍓 HƯỚNG DẪN DEPLOY CHI TIẾT TRÊN RASPBERRY PI

## 📋 CHUẨN BỊ

### Yêu cầu hệ thống:
- Raspberry Pi 3B+ hoặc mới hơn
- RAM: tối thiểu 2GB (khuyến nghị 4GB+)
- Raspberry Pi OS 64-bit
- Kết nối internet ổn định

---

## 🔌 BƯỚC 1: KẾT NỐI VÀO RASPBERRY PI

### 1.1 SSH từ máy tính khác:
```bash
# Tìm IP của Raspberry Pi
# Trên Raspberry Pi chạy: hostname -I
# Hoặc check router admin panel

# SSH vào Pi
ssh pi@192.168.1.100  # Thay IP thực tế của bạn
```

### 1.2 Hoặc truy cập trực tiếp:
- Kết nối màn hình, bàn phím vào Pi
- Mở Terminal

---

## 📥 BƯỚC 2: CLONE REPOSITORY

```bash
# Cập nhật hệ thống trước
sudo apt update && sudo apt upgrade -y

# Cài đặt git nếu chưa có
sudo apt install -y git

# Clone repository
git clone https://github.com/your-username/your-repo-name.git

# Vào thư mục project
cd your-repo-name

# Kiểm tra files
ls -la
```

---

## 🚀 BƯỚC 3: CÀI ĐẶT TỰ ĐỘNG (KHUYẾN NGHỊ)

### 3.1 Sử dụng script từng bước (dễ debug):
```bash
# Cho phép thực thi script
chmod +x install-raspberry-step.sh

# Chạy script cài đặt từng bước
./install-raspberry-step.sh
```

### 3.2 Hoặc cài đặt hoàn toàn tự động:
```bash
# Cho phép thực thi script
chmod +x install-raspberry.sh

# Chạy script cài đặt tự động
./install-raspberry.sh
```

---

## 🛠️ BƯỚC 4: CÀI ĐẶT THỦ CÔNG (NẾU SCRIPT LỖI)

### 4.1 Cài đặt Node.js 18:
```bash
# Thêm NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Cài đặt Node.js
sudo apt-get install -y nodejs

# Kiểm tra version
node --version
npm --version
```

### 4.2 Cài đặt PostgreSQL:
```bash
# Cài đặt PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Khởi động service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Kiểm tra trạng thái
sudo systemctl status postgresql
```

### 4.3 Tạo database:
```bash
# Vào PostgreSQL shell
sudo -u postgres psql

# Trong PostgreSQL shell, chạy:
CREATE DATABASE xamnhapman_tphcm;
ALTER USER postgres PASSWORD '51397';
GRANT ALL PRIVILEGES ON DATABASE xamnhapman_tphcm TO postgres;
\q
```

### 4.4 Cài đặt Docker:
```bash
# Download và cài đặt Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Thêm user vào docker group
sudo usermod -aG docker $USER

# Cài đặt Docker Compose
sudo pip3 install docker-compose

# Kiểm tra
docker --version
docker-compose --version
```

### 4.5 Cài đặt PM2:
```bash
# Cài đặt PM2 globally
sudo npm install -g pm2

# Kiểm tra
pm2 --version
```

### 4.6 Setup project:
```bash
# Tạo thư mục cần thiết
mkdir -p logs
mkdir -p src/uploads

# Cài đặt dependencies
npm install --production

# Copy file environment
cp .env.example .env

# Chỉnh sửa file .env (quan trọng!)
nano .env
```

### 4.7 Khởi động services:
```bash
# Khởi động Docker containers
docker-compose -f docker-compose.raspberry.yml up -d

# Hoặc nếu không có file raspberry.yml
docker-compose up -d

# Kiểm tra containers
docker ps
```

### 4.8 Khởi động ứng dụng:
```bash
# Start với PM2
pm2 start ecosystem.config.js --env production

# Lưu cấu hình PM2
pm2 save

# Setup auto-start
pm2 startup

# Kiểm tra trạng thái
pm2 status
```

---

## 🔧 BƯỚC 5: XÁC MINH CÀI ĐẶT

### 5.1 Kiểm tra services:
```bash
# Kiểm tra PM2
pm2 status

# Kiểm tra Docker
docker ps

# Kiểm tra PostgreSQL
sudo systemctl status postgresql

# Kiểm tra port đang listen
sudo netstat -tlnp | grep :4000
```

### 5.2 Test API:
```bash
# Test cơ bản
curl http://localhost:4000

# Test với IP
curl http://$(hostname -I | awk '{print $1}'):4000
```

### 5.3 Xem logs:
```bash
# PM2 logs
pm2 logs fastify-api

# Application logs
tail -f logs/combined.log

# Docker logs
docker-compose logs -f
```

---

## 🌐 BƯỚC 6: TRUY CẬP ỨNG DỤNG

### 6.1 Lấy IP của Raspberry Pi:
```bash
hostname -I
```

### 6.2 Truy cập các URLs:
- **API Homepage**: `http://PI_IP:4000`
- **API Documentation**: `http://PI_IP:4000/docs`
- **GeoServer**: `http://PI_IP:8080/geoserver`

---

## 📊 BƯỚC 7: QUẢN LÝ VÀ MONITORING

### 7.1 PM2 Commands:
```bash
pm2 status                    # Xem trạng thái
pm2 logs fastify-api         # Xem logs
pm2 restart fastify-api      # Restart app
pm2 stop fastify-api         # Stop app
pm2 delete fastify-api       # Xóa app khỏi PM2
pm2 monit                    # Monitor realtime
```

### 7.2 Docker Commands:
```bash
docker ps                    # Xem containers
docker-compose ps            # Xem services
docker-compose logs -f       # Xem logs
docker-compose restart       # Restart services
docker-compose down          # Stop services
docker-compose up -d         # Start services
```

### 7.3 System Monitoring:
```bash
# CPU temperature (Raspberry Pi)
cat /sys/class/thermal/thermal_zone0/temp

# Memory usage
free -h

# Disk usage
df -h

# Running processes
htop
```

---

## 🔄 BƯỚC 8: CẬP NHẬT CODE

### 8.1 Khi có code mới trên GitHub:
```bash
# Pull code mới
git pull origin main

# Cài đặt dependencies mới (nếu có)
npm install --production

# Restart ứng dụng
pm2 restart fastify-api

# Kiểm tra logs
pm2 logs fastify-api
```

---

## 🆘 TROUBLESHOOTING

### ❌ Lỗi thường gặp:

#### 1. Port 4000 đã được sử dụng:
```bash
# Tìm process đang dùng port
sudo netstat -tlnp | grep :4000

# Kill process
sudo kill -9 <PID>

# Restart PM2
pm2 restart fastify-api
```

#### 2. PostgreSQL không kết nối được:
```bash
# Kiểm tra service
sudo systemctl status postgresql

# Restart service
sudo systemctl restart postgresql

# Test connection
sudo -u postgres psql -c "SELECT 1;"
```

#### 3. Docker containers không start:
```bash
# Kiểm tra logs
docker-compose logs

# Restart containers
docker-compose restart

# Kiểm tra disk space
df -h
```

#### 4. PM2 không start:
```bash
# Xóa PM2 processes cũ
pm2 delete all

# Restart PM2
pm2 start ecosystem.config.js --env production

# Check logs
pm2 logs
```

#### 5. Raspberry Pi quá nóng:
```bash
# Kiểm tra nhiệt độ
watch -n 1 cat /sys/class/thermal/thermal_zone0/temp

# Nếu > 70°C, cần:
# - Thêm heatsink/fan
# - Giảm tải CPU
# - Kiểm tra thông gió
```

---

## 🔒 BẢO MẬT VÀ TỐI ƯU

### 🛡️ Security:
```bash
# Enable UFW firewall
sudo ufw enable
sudo ufw allow 22     # SSH
sudo ufw allow 4000   # API
sudo ufw allow 8080   # GeoServer

# Đổi password mặc định
passwd

# Disable SSH password auth (khuyến nghị)
# sudo nano /etc/ssh/sshd_config
# PasswordAuthentication no
```

### ⚡ Performance:
```bash
# Tăng file descriptor limit
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# GPU memory split (nếu không dùng GUI)
echo "gpu_mem=16" | sudo tee -a /boot/config.txt
```

---

## ✅ CHECKLIST HOÀN TẤT

- [ ] ✅ Repository đã được clone về Pi
- [ ] ✅ Node.js 18+ đã được cài đặt
- [ ] ✅ PostgreSQL đã chạy và database đã tạo
- [ ] ✅ Docker containers (Redis, GeoServer) đang chạy
- [ ] ✅ PM2 đã start ứng dụng
- [ ] ✅ API có thể truy cập từ browser
- [ ] ✅ PM2 đã setup auto-start
- [ ] ✅ Logs hoạt động bình thường

🎉 **CHÚC MỪNG! Ứng dụng của bạn đã chạy thành công trên Raspberry Pi!** 🍓
