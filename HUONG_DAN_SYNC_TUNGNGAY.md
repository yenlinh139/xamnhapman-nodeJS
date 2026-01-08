# 🛠️ HƯỚNG DẪN KHẮC PHỤC LỖI VÀ SYNC TỪNG NGÀY

## 🚨 Khắc phục lỗi Authentication Database

### Bước 1: Kiểm tra file .env
```bash
# Kiểm tra file .env có tồn tại không
ls -la .env

# Xem nội dung (nếu có)
cat .env
```

### Bước 2: Tạo hoặc cập nhật file .env
```bash
# Tạo file .env với thông tin database đúng
cat > .env << 'EOF'
# Database Configuration
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password  
DB_DATABASE=your_db_name
DB_PORT=5432

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Redis Configuration (nếu có)
REDIS_HOST=localhost
REDIS_PORT=6379

# Server Configuration
PORT=3000
NODE_ENV=development
EOF
```

### Bước 3: Test kết nối Database
```bash
# Test với psql command line
psql -h localhost -U your_db_user -d your_db_name -p 5432

# Hoặc test với node script
node -e "
const {Pool} = require('pg');
const db = new Pool({
  host: 'localhost',
  user: 'your_db_user', 
  password: 'your_db_password',
  database: 'your_db_name',
  port: 5432
});
db.query('SELECT NOW()', (err, result) => {
  if (err) console.error('❌ Database Error:', err.message);
  else console.log('✅ Database Connected:', result.rows[0]);
  process.exit();
});
"
```

## 📅 SYNC DỮ LIỆU TỪNG NGÀY

### Script mới được tạo:

1. **`dailyIoTSync.js`** - Sync một ngày cụ thể
2. **`batchIoTSync.js`** - Sync từ 25/8/2025 đến hiện tại từng ngày một

### Cách sử dụng:

#### 🔹 Sync một ngày cụ thể:
```bash
# Sync ngày hôm nay
npm run iot:sync-daily

# Sync ngày cụ thể (format: YYYY-MM-DD)
npm run iot:sync-daily 2025-08-25
node scripts/dailyIoTSync.js 2025-08-25

# Sync ngày khác
node scripts/dailyIoTSync.js 2025-08-26
node scripts/dailyIoTSync.js 2025-08-27
```

#### 🔹 Sync toàn bộ từ 25/8 đến hiện tại:
```bash
# Chạy batch sync (tự động từ 25/8/2025 đến hôm nay)
npm run iot:sync-batch
```

### ⚡ Script sẽ làm gì:

1. **Kiểm tra database connection** trước khi bắt đầu
2. **Gọi API từng trạm** cho ngày được chỉ định:
   - CKC_IoT (Can Kich Ca)
   - CAH_IoT (Ca Mau Ha)  
   - CVT_IoT (Ca Mau Vong Tau)
3. **Kiểm tra duplicate** trước khi insert
4. **Delay 2-3 giây** giữa các request để tránh overload
5. **Báo cáo chi tiết** số lượng bản ghi mỗi trạm

### 📊 Ví dụ Output:
```
🗓️ =====================================
📅 Đang sync dữ liệu ngày: 25/08/2025
🗓️ =====================================

🏭 --- Xử lý trạm: Can Kich Ca (CKC_IoT) ---
📡 Đang gọi API cho trạm CKC_IoT ngày 25/08/2025...
✅ Lấy được 24 bản ghi cho trạm CKC_IoT
💾 Đã lưu 24 bản ghi mới cho trạm Can Kich Ca

⏳ Chờ 2 giây trước khi xử lý trạm tiếp theo...

🏭 --- Xử lý trạm: Ca Mau Ha (CAH_IoT) ---
📡 Đang gọi API cho trạm CAH_IoT ngày 25/08/2025...
✅ Lấy được 22 bản ghi cho trạm CAH_IoT
💾 Đã lưu 22 bản ghi mới cho trạm Ca Mau Ha

✅ Hoàn thành sync ngày 25/08/2025
📊 Tổng kết: 70 bản ghi mới
```

## 🔧 Các bước troubleshooting:

### 1. Nếu vẫn lỗi database:
```bash
# Kiểm tra PostgreSQL service
sudo systemctl status postgresql
# Hoặc trên Windows
net start postgresql-x64-13

# Kiểm tra port database
netstat -an | grep 5432
```

### 2. Nếu lỗi API:
```bash
# Test API thủ công
curl -X GET "https://thegreenlab.xyz/Datums/DataByDateJson" \
  -G \
  -d "DeviceSerialNumber=Log01210325" \
  -d "StartDate=2025-08-25" \
  -d "EndDate=2025-08-25" \
  -u "nguyenduyliem@hcmuaf.edu.vn:DHNL@2345"
```

### 3. Nếu muốn xem log chi tiết:
```bash
# Xem log file
tail -f logs/combined.log

# Hoặc run với debug
DEBUG=* npm run iot:sync-daily
```

## 📋 Checklist trước khi chạy:

- [ ] ✅ File .env có thông tin database đúng
- [ ] ✅ PostgreSQL service đang chạy
- [ ] ✅ User database có quyền INSERT vào bảng iot_stations  
- [ ] ✅ Bảng iot_stations đã được tạo với schema mới
- [ ] ✅ Internet connection ổn định để gọi API
- [ ] ✅ API credentials (nguyenduyliem@hcmuaf.edu.vn:DHNL@2345) vẫn hoạt động

## 🎯 Kế hoạch sync dữ liệu:

### Phương án 1: Sync theo tuần
```bash
# Tuần 1: 25/8 - 31/8
for date in 2025-08-25 2025-08-26 2025-08-27 2025-08-28 2025-08-29 2025-08-30 2025-08-31; do
  echo "Syncing $date"
  node scripts/dailyIoTSync.js $date
  sleep 5
done
```

### Phương án 2: Sync toàn bộ (KHUYẾN NGHỊ)
```bash
# Chạy batch script sẽ tự động sync từ 25/8 đến hiện tại
npm run iot:sync-batch
```

---

💡 **Lưu ý quan trọng:**
- Script mới sẽ **tự động skip** các bản ghi đã tồn tại
- **Không bao giờ duplicate** dữ liệu
- **Delay giữa các request** để tránh bị API block
- **Log chi tiết** mọi hoạt động để dễ debug
- **Exit code** khác 0 nếu có lỗi, giúp monitor script