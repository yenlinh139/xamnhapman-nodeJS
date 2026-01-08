#!/bin/bash

# IoT Sync Cron Helper Script
# Quản lý việc chạy sync IoT data theo lịch trình

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

# Tạo thư mục logs nếu chưa có
mkdir -p "$LOG_DIR"

# Hàm log với timestamp
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_DIR/iot_sync_cron.log"
}

# Hàm sync bằng Node.js
sync_nodejs() {
    log "Starting IoT sync with Node.js..."
    
    cd "$PROJECT_DIR"
    
    # Kiểm tra nếu server đang chạy
    if pgrep -f "node.*server.js" > /dev/null; then
        log "Server is running, triggering manual sync via API..."
        # Có thể gọi API endpoint để trigger manual sync
        curl -X POST http://localhost:3000/api/iot/manual-sync 2>/dev/null || {
            log "API call failed, will run standalone sync"
            node scripts/initialIoTSync.js >> "$LOG_DIR/iot_sync_cron.log" 2>&1
        }
    else
        log "Server is not running, running standalone sync..."
        node scripts/initialIoTSync.js >> "$LOG_DIR/iot_sync_cron.log" 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        log "✓ Node.js sync completed successfully"
        return 0
    else
        log "✗ Node.js sync failed"
        return 1
    fi
}

# Hàm sync bằng Python (backup)
sync_python() {
    log "Starting IoT sync with Python backup script..."
    
    cd "$PROJECT_DIR/scripts"
    
    # Kiểm tra nếu Python và dependencies có sẵn
    if command -v python3 &> /dev/null; then
        python3 iot_sync_backup.py --all --days 3 >> "$LOG_DIR/iot_sync_cron.log" 2>&1
    elif command -v python &> /dev/null; then
        python iot_sync_backup.py --all --days 3 >> "$LOG_DIR/iot_sync_cron.log" 2>&1
    else
        log "✗ Python not found, cannot run backup sync"
        return 1
    fi
    
    if [ $? -eq 0 ]; then
        log "✓ Python sync completed successfully"
        return 0
    else
        log "✗ Python sync failed"
        return 1
    fi
}

# Hàm chính - thử Node.js trước, nếu fail thì dùng Python
main_sync() {
    log "========================================="
    log "Starting IoT data sync process"
    log "========================================="
    
    # Thử sync bằng Node.js trước
    if sync_nodejs; then
        log "Sync completed successfully with Node.js"
        return 0
    fi
    
    log "Node.js sync failed, trying Python backup..."
    
    # Nếu Node.js fail, thử Python
    if sync_python; then
        log "Sync completed successfully with Python backup"
        return 0
    fi
    
    log "✗ Both Node.js and Python sync failed!"
    return 1
}

# Kiểm tra tham số dòng lệnh
case "${1:-auto}" in
    "nodejs")
        sync_nodejs
        ;;
    "python")
        sync_python
        ;;
    "auto"|"")
        main_sync
        ;;
    "install")
        log "Installing Python dependencies..."
        cd "$PROJECT_DIR/scripts"
        pip3 install -r requirements.txt
        ;;
    "setup-cron")
        log "Setting up cron job for every 3 hours..."
        # Tạo cron job chạy mỗi 3 giờ
        CRON_CMD="0 */3 * * * $SCRIPT_DIR/iot_sync_cron.sh auto"
        (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
        log "✓ Cron job added: Every 3 hours"
        ;;
    "remove-cron")
        log "Removing cron job..."
        crontab -l | grep -v "iot_sync_cron.sh" | crontab -
        log "✓ Cron job removed"
        ;;
    "status")
        log "Checking cron job status..."
        if crontab -l | grep -q "iot_sync_cron.sh"; then
            log "✓ Cron job is active:"
            crontab -l | grep "iot_sync_cron.sh"
        else
            log "✗ No cron job found"
        fi
        ;;
    *)
        echo "Usage: $0 {auto|nodejs|python|install|setup-cron|remove-cron|status}"
        echo ""
        echo "Commands:"
        echo "  auto         - Try Node.js first, then Python backup (default)"
        echo "  nodejs       - Force sync with Node.js only"
        echo "  python       - Force sync with Python only"
        echo "  install      - Install Python dependencies"
        echo "  setup-cron   - Setup cron job to run every 3 hours"
        echo "  remove-cron  - Remove cron job"
        echo "  status       - Check cron job status"
        exit 1
        ;;
esac