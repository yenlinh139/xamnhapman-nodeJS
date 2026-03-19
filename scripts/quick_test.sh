#!/bin/bash

echo "🚀 Quick Test IoT System"

# Test 1: Kiểm tra server running
echo "📡 1. Testing server health..."
curl -s http://localhost:4000/api/iot/health | jq .

# Test 2: Kiểm tra stations 
echo -e "\n🏢 2. Testing stations endpoint..."
curl -s http://localhost:4000/api/iot/stations | jq '.data | length'

# Test 3: Kiểm tra stats
echo -e "\n📊 3. Testing stats endpoint..."
curl -s http://localhost:4000/api/iot/stats | jq '.success'

# Test 4: Manual sync (if needed)
read -p "🔄 4. Do you want to trigger manual sync? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Triggering manual sync..."
    curl -s -X POST http://localhost:4000/api/iot/sync/manual \
      -H "Content-Type: application/json" \
      -d '{"days": 3}' | jq .
fi

# Test 5: Kiểm tra data count
echo -e "\n📈 5. Testing data endpoint..."
curl -s "http://localhost:4000/api/iot/data?limit=5" | jq '.pagination.total'

echo -e "\n✅ Quick test completed!"