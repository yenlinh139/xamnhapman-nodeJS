#!/usr/bin/env python3
"""
IoT Data Sync Backup Script - Python Version
Dự phòng cho hệ thống sync bằng Node.js
Chia nhỏ theo từng ngày để giảm tải và tăng hiệu suất

Serial Numbers:
- Kênh C-DHNL: Log01250713
- Kênh An Hạ-DHNL: Log01250711

Cách dùng:
python iot_sync_backup.py --station Log01250713 --days 7
python iot_sync_backup.py --all --days 3
"""

import os
import sys
import json
import argparse
import requests
import psycopg2
from datetime import datetime, timedelta
import time
import logging
import urllib3
from typing import List, Dict, Optional, Tuple

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class IoTSyncBackup:
    def __init__(self):
        # API Configuration
        self.API_BASE_URL = "https://thegreenlab.xyz/Datums/DataByDateJson"
        self.credentials = {
            'username': 'nguyenduyliem@hcmuaf.edu.vn',
            'password': 'DHNL@2345'
        }
        
        # Database Configuration (từ ENV hoặc default)
        self.db_config = {
            'host': os.getenv('DB_HOST', 'localhost'),
            'port': os.getenv('DB_PORT', '5432'),
            'database': os.getenv('DB_DATABASE', 'xamnhapman_tphcm'),
            'user': os.getenv('DB_USER', 'postgres'),
            'password': os.getenv('DB_PASSWORD', '51397')
        }
        
        # Setup logging
        self.setup_logging()
        
    def setup_logging(self):
        """Thiết lập logging"""
        log_format = '%(asctime)s - %(levelname)s - %(message)s'
        logging.basicConfig(
            level=logging.INFO,
            format=log_format,
            handlers=[
                logging.FileHandler(f'logs/iot_sync_backup_{datetime.now().strftime("%Y%m%d")}.log'),
                logging.StreamHandler(sys.stdout)
            ]
        )
        self.logger = logging.getLogger(__name__)
        
    def get_db_connection(self):
        """Tạo kết nối database"""
        try:
            conn = psycopg2.connect(**self.db_config)
            return conn
        except Exception as e:
            self.logger.error(f"Database connection failed: {e}")
            raise
            
    def fetch_external_api_data(self, serial_number: str, date_str: str) -> List[Dict]:
        """Fetch data từ external API cho 1 ngày"""
        try:
            url = f"{self.API_BASE_URL}?DeviceSerialNumber={serial_number}&StartDate={date_str}&EndDate={date_str}"
            
            self.logger.info(f"Fetching data for {serial_number} on {date_str}")
            
            response = requests.get(
                url,
                auth=(self.credentials['username'], self.credentials['password']),
                headers={'Content-Type': 'application/json'},
                timeout=30,
                verify=False  # Bỏ qua SSL certificate
            )
            
            response.raise_for_status()
            data = response.json()
            
            if not isinstance(data, list):
                self.logger.warning(f"API returned non-list data for {serial_number} on {date_str}")
                return []
                
            self.logger.info(f"Fetched {len(data)} records for {serial_number} on {date_str}")
            return data
            
        except requests.exceptions.RequestException as e:
            self.logger.error(f"API request failed for {serial_number} on {date_str}: {e}")
            return []
        except Exception as e:
            self.logger.error(f"Unexpected error fetching {serial_number} on {date_str}: {e}")
            return []
            
    def save_to_database(self, serial_number: str, data: List[Dict]) -> Tuple[int, int]:
        """Lưu data vào database với upsert logic"""
        if not data:
            return 0, 0
            
        inserted = 0
        updated = 0
        
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            for item in data:
                try:
                    # Parse date
                    item_date = datetime.strptime(item['Date'], '%Y-%m-%d %H:%M')
                    
                    # Parse value
                    try:
                        value = float(item['Value'])
                    except (ValueError, TypeError):
                        self.logger.warning(f"Invalid value: {item['Value']} for {item['SensorType']}")
                        continue
                    
                    # Check if record exists
                    check_query = """
                        SELECT id FROM iot_data
                        WHERE serial_number = %s 
                        AND date = %s 
                        AND sensor_type = %s
                    """
                    
                    cursor.execute(check_query, (serial_number, item_date, item['SensorType']))
                    existing = cursor.fetchone()
                    
                    if existing:
                        # Update existing record
                        update_query = """
                            UPDATE iot_data
                            SET value = %s,
                                unit = %s,
                                status = %s,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE serial_number = %s 
                            AND date = %s 
                            AND sensor_type = %s
                        """
                        
                        cursor.execute(update_query, (
                            value,
                            item.get('Unit', ''),
                            item.get('Status', 'Normal'),
                            serial_number,
                            item_date,
                            item['SensorType']
                        ))
                        
                        updated += 1
                        
                    else:
                        # Insert new record
                        insert_query = """
                            INSERT INTO iot_data (
                                serial_number, date, sensor_type, 
                                value, unit, status
                            ) VALUES (%s, %s, %s, %s, %s, %s)
                        """
                        
                        cursor.execute(insert_query, (
                            serial_number,
                            item_date,
                            item['SensorType'],
                            value,
                            item.get('Unit', ''),
                            item.get('Status', 'Normal')
                        ))
                        
                        inserted += 1
                        
                except Exception as e:
                    self.logger.error(f"Error processing record: {e}")
                    continue
            
            conn.commit()
            cursor.close()
            conn.close()
            
            return inserted, updated
            
        except Exception as e:
            self.logger.error(f"Database error saving data for {serial_number}: {e}")
            return 0, 0
            
    def get_active_stations(self) -> List[Tuple[str, str]]:
        """Lấy danh sách các trạm active"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT serial_number, name 
                FROM iot_stations 
                WHERE status = 'active'
                ORDER BY serial_number
            """)
            
            stations = cursor.fetchall()
            cursor.close()
            conn.close()
            
            return stations
            
        except Exception as e:
            self.logger.error(f"Error getting active stations: {e}")
            return []
            
    def sync_station_daily(self, serial_number: str, start_date: str, end_date: str) -> Dict:
        """Sync 1 trạm theo từng ngày"""
        self.logger.info(f"Starting daily sync for {serial_number} from {start_date} to {end_date}")
        
        start = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')
        
        total_inserted = 0
        total_updated = 0
        successful_days = 0
        failed_days = 0
        
        current_date = start
        while current_date <= end:
            date_str = current_date.strftime('%Y-%m-%d')
            
            try:
                # Fetch data cho ngày này
                data = self.fetch_external_api_data(serial_number, date_str)
                
                # Save vào database
                inserted, updated = self.save_to_database(serial_number, data)
                
                total_inserted += inserted
                total_updated += updated
                successful_days += 1
                
                self.logger.info(f"✓ {serial_number} {date_str}: {inserted} inserted, {updated} updated")
                
                # Delay để tránh rate limit
                time.sleep(0.5)
                
            except Exception as e:
                self.logger.error(f"✗ {serial_number} {date_str}: {e}")
                failed_days += 1
            
            # Chuyển sang ngày tiếp theo
            current_date += timedelta(days=1)
            
        return {
            'success': failed_days == 0,
            'serial_number': serial_number,
            'inserted': total_inserted,
            'updated': total_updated,
            'successful_days': successful_days,
            'failed_days': failed_days,
            'total_days': (end - start).days + 1
        }
        
    def sync_all_stations(self, days_back: int = 7) -> Dict:
        """Sync tất cả trạm active"""
        self.logger.info(f"Starting sync for all active stations ({days_back} days back)")
        
        # Lấy date range
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=days_back)).strftime('%Y-%m-%d')
        
        # Lấy danh sách trạm
        stations = self.get_active_stations()
        
        if not stations:
            self.logger.warning("No active stations found")
            return {'success': False, 'message': 'No active stations found'}
        
        self.logger.info(f"Found {len(stations)} active stations")
        
        results = []
        total_inserted = 0
        total_updated = 0
        successful = 0
        failed = 0
        
        for serial_number, name in stations:
            self.logger.info(f"Syncing station: {serial_number} - {name}")
            
            result = self.sync_station_daily(serial_number, start_date, end_date)
            results.append(result)
            
            if result['success']:
                successful += 1
                total_inserted += result['inserted']
                total_updated += result['updated']
            else:
                failed += 1
                
            # Delay giữa các stations
            time.sleep(1)
            
        summary = {
            'success': True,
            'total_stations': len(stations),
            'successful': successful,
            'failed': failed,
            'total_inserted': total_inserted,
            'total_updated': total_updated,
            'start_date': start_date,
            'end_date': end_date,
            'results': results
        }
        
        self.logger.info("Sync all stations completed")
        self.logger.info(f"Summary: {successful}/{len(stations)} successful, {total_inserted} inserted, {total_updated} updated")
        
        return summary


