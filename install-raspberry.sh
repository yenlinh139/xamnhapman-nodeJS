#!/bin/bash

# 🍓 RASPBERRY PI AUTO INSTALLER
# Tự động cài đặt và chạy Fastify API trên Raspberry Pi

echo "🍓 BẮT ĐẦU CÀI ĐẶT FASTIFY API TRÊN RASPBERRY PI..."
echo "================================================="

# Màu sắc cho output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function để hiển thị status
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️ $1${NC}"
}

# Kiểm tra OS
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    print_error "Script này chỉ chạy trên Linux (Raspberry Pi OS)"
    exit 1
fi

# Cập nhật hệ thống
print_info "Cập nhật hệ thống..."
sudo apt update && sudo apt upgrade -y
print_status "Hệ thống đã được cập nhật"

# Cài đặt các dependencies cơ bản
print_info "Cài đặt dependencies cơ bản..."
sudo apt install -y curl wget git vim htop

# Cài đặt Node.js
print_info "Cài đặt Node.js 18..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    print_status "Node.js đã được cài đặt: $(node --version)"
else
    print_status "Node.js đã có sẵn: $(node --version)"
fi

# Cài đặt PostgreSQL
print_info "Cài đặt PostgreSQL..."
if ! command -v psql &> /dev/null; then
    sudo apt install -y postgresql postgresql-contrib
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    print_status "PostgreSQL đã được cài đặt"
    
    # Tạo database
    print_info "Tạo database..."
    sudo -u postgres psql -c "CREATE DATABASE xamnhapman_tphcm;" 2>/dev/null || print_warning "Database có thể đã tồn tại"
    sudo -u postgres psql -c "ALTER USER postgres PASSWORD '51397';" 2>/dev/null
    print_status "Database đã được cấu hình"
else
    print_status "PostgreSQL đã có sẵn"
fi

# Cài đặt Docker
print_info "Cài đặt Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    print_status "Docker đã được cài đặt"
    
    # Cài đặt Docker Compose
    sudo pip3 install docker-compose 2>/dev/null || sudo apt install -y docker-compose
    print_status "Docker Compose đã được cài đặt"
else
    print_status "Docker đã có sẵn"
fi

# Cài đặt PM2
print_info "Cài đặt PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
    print_status "PM2 đã được cài đặt: $(pm2 --version)"
else
    print_status "PM2 đã có sẵn: $(pm2 --version)"
fi

# Tạo thư mục logs
mkdir -p logs
mkdir -p src/uploads
touch src/uploads/.gitkeep

# Cài đặt dependencies
print_info "Cài đặt Node.js dependencies..."
if [ -f "package.json" ]; then
    npm install --production
    print_status "Dependencies đã được cài đặt"
else
    print_error "Không tìm thấy package.json"
    exit 1
fi

# Copy file environment
print_info "Cấu hình environment..."
if [ -f ".env.example" ]; then
    cp .env.example .env
    print_status "File .env đã được tạo từ .env.example"
    print_warning "Vui lòng chỉnh sửa file .env với thông tin cấu hình của bạn"
else
    print_warning "Không tìm thấy .env.example, tạo file .env cơ bản..."
    cat > .env << EOF
NODE_ENV=production
PORT=4000
DB_HOST=localhost
DB_DATABASE=xamnhapman_tphcm
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=51397
REDIS_HOST=localhost
REDIS_PORT=6379
ACCESS_TOKEN=cew3ttPb9223dfsa33f4O4679N2f9d70LINH0G5fwef1adad76d1f4gvfd3LINH07c3vffd2734b3fa4
REFRESH_TOKEN=4679N2f9d70LINH0G5fwef1adad76d1f4gvfd3LINH07c3vffd2734b3fa4
EXPIRES_ACCESS_TOKEN=1h
EXPIRES_REFRESH_TOKEN=3d
SECRET_KEY_SALT=cew3ttPb92234O4679N2f9d70LINH0G5fwef1adad76d1f4gvfd37c3vffd2734b3fa4
JWT_SECRET=cew59tPb92yn4O4629N2f9d70LINH0G5fwef1ad5576d1f4gvLINHc3vffnv734b3fa4
EMAIL=your_email@example.com
EMAIL_PASSWORD=your_app_password
EOF
fi

# Khởi động Docker services
print_info "Khởi động Docker services..."
if [ -f "docker-compose.raspberry.yml" ]; then
    docker-compose -f docker-compose.raspberry.yml up -d
    print_status "Docker services (Redis, GeoServer) đã được khởi động"
else
    docker-compose up -d
    print_status "Docker services đã được khởi động"
fi

# Đợi services khởi động
print_info "Đợi services khởi động..."
sleep 10

# Khởi động ứng dụng với PM2
print_info "Khởi động ứng dụng với PM2..."
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

print_status "Ứng dụng đã được khởi động với PM2"

# Hiển thị thông tin hệ thống
echo ""
echo "🎉 CÀI ĐẶT HOÀN TẤT!"
echo "===================="
print_info "Thông tin hệ thống:"
echo "- Node.js: $(node --version)"
echo "- NPM: $(npm --version)"
echo "- PM2: $(pm2 --version)"
echo "- PostgreSQL: $(psql --version | head -1)"
echo "- Docker: $(docker --version)"

echo ""
print_info "Services đang chạy:"
docker-compose ps
echo ""
pm2 status

echo ""
print_info "URLs truy cập:"
PI_IP=$(hostname -I | awk '{print $1}')
echo "- API: http://${PI_IP}:4000"
echo "- API Docs: http://${PI_IP}:4000/docs"
echo "- GeoServer: http://${PI_IP}:8080/geoserver"

echo ""
print_info "Các lệnh hữu ích:"
echo "- npm run pm2:logs      # Xem logs"
echo "- npm run pm2:status    # Kiểm tra trạng thái"
echo "- npm run pm2:restart   # Restart ứng dụng"
echo "- npm run raspberry:monitor # Monitor hệ thống"

echo ""
print_warning "Lưu ý:"
echo "1. Chỉnh sửa file .env nếu cần thay đổi cấu hình"
echo "2. Kiểm tra firewall nếu không truy cập được từ bên ngoài"
echo "3. Sử dụng 'sudo reboot' để khởi động lại và test auto-start"

print_status "Cài đặt thành công! 🚀"
