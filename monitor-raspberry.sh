#!/bin/bash

# Raspberry Pi Monitoring Script for Fastify API
# This script monitors system resources and application health

echo "🔍 Raspberry Pi System Monitor"
echo "=============================="

# Function to check CPU temperature (Raspberry Pi specific)
check_cpu_temp() {
    if [ -f "/sys/class/thermal/thermal_zone0/temp" ]; then
        temp=$(cat /sys/class/thermal/thermal_zone0/temp)
        temp_c=$((temp/1000))
        echo "🌡️  CPU Temperature: ${temp_c}°C"
        
        if [ $temp_c -gt 70 ]; then
            echo "⚠️  WARNING: CPU temperature is high!"
        fi
    fi
}

# Function to check memory usage
check_memory() {
    echo "💾 Memory Usage:"
    free -h
    echo ""
}

# Function to check disk usage
check_disk() {
    echo "💿 Disk Usage:"
    df -h / | tail -1
    echo ""
}

# Function to check application status
check_app_status() {
    echo "⚡ PM2 Application Status:"
    pm2 status
    echo ""
    
    echo "🔗 Port Status:"
    netstat -tlnp | grep :4000 || echo "❌ Application not listening on port 4000"
    echo ""
}

# Function to check database connection
check_database() {
    echo "🐘 PostgreSQL Status:"
    if systemctl is-active --quiet postgresql; then
        echo "✅ PostgreSQL is running"
        
        # Check if database is accessible
        if sudo -u postgres psql -d xamnhapman_tphcm -c "SELECT 1;" &>/dev/null; then
            echo "✅ Database connection successful"
        else
            echo "❌ Database connection failed"
        fi
    else
        echo "❌ PostgreSQL is not running"
    fi
    echo ""
}

# Function to check Redis
check_redis() {
    echo "🔴 Redis Status:"
    if docker ps | grep redis &>/dev/null; then
        echo "✅ Redis container is running"
        
        # Check Redis connection
        if redis-cli ping &>/dev/null; then
            echo "✅ Redis connection successful"
        else
            echo "❌ Redis connection failed"
        fi
    else
        echo "❌ Redis container is not running"
    fi
    echo ""
}

# Function to show recent logs
show_recent_logs() {
    echo "📋 Recent Application Logs (last 20 lines):"
    echo "============================================"
    if [ -f "logs/out.log" ]; then
        tail -20 logs/out.log
    else
        echo "No logs found"
    fi
    echo ""
}

# Function to show application metrics
show_metrics() {
    echo "📊 Application Metrics:"
    echo "======================"
    pm2 monit --no-daemon 2>/dev/null || echo "PM2 monitoring not available"
    echo ""
}

# Main execution
check_cpu_temp
check_memory
check_disk
check_app_status
check_database
check_redis

# Optional detailed information
if [ "$1" = "--detailed" ] || [ "$1" = "-d" ]; then
    show_recent_logs
    show_metrics
fi

echo "📝 Tips:"
echo "- Run with --detailed for more information"
echo "- Use 'npm run pm2:logs' for live logs"
echo "- Use 'npm run pm2:restart' to restart the app"
