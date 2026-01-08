# 🚀 HƯỚNG DẪN SETUP VÀ SYNC DỮ LIỆU IOT

## 📋 TỔNG QUAN HỆ THỐNG

### Logic hoạt động:
1. **Initial Sync**: Lấy dữ liệu từ 25/8/2025 đến hiện tại (chạy 1 lần duy nhất)
2. **Auto Sync**: Cron job chạy mỗi 3 giờ, lấy dữ liệu từ ngày mới nhất trong DB đến hiện tại
3. **Frontend API**: Lấy dữ liệu từ database PostgreSQL, KHÔNG lấy từ external IoT API

---

## 🔧 BƯỚC 1: SETUP DATABASE

### 1.1. Cập nhật schema và stations
```bash
# Cập nhật database schema và data trạm
npm run iot:update-stations
```

### 1.2. Kiểm tra kết quả
```bash
# Kiểm tra bảng iot_stations
echo "SELECT \"KiHieu\", serial_number, \"TenDiem\" FROM iot_stations;" | psql $DATABASE_URL

# Kiểm tra cấu trúc bảng iot_data
echo "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'iot_data' ORDER BY ordinal_position;" | psql $DATABASE_URL
```

---

## 📊 BƯỚC 2: SYNC DỮ LIỆU TỪ 25/8/2025

### 2.1. Chạy Initial Sync (LẦN ĐẦU DUY NHẤT)
```bash
# Method 1: Dùng API endpoint
curl -X POST http://localhost:4000/api/iot/initial-sync \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-08-25",
    "stations": ["Log01250713", "Log01250711"], 
    "chunkDays": 30
  }'

# Method 2: Dùng script trực tiếp
node scripts/initialIoTSync.js

# Method 3: Dùng npm command
npm run iot:sync
```

### 2.2. Monitor quá trình sync
```bash
# Kiểm tra logs
tail -f logs/application.log

# Kiểm tra sync logs trong DB
echo "SELECT serial_number, status, records_synced, sync_time FROM iot_sync_logs ORDER BY sync_time DESC LIMIT 10;" | psql $DATABASE_URL
```

### 2.3. Verify dữ liệu đã sync
```bash
# Đếm tổng records
echo "SELECT COUNT(*) as total_records FROM iot_data;" | psql $DATABASE_URL

# Kiểm tra data theo station
echo "SELECT serial_number, COUNT(*) as records, MIN(date_only) as first_date, MAX(date_only) as last_date FROM iot_data GROUP BY serial_number;" | psql $DATABASE_URL

# Xem sample data
echo "SELECT serial_number, date_only, time_only, sensor_type, value FROM iot_data ORDER BY date_only DESC, time_only DESC LIMIT 10;" | psql $DATABASE_URL
```

---

## 🔄 BƯỚC 3: KHỞI ĐỘNG AUTO SYNC

### 3.1. Start server với cron job
```bash
# Chạy server development mode
npm run dev

# HOẶC chạy production mode  
npm start
```

### 3.2. Verify cron job đã chạy
Khi server start, bạn sẽ thấy log:
```
✓ IoT sync cron job started (every 3 hours)
```

### 3.3. Logic Auto Sync:
- **Tần suất**: Mỗi 3 giờ (0 */3 * * *)
- **Dữ liệu sync**: 7 ngày gần nhất (tự động tìm ngày mới nhất trong DB)
- **Timezone**: Asia/Ho_Chi_Minh
- **Prevent duplicate**: Có cơ chế tránh chạy đồng thời

---

## 📱 BƯỚC 4: API CHO FRONTEND (Lấy từ DATABASE)

### 4.1. API Endpoints chính:

#### Lấy danh sách trạm
```bash
GET /api/iot/stations
```
Response:
```json
{
  "success": true,
  "data": [
    {
      "KiHieu": "CKC_IoT",
      "serial_number": "Log01250713",
      "TenDiem": "Cống Kênh C (IoT)",
      "KinhDo": "106°33'57.61872'E",
      "ViDo": "10°42'20.17924'N"
    }
  ],
  "count": 3
}
```

#### Lấy dữ liệu theo trạm
```bash
GET /api/iot/data/Log01250713?startDate=2025-08-25&endDate=2025-12-23
```

#### Lấy tất cả dữ liệu với filter
```bash
GET /api/iot/data?serialNumber=Log01250713&sensorType=Salt&page=1&limit=100
```

### 4.2. ⚠️ QUAN TRỌNG: 
- **API Frontend lấy từ DATABASE PostgreSQL**
- **KHÔNG lấy trực tiếp từ external IoT API**
- Data đã được sync và lưu trong bảng `iot_data`

---

## 🔧 BƯỚC 5: MONITORING VÀ MAINTENANCE

### 5.1. Kiểm tra trạng thái sync
```bash
# API kiểm tra sync status
GET /api/iot/sync/status

# API kiểm tra cron job status  
GET /api/iot/sync/cron-status

# API health check
GET /api/iot/health
```

### 5.2. Manual sync khi cần
```bash
# Sync manual cho tất cả trạm (7 ngày gần nhất)
POST /api/iot/sync/manual

# Sync cho trạm cụ thể
POST /api/iot/sync/Log01250713

# Sync khoảng thời gian cụ thể
POST /api/iot/sync-date-range
{
  "serialNumber": "Log01250713",
  "startDate": "2025-12-20",  
  "endDate": "2025-12-23"
}
```

### 5.3. Backup và cleanup
```bash
# Backup data trước khi làm gì đó
pg_dump $DATABASE_URL -t iot_data > iot_data_backup.sql

# Cleanup old logs (giữ 30 ngày)
echo "DELETE FROM iot_sync_logs WHERE sync_time < NOW() - INTERVAL '30 days';" | psql $DATABASE_URL
```

---

## 📊 BƯỚC 6: TROUBLESHOOTING

### 6.1. Nếu cron job không chạy
```bash
# Restart server
npm run dev

# Check log
tail -f logs/application.log | grep -i cron
```

### 6.2. Nếu sync bị lỗi
```bash
# Xem sync logs với errors
echo "SELECT * FROM iot_sync_logs WHERE status = 'error' ORDER BY sync_time DESC LIMIT 5;" | psql $DATABASE_URL

# Chạy sync manual để test
POST /api/iot/sync/Log01250713
```

### 6.3. Nếu data không đầy đủ
```bash
# Kiểm tra gaps trong data
echo "SELECT date_only, COUNT(*) FROM iot_data WHERE serial_number = 'Log01250713' GROUP BY date_only ORDER BY date_only;" | psql $DATABASE_URL

# Sync lại khoảng missing
POST /api/iot/sync-date-range
```

---

## ✅ FLOW HOÀN CHỈNH

1. **Setup**: `npm run iot:update-stations`
2. **Initial sync**: `npm run iot:sync` (từ 25/8 đến nay)  
3. **Start server**: `npm run dev` (cron job tự chạy mỗi 3h)
4. **Frontend**: Gọi API `/api/iot/data` (lấy từ DB)
5. **Monitor**: Check `/api/iot/health` và logs

### 🎯 KẾT QUẢ MONG ĐỢI:
- Database có đầy đủ data từ 25/8/2025 đến hiện tại
- Cron job tự động cập nhật mỗi 3 giờ  
- Frontend lấy data nhanh từ PostgreSQL
- Hệ thống tự duy trì và sync liên tục