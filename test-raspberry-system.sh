#!/bin/bash

# 🍓 RASPBERRY PI SYSTEM TEST
# Kiểm tra hệ thống sau khi cài đặt

echo "🔍 KIỂM TRA HỆ THỐNG RASPBERRY PI"
echo "================================="

# Màu sắc
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_test() {
    echo -e "\n${BLUE}🧪 TEST: $1${NC}"
    echo "----------------------------"
}

print_pass() {
    echo -e "${GREEN}✅ PASS: $1${NC}"
}

print_fail() {
    echo -e "${RED}❌ FAIL: $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ WARNING: $1${NC}"
}

# =============================================================================
print_test "SYSTEM INFORMATION"
# =============================================================================

echo "📊 Thông tin hệ thống:"
echo "- OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '\"')"
echo "- Architecture: $(uname -m)"
echo "- Kernel: $(uname -r)"
echo "- Uptime: $(uptime -p)"

# Kiểm tra memory
MEMORY=$(free -m | grep Mem | awk '{print $2}')
echo "- Total Memory: ${MEMORY}MB"
if [ $MEMORY -lt 1000 ]; then
    print_warning "Memory thấp hơn 1GB"
else
    print_pass "Memory đủ dùng"
fi

# Kiểm tra disk space
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
echo "- Disk Usage: ${DISK_USAGE}%"
if [ $DISK_USAGE -gt 80 ]; then
    print_warning "Disk space gần đầy"
else
    print_pass "Disk space OK"
fi

# Kiểm tra CPU temperature
if [ -f "/sys/class/thermal/thermal_zone0/temp" ]; then
    TEMP=$(cat /sys/class/thermal/thermal_zone0/temp)
    TEMP_C=$((TEMP/1000))
    echo "- CPU Temperature: ${TEMP_C}°C"
    if [ $TEMP_C -gt 70 ]; then
        print_warning "CPU nhiệt độ cao"
    else
        print_pass "CPU nhiệt độ bình thường"
    fi
fi

# =============================================================================
print_test "SOFTWARE VERSIONS"
# =============================================================================

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "- Node.js: $NODE_VERSION"
    print_pass "Node.js đã cài đặt"
else
    print_fail "Node.js chưa được cài đặt"
fi

# NPM
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "- NPM: $NPM_VERSION"
    print_pass "NPM đã cài đặt"
else
    print_fail "NPM chưa được cài đặt"
fi

# PM2
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 --version)
    echo "- PM2: $PM2_VERSION"
    print_pass "PM2 đã cài đặt"
else
    print_fail "PM2 chưa được cài đặt"
fi

# PostgreSQL
if command -v psql &> /dev/null; then
    PSQL_VERSION=$(sudo -u postgres psql --version | head -1)
    echo "- PostgreSQL: $PSQL_VERSION"
    print_pass "PostgreSQL đã cài đặt"
else
    print_fail "PostgreSQL chưa được cài đặt"
fi

# Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo "- Docker: $DOCKER_VERSION"
    print_pass "Docker đã cài đặt"
else
    print_fail "Docker chưa được cài đặt"
fi

# Docker Compose
if command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version)
    echo "- Docker Compose: $COMPOSE_VERSION"
    print_pass "Docker Compose đã cài đặt"
else
    print_fail "Docker Compose chưa được cài đặt"
fi

# =============================================================================
print_test "SERVICE STATUS"
# =============================================================================

# PostgreSQL
if systemctl is-active --quiet postgresql; then
    print_pass "PostgreSQL service đang chạy"
else
    print_fail "PostgreSQL service không chạy"
fi

# Docker
if systemctl is-active --quiet docker; then
    print_pass "Docker service đang chạy"
else
    print_fail "Docker service không chạy"
fi

# =============================================================================
print_test "DATABASE CONNECTION"
# =============================================================================

# Test PostgreSQL connection
if sudo -u postgres psql -d xamnhapman_tphcm -c "SELECT 1;" &>/dev/null; then
    print_pass "Database connection thành công"
else
    print_fail "Không thể kết nối database"
fi

# =============================================================================
print_test "DOCKER CONTAINERS"
# =============================================================================

# Kiểm tra containers
if command -v docker &> /dev/null; then
    echo "🐳 Docker containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    
    # Kiểm tra Redis
    if docker ps | grep redis &>/dev/null; then
        print_pass "Redis container đang chạy"
        
        # Test Redis connection
        if docker exec redis redis-cli ping &>/dev/null; then
            print_pass "Redis connection thành công"
        else
            print_fail "Redis connection thất bại"
        fi
    else
        print_fail "Redis container không chạy"
    fi
    
    # Kiểm tra GeoServer
    if docker ps | grep geoserver &>/dev/null; then
        print_pass "GeoServer container đang chạy"
    else
        print_fail "GeoServer container không chạy"
    fi
fi

# =============================================================================
print_test "PM2 APPLICATION"
# =============================================================================

if command -v pm2 &> /dev/null; then
    echo "⚡ PM2 processes:"
    pm2 status
    
    # Kiểm tra ứng dụng fastify-api
    if pm2 list | grep fastify-api | grep online &>/dev/null; then
        print_pass "Fastify API đang chạy với PM2"
    else
        print_fail "Fastify API không chạy hoặc có lỗi"
    fi
fi

# =============================================================================
print_test "NETWORK CONNECTIVITY"
# =============================================================================

# Kiểm tra port 4000
if netstat -tlnp 2>/dev/null | grep :4000 &>/dev/null; then
    print_pass "Port 4000 đang listen"
else
    print_fail "Port 4000 không listen"
fi

# Test API endpoint
PI_IP=$(hostname -I | awk '{print $1}')
if curl -s "http://localhost:4000" &>/dev/null; then
    print_pass "API endpoint accessible locally"
else
    print_fail "API endpoint không accessible"
fi

# =============================================================================
print_test "FILE SYSTEM"
# =============================================================================

# Kiểm tra các files cần thiết
FILES_TO_CHECK=(
    "package.json"
    "ecosystem.config.js"
    "src/server.js"
    ".env"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
        print_pass "$file exists"
    else
        print_fail "$file missing"
    fi
done

# Kiểm tra thư mục
DIRS_TO_CHECK=(
    "src"
    "logs"
    "src/uploads"
)

for dir in "${DIRS_TO_CHECK[@]}"; do
    if [ -d "$dir" ]; then
        print_pass "$dir directory exists"
    else
        print_fail "$dir directory missing"
    fi
done

# =============================================================================
echo -e "\n🏁 TEST SUMMARY"
echo "================"

PI_IP=$(hostname -I | awk '{print $1}')

echo "🌐 Access URLs:"
echo "- API: http://${PI_IP}:4000"
echo "- API Docs: http://${PI_IP}:4000/docs"
echo "- GeoServer: http://${PI_IP}:8080/geoserver"

echo ""
echo "📝 Useful Commands:"
echo "- pm2 logs fastify-api     # Xem logs"
echo "- pm2 monit               # Monitor realtime"
echo "- docker-compose logs -f   # Docker logs"
echo "- htop                    # System monitor"

echo ""
echo "🔧 If there are failures:"
echo "1. Check logs: pm2 logs fastify-api"
echo "2. Restart app: pm2 restart fastify-api"
echo "3. Restart docker: docker-compose restart"
echo "4. Check system: systemctl status postgresql"

if pm2 list | grep fastify-api | grep online &>/dev/null && netstat -tlnp 2>/dev/null | grep :4000 &>/dev/null; then
    echo -e "\n${GREEN}🎉 SYSTEM TEST PASSED! Your application is running successfully!${NC}"
else
    echo -e "\n${RED}⚠️ SYSTEM TEST FAILED! Please check the failures above.${NC}"
fi
