# SalinityData CRUD API Documentation

This document describes the CRUD API endpoints for managing salinity data (DoMan table) with the following columns:
- **Ngày**: Date (required)
- **CRT**: Cầu Rạch Trà salinity measurement
- **CTT**: Cầu Thủ Thiêm salinity measurement  
- **COT**: Cầu Ông Thìn salinity measurement
- **CKC**: Cống Kênh C salinity measurement
- **KXAH**: Kênh Xáng - An Hạ salinity measurement
- **MNB**: Mũi Nhà Bè salinity measurement
- **PCL**: Phà Cát Lái salinity measurement

## Authentication
Most endpoints require authentication using Bearer token in the Authorization header:
```
Authorization: Bearer <your_access_token>
```

## API Endpoints

### 1. Create Salinity Data
**POST** `/api/salinity-data`
- **Authentication**: Required
- **Description**: Create new salinity data for a specific date

**Request Body:**
```json
{
  "Ngày": "2024-01-15",
  "CRT": 12.5,
  "CTT": 8.3,
  "COT": 15.2,
  "CKC": 10.1,
  "KXAH": 7.8,
  "MNB": 20.4,
  "PCL": 18.6
}
```

**Response:**
```json
{
  "code": 201,
  "message": "Tạo dữ liệu độ mặn thành công",
  "data": {
    "Ngày": "2024-01-15",
    "CRT": 12.5,
    "CTT": 8.3,
    "COT": 15.2,
    "CKC": 10.1,
    "KXAH": 7.8,
    "MNB": 20.4,
    "PCL": 18.6
  }
}
```

### 2. Get All Salinity Data
**GET** `/api/salinity-data`
- **Authentication**: Not required
- **Description**: Get all salinity data with pagination and optional date filtering

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Number of records per page (default: 50)
- `startDate` (optional): Start date filter (YYYY-MM-DD)
- `endDate` (optional): End date filter (YYYY-MM-DD)

**Examples:**
- `/api/salinity-data` - Get first 50 records
- `/api/salinity-data?page=2&limit=20` - Get page 2 with 20 records per page
- `/api/salinity-data?startDate=2024-01-01&endDate=2024-01-31` - Get data for January 2024

**Response:**
```json
{
  "code": 200,
  "data": [
    {
      "Ngày": "2024-01-15",
      "CRT": 12.5,
      "CTT": 8.3,
      "COT": 15.2,
      "CKC": 10.1,
      "KXAH": 7.8,
      "MNB": 20.4,
      "PCL": 18.6
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 3. Get Salinity Data by Date
**GET** `/api/salinity-data/date/:date`
- **Authentication**: Not required
- **Description**: Get salinity data for a specific date

**Parameters:**
- `date`: Date in YYYY-MM-DD format

**Example:**
- `/api/salinity-data/date/2024-01-15`

**Response:**
```json
{
  "code": 200,
  "data": {
    "Ngày": "2024-01-15",
    "CRT": 12.5,
    "CTT": 8.3,
    "COT": 15.2,
    "CKC": 10.1,
    "KXAH": 7.8,
    "MNB": 20.4,
    "PCL": 18.6
  }
}
```

### 4. Get Salinity Data by Date Range
**GET** `/api/salinity-data/range/:startDate/:endDate`
- **Authentication**: Not required
- **Description**: Get salinity data for a specific date range

**Parameters:**
- `startDate`: Start date in YYYY-MM-DD format
- `endDate`: End date in YYYY-MM-DD format

**Example:**
- `/api/salinity-data/range/2024-01-01/2024-01-31`

**Response:**
```json
{
  "code": 200,
  "message": "Lấy dữ liệu độ mặn theo khoảng thời gian thành công",
  "data": [
    {
      "Ngày": "2024-01-15",
      "CRT": 12.5,
      "CTT": 8.3,
      "COT": 15.2,
      "CKC": 10.1,
      "KXAH": 7.8,
      "MNB": 20.4,
      "PCL": 18.6
    },
    {
      "Ngày": "2024-01-16",
      "CRT": 11.8,
      "CTT": 7.9,
      "COT": 14.5,
      "CKC": 9.7,
      "KXAH": 7.2,
      "MNB": 19.8,
      "PCL": 17.9
    }
  ],
  "count": 2
}
```

### 5. Update Salinity Data
**PUT** `/api/salinity-data/:date`
- **Authentication**: Required
- **Description**: Update salinity data for a specific date

**Parameters:**
- `date`: Date in YYYY-MM-DD format

**Request Body:** (All fields are optional, only provide fields you want to update)
```json
{
  "CRT": 13.0,
  "CTT": 9.1,
  "COT": null,
  "MNB": 21.5
}
```

**Response:**
```json
{
  "code": 200,
  "message": "Cập nhật dữ liệu độ mặn thành công",
  "data": {
    "Ngày": "2024-01-15",
    "CRT": 13.0,
    "CTT": 9.1,
    "COT": null,
    "CKC": 10.1,
    "KXAH": 7.8,
    "MNB": 21.5,
    "PCL": 18.6
  }
}
```

### 6. Delete Salinity Data
**DELETE** `/api/salinity-data/:date`
- **Authentication**: Required
- **Description**: Delete salinity data for a specific date

**Parameters:**
- `date`: Date in YYYY-MM-DD format

**Example:**
- `/api/salinity-data/2024-01-15`

**Response:**
```json
{
  "code": 200,
  "message": "Xóa dữ liệu độ mặn thành công",
  "data": {
    "Ngày": "2024-01-15",
    "CRT": 12.5,
    "CTT": 8.3,
    "COT": 15.2,
    "CKC": 10.1,
    "KXAH": 7.8,
    "MNB": 20.4,
    "PCL": 18.6
  }
}
```

### 7. Delete Salinity Data Range
**DELETE** `/api/salinity-data-range`
- **Authentication**: Required
- **Description**: Delete multiple salinity data records within a date range

**Request Body:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

**Response:**
```json
{
  "code": 200,
  "message": "Xóa thành công 31 bản ghi dữ liệu độ mặn",
  "deletedCount": 31
}
```

## Error Responses

### 400 Bad Request
```json
{
  "code": 400,
  "message": "Ngày là bắt buộc"
}
```

### 401 Unauthorized
```json
{
  "code": 401,
  "message": "Unauthorized"
}
```

### 404 Not Found
```json
{
  "code": 404,
  "message": "Không tìm thấy dữ liệu cho ngày này"
}
```

### 409 Conflict
```json
{
  "code": 409,
  "message": "Dữ liệu cho ngày này đã tồn tại"
}
```

### 500 Internal Server Error
```json
{
  "code": 500,
  "message": "Lỗi máy chủ"
}
```

## Notes

1. All salinity measurement values (CRT, CTT, COT, CKC, KXAH, MNB, PCL) are optional and can be `null`
2. The `Ngày` field is required for CREATE operations and is used as identifier for UPDATE/DELETE operations
3. Date format should be in YYYY-MM-DD format
4. Pagination is available for the GET all endpoint to handle large datasets
5. Authentication is required for CREATE, UPDATE, and DELETE operations
6. SQL injection protection is implemented using escape-html library
