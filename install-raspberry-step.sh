#!/bin/bash

# 🍓 RASPBERRY PI STEP-BY-STEP INSTALLER
# Cài đặt từng bước cho Fastify API trên Raspberry Pi

# Màu sắc
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "\n${BLUE}📋 BƯỚC $1: $2${NC}"
    echo "=================================="
}

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

pause_for_user() {
    echo -e "\n${YELLOW}Nhấn Enter để tiếp tục hoặc Ctrl+C để thoát...${NC}"
    read -p ""
}

# =============================================================================
print_step "1" "KIỂM TRA HỆ THỐNG"
# =============================================================================

echo "Thông tin hệ thống:"
echo "- OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"')"
echo "- Architecture: $(uname -m)"
echo "- Kernel: $(uname -r)"
echo "- Memory: $(free -h | grep Mem | awk '{print $2}')"
echo "- Disk: $(df -h / | tail -1 | awk '{print $4}') available"

if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    print_error "Script này chỉ chạy trên Linux"
    exit 1
fi

print_status "Hệ thống phù hợp"
pause_for_user

# =============================================================================
print_step "2" "CẬP NHẬT HỆ THỐNG"
# =============================================================================

print_info "Cập nhật package list và system..."
sudo apt update && sudo apt upgrade -y

print_info "Cài đặt dependencies cơ bản..."
sudo apt install -y curl wget git vim htop build-essential python3-pip software-properties-common

print_status "Hệ thống đã được cập nhật"
pause_for_user

# =============================================================================
print_step "3" "CÀI ĐẶT NODE.JS"
# =============================================================================

if command -v node &> /dev/null; then
    print_warning "Node.js đã được cài đặt: $(node --version)"
    echo "Bạn có muốn cài đặt lại? (y/N)"
    read -p "" choice
    if [[ "$choice" != "y" && "$choice" != "Y" ]]; then
        print_info "Bỏ qua cài đặt Node.js"
    else
        sudo apt remove -y nodejs npm
    fi
fi

if ! command -v node &> /dev/null || [[ "$choice" == "y" || "$choice" == "Y" ]]; then
    print_info "Cài đặt Node.js 18 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    print_status "Node.js đã được cài đặt:"
    echo "- Node: $(node --version)"
    echo "- NPM: $(npm --version)"
fi

pause_for_user

# =============================================================================
print_step "4" "CÀI ĐẶT POSTGRESQL"
# =============================================================================

if command -v psql &> /dev/null; then
    print_warning "PostgreSQL đã được cài đặt"
    sudo systemctl status postgresql --no-pager -l
else
    print_info "Cài đặt PostgreSQL..."
    sudo apt install -y postgresql postgresql-contrib
    
    print_info "Khởi động PostgreSQL..."
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    
    print_status "PostgreSQL đã được cài đặt và khởi động"
fi

print_info "Tạo database và user..."
sudo -u postgres psql << EOF
CREATE DATABASE xamnhapman_tphcm;
ALTER USER postgres PASSWORD '51397';
GRANT ALL PRIVILEGES ON DATABASE xamnhapman_tphcm TO postgres;
\q
EOF

print_status "Database đã được cấu hình"
pause_for_user

# =============================================================================
print_step "5" "CÀI ĐẶT DOCKER"
# =============================================================================

if command -v docker &> /dev/null; then
    print_warning "Docker đã được cài đặt: $(docker --version)"
else
    print_info "Cài đặt Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    
    print_status "Docker đã được cài đặt"
fi

# Cài đặt Docker Compose
if command -v docker-compose &> /dev/null; then
    print_warning "Docker Compose đã có: $(docker-compose --version)"
else
    print_info "Cài đặt Docker Compose..."
    sudo pip3 install docker-compose
    print_status "Docker Compose đã được cài đặt"
fi

pause_for_user

# =============================================================================
print_step "6" "CÀI ĐẶT PM2"
# =============================================================================

if command -v pm2 &> /dev/null; then
    print_warning "PM2 đã được cài đặt: $(pm2 --version)"
else
    print_info "Cài đặt PM2..."
    sudo npm install -g pm2
    print_status "PM2 đã được cài đặt: $(pm2 --version)"
fi

pause_for_user

# =============================================================================
print_step "7" "THIẾT LẬP PROJECT"
# =============================================================================

print_info "Tạo thư mục cần thiết..."
mkdir -p logs
mkdir -p src/uploads
touch src/uploads/.gitkeep

print_info "Kiểm tra package.json..."
if [ ! -f "package.json" ]; then
    print_error "Không tìm thấy package.json!"
    exit 1
fi

print_info "Cài đặt Node.js dependencies..."
npm install --production

print_status "Dependencies đã được cài đặt"
pause_for_user

# =============================================================================
print_step "8" "CẤU HÌNH ENVIRONMENT"
# =============================================================================