def main():
    parser = argparse.ArgumentParser(description='IoT Data Sync Backup Script (Python)')
    parser.add_argument('--station', type=str, help='Specific station serial number to sync')
    parser.add_argument('--all', action='store_true', help='Sync all active stations')
    parser.add_argument('--days', type=int, default=7, help='Number of days back to sync (default: 7)')
    parser.add_argument('--start-date', type=str, help='Start date (YYYY-MM-DD)')
    parser.add_argument('--end-date', type=str, help='End date (YYYY-MM-DD)')
    
    args = parser.parse_args()
    
    if not args.station and not args.all:
        parser.error("Must specify either --station or --all")
    
    sync_service = IoTSyncBackup()
    
    try:
        if args.all:
            # Sync tất cả trạm
            result = sync_service.sync_all_stations(args.days)
            
        else:
            # Sync 1 trạm cụ thể
            if args.start_date and args.end_date:
                start_date = args.start_date
                end_date = args.end_date
            else:
                end_date = datetime.now().strftime('%Y-%m-%d')
                start_date = (datetime.now() - timedelta(days=args.days)).strftime('%Y-%m-%d')
                
            result = sync_service.sync_station_daily(args.station, start_date, end_date)
            
        # In kết quả
        print(json.dumps(result, indent=2, default=str))
        
        # Exit code
        sys.exit(0 if result.get('success', False) else 1)
        
    except Exception as e:
        sync_service.logger.error(f"Script failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()