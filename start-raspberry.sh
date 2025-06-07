#!/bin/bash

# Raspberry Pi Startup Script for Fastify API
# This script sets up and starts all required services

echo "🍓 Starting Raspberry Pi Fastify API Setup..."

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to check if a service is running
check_service() {
    if systemctl is-active --quiet $1; then
        echo "✅ $1 is running"
        return 0
    else
        echo "❌ $1 is not running"
        return 1
    fi
}

# Function to start PostgreSQL
start_postgresql() {
    echo "🐘 Starting PostgreSQL..."
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    check_service postgresql
}

# Function to start Docker services (Redis & GeoServer)
start_docker_services() {
    echo "🐳 Starting Docker services..."
    if command -v docker &> /dev/null; then
        docker-compose up -d
        echo "✅ Docker services started"
    else
        echo "❌ Docker not found. Please install Docker first."
        exit 1
    fi
}

# Function to install Node.js dependencies
install_dependencies() {
    echo "📦 Installing Node.js dependencies..."
    if [ -f "package.json" ]; then
        npm install --production
        echo "✅ Dependencies installed"
    else
        echo "❌ package.json not found"
        exit 1
    fi
}

# Function to start the application with PM2
start_application() {
    echo "🚀 Starting application with PM2..."
    
    # Copy Raspberry Pi environment file
    if [ -f ".env.raspberry" ]; then
        cp .env.raspberry .env
        echo "✅ Environment file configured for Raspberry Pi"
    fi
    
    # Start with PM2
    npm run pm2:start
    
    # Save PM2 configuration
    pm2 save
    
    # Enable PM2 startup
    pm2 startup
    
    echo "✅ Application started successfully!"
}

# Function to show status
show_status() {
    echo ""
    echo "📊 System Status:"
    echo "=================="
    
    # PostgreSQL status
    check_service postgresql
    
    # Docker services status
    echo "🐳 Docker services:"
    docker-compose ps
    
    # PM2 status
    echo "⚡ PM2 processes:"
    pm2 status
    
    echo ""
    echo "🌐 Application should be available at: http://localhost:4000"
    echo "📚 API Documentation: http://localhost:4000/docs"
}

# Main execution
echo "Starting services in order..."

start_postgresql
start_docker_services
install_dependencies
start_application
show_status

echo ""
echo "🎉 Raspberry Pi setup complete!"
echo "Use 'npm run pm2:logs' to view application logs"
echo "Use 'npm run pm2:status' to check application status"