if [ -f ".env" ]; then
    print_warning "File .env đã tồn tại"
    echo "Bạn có muốn backup và tạo mới? (y/N)"
    read -p "" choice
    if [[ "$choice" == "y" || "$choice" == "Y" ]]; then
        mv .env .env.backup.$(date +%Y%m%d_%H%M%S)
        print_info "Đã backup file .env cũ"
    fi
fi

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_status "Đã tạo .env từ .env.example"
    else
        print_info "Tạo file .env cơ bản..."
        cat > .env << EOF
NODE_ENV=production
PORT=4000
BASE_URL_LOCAL=http://localhost

# Database
DB_HOST=localhost
DB_DATABASE=xamnhapman_tphcm
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=51397

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
ACCESS_TOKEN=cew3ttPb9223dfsa33f4O4679N2f9d70LINH0G5fwef1adad76d1f4gvfd3LINH07c3vffd2734b3fa4
REFRESH_TOKEN=4679N2f9d70LINH0G5fwef1adad76d1f4gvfd3LINH07c3vffd2734b3fa4
EXPIRES_ACCESS_TOKEN=1h
EXPIRES_REFRESH_TOKEN=3d
SECRET_KEY_SALT=cew3ttPb92234O4679N2f9d70LINH0G5fwef1adad76d1f4gvfd37c3vffd2734b3fa4
JWT_SECRET=cew59tPb92yn4O4629N2f9d70LINH0G5fwef1ad5576d1f4gvLINHc3vffnv734b3fa4

# Email
EMAIL=your_email@example.com
EMAIL_PASSWORD=your_app_password
EOF
        print_status "Đã tạo file .env cơ bản"
    fi
fi

print_warning "Vui lòng kiểm tra và chỉnh sửa file .env nếu cần:"
echo "nano .env"
pause_for_user

# =============================================================================
print_step "9" "KHỞI ĐỘNG DOCKER SERVICES"
# =============================================================================

print_info "Kiểm tra Docker services..."

# Kiểm tra file docker-compose
if [ -f "docker-compose.raspberry.yml" ]; then
    COMPOSE_FILE="docker-compose.raspberry.yml"
    print_info "Sử dụng docker-compose.raspberry.yml"
else
    COMPOSE_FILE="docker-compose.yml"
    print_info "Sử dụng docker-compose.yml"
fi

print_info "Khởi động Docker services..."
docker-compose -f $COMPOSE_FILE up -d

print_info "Đợi services khởi động..."
sleep 15

print_info "Kiểm tra trạng thái containers:"
docker-compose -f $COMPOSE_FILE ps

print_status "Docker services đã được khởi động"
pause_for_user

# =============================================================================
print_step "10" "KHỞI ĐỘNG ỨNG DỤNG VỚI PM2"
# =============================================================================

print_info "Kiểm tra ecosystem.config.js..."
if [ ! -f "ecosystem.config.js" ]; then
    print_error "Không tìm thấy ecosystem.config.js!"
    exit 1
fi

print_info "Khởi động ứng dụng với PM2..."
pm2 start ecosystem.config.js --env production

print_info "Lưu cấu hình PM2..."
pm2 save

print_info "Thiết lập PM2 auto-start..."
pm2 startup

print_status "Ứng dụng đã được khởi động với PM2"

# =============================================================================
print_step "11" "KIỂM TRA VÀ HOÀN TẤT"
# =============================================================================

echo ""
print_info "🎉 CÀI ĐẶT HOÀN TẤT!"
echo "===================="

# Lấy IP
PI_IP=$(hostname -I | awk '{print $1}')

echo "📊 Thông tin hệ thống:"
echo "- Node.js: $(node --version)"
echo "- NPM: $(npm --version)"  
echo "- PM2: $(pm2 --version)"
echo "- PostgreSQL: $(sudo -u postgres psql --version | head -1)"
echo "- Docker: $(docker --version)"

echo ""
echo "🐳 Docker Services:"
docker-compose -f $COMPOSE_FILE ps

echo ""
echo "⚡ PM2 Status:"
pm2 status

echo ""
echo "🌐 URLs truy cập:"
echo "- API: http://${PI_IP}:4000"
echo "- API Docs: http://${PI_IP}:4000/docs"
echo "- GeoServer: http://${PI_IP}:8080/geoserver"

echo ""
echo "📝 Các lệnh hữu ích:"
echo "- pm2 logs fastify-api     # Xem logs"
echo "- pm2 status               # Kiểm tra trạng thái"
echo "- pm2 restart fastify-api  # Restart ứng dụng"
echo "- pm2 monit               # Monitor realtime"

echo ""
echo "🔧 Troubleshooting:"
echo "- Xem logs: tail -f logs/combined.log"
echo "- Test API: curl http://localhost:4000"
echo "- Restart services: docker-compose restart"

print_status "🚀 Deployment thành công trên Raspberry Pi!"
