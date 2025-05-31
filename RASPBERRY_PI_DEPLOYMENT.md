# Raspberry Pi Deployment Guide

## 🍓 Running Fastify API on Raspberry Pi with PM2

This guide will help you deploy your Fastify API application on a Raspberry Pi using PM2 for process management.

## Prerequisites

### Hardware Requirements
- Raspberry Pi 3B+ or newer (4GB+ RAM recommended)
- MicroSD card (32GB+ recommended)
- Stable internet connection

### Software Requirements
- Raspberry Pi OS (64-bit recommended)
- Node.js 18+
- PostgreSQL
- Docker & Docker Compose
- PM2

## 🚀 Quick Setup

### 1. Transfer Files to Raspberry Pi
```bash
# Copy your project to Raspberry Pi
scp -r /path/to/your/project pi@your-pi-ip:/home/pi/fastify-api
```

### 2. Run the Automated Setup
```bash
cd /home/pi/fastify-api
chmod +x start-raspberry.sh
chmod +x monitor-raspberry.sh
npm run raspberry:start
```

## 📋 Manual Setup Steps

### Step 1: Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version
```

### Step 2: Install PostgreSQL
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database
sudo -u postgres psql
```

In PostgreSQL shell:
```sql
CREATE DATABASE xamnhapman_tphcm;
CREATE USER postgres WITH PASSWORD '51397';
GRANT ALL PRIVILEGES ON DATABASE xamnhapman_tphcm TO postgres;
\q
```

### Step 3: Install Docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker pi
sudo pip3 install docker-compose
```

### Step 4: Install PM2
```bash
sudo npm install -g pm2
```

### Step 5: Setup Application
```bash
cd /home/pi/fastify-api

# Install dependencies
npm install --production

# Copy Raspberry Pi environment
cp .env.raspberry .env

# Start Docker services
npm run raspberry:docker

# Start application with PM2
npm run pm2:start

# Save PM2 configuration
pm2 save

# Enable PM2 startup
pm2 startup
```

## 🔧 Configuration Files

### PM2 Configuration (`ecosystem.config.js`)
The PM2 configuration is optimized for Raspberry Pi with:
- Single instance (fork mode)
- Memory restart at 1GB
- Proper logging
- Auto-restart on crashes

### Docker Configuration
The `docker-compose.raspberry.yml` includes:
- Memory limits for containers
- Optimized Java settings for GeoServer
- Persistent volumes

### Environment Variables
Use `.env.raspberry` for Raspberry Pi specific settings.

## 📊 Monitoring

### Check System Status
```bash
npm run raspberry:monitor
npm run raspberry:monitor --detailed
```

### PM2 Commands
```bash
npm run pm2:status    # Check application status
npm run pm2:logs      # View application logs
npm run pm2:restart   # Restart application
npm run pm2:stop      # Stop application
```

### Monitor Resources
```bash
# CPU temperature
cat /sys/class/thermal/thermal_zone0/temp

# Memory usage
free -h

# PM2 monitoring
pm2 monit
```

## 🔍 Troubleshooting

### Common Issues

#### 1. High CPU Temperature
- Ensure proper ventilation
- Consider adding a fan or heatsink
- Monitor with: `watch -n 1 cat /sys/class/thermal/thermal_zone0/temp`

#### 2. Memory Issues
- Monitor memory usage: `free -h`
- Restart application: `npm run pm2:restart`
- Check for memory leaks in logs

#### 3. Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test database connection
sudo -u postgres psql -d xamnhapman_tphcm -c "SELECT 1;"
```

#### 4. Redis Connection Issues
```bash
# Check Redis container
docker ps | grep redis

# Test Redis connection
redis-cli ping
```

#### 5. Port Already in Use
```bash
# Check what's using port 4000
sudo netstat -tlnp | grep :4000

# Kill process if needed
sudo kill -9 <PID>
```

### Performance Optimization

#### For Raspberry Pi 3
```javascript
// In ecosystem.config.js
max_memory_restart: '512M',
instances: 1,
exec_mode: 'fork'
```

#### For Raspberry Pi 4 (4GB+)
```javascript
// In ecosystem.config.js
max_memory_restart: '1G',
instances: 2,  // Can use cluster mode
exec_mode: 'cluster'
```

## 🌐 Access Your Application

- **API**: http://your-pi-ip:4000
- **API Documentation**: http://your-pi-ip:4000/docs
- **GeoServer**: http://your-pi-ip:8080/geoserver

## 🔄 Auto-Start on Boot

The setup script automatically configures PM2 to start on boot. To verify:

```bash
# Check if PM2 startup is configured
pm2 startup

# Save current PM2 processes
pm2 save

# Test reboot
sudo reboot
```

## 📱 Remote Access

### Port Forwarding
Configure your router to forward ports:
- 4000 (API)
- 8080 (GeoServer)

### SSH Tunneling
```bash
# From your local machine
ssh -L 4000:localhost:4000 pi@your-pi-ip
```

## 🔒 Security Considerations

1. **Change default passwords**
2. **Use environment variables for secrets**
3. **Enable UFW firewall**:
   ```bash
   sudo ufw enable
   sudo ufw allow 22    # SSH
   sudo ufw allow 4000  # API
   sudo ufw allow 8080  # GeoServer
   ```
4. **Regular updates**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

## 📈 Scaling

For better performance:
1. Use external Redis server
2. Use external PostgreSQL server
3. Set up load balancer with multiple Pi units
4. Use PM2 cluster mode on Pi 4

## 🆘 Support

Check logs for issues:
```bash
# Application logs
npm run pm2:logs

# System logs
sudo journalctl -f

# Docker logs
docker-compose logs -f
```
