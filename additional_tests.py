#!/usr/bin/env python3
"""
Additional specific tests for the user's review request
"""

import requests
import json
import uuid

BACKEND_URL = "https://27ef3f46-1b55-4927-9864-92e764b485c6.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

def test_specific_user_concerns():
    """Test specific issues mentioned in the user's review request"""
    print("🔍 Testing Specific User Concerns...")
    
    results = []
    
    # 1. Test GET /api/ endpoint
    try:
        response = requests.get(f"{API_BASE}/", timeout=10)
        success = response.status_code == 200
        results.append(f"✅ GET /api/ endpoint: {response.status_code}" if success else f"❌ GET /api/ endpoint: {response.status_code}")
    except Exception as e:
        results.append(f"❌ GET /api/ endpoint: {str(e)}")
    
    # 2. Test authentication endpoints
    try:
        # Register
        test_user = f"testuser_{uuid.uuid4().hex[:8]}"
        register_data = {"username": test_user, "password": "testpass123"}
        response = requests.post(f"{API_BASE}/auth/register", json=register_data, timeout=10)
        register_success = response.status_code == 200
        results.append(f"✅ POST /api/auth/register: {response.status_code}" if register_success else f"❌ POST /api/auth/register: {response.status_code}")
        
        # Login
        if register_success:
            login_data = {"username": test_user, "password": "testpass123"}
            response = requests.post(f"{API_BASE}/auth/login", json=login_data, timeout=10)
            login_success = response.status_code == 200
            results.append(f"✅ POST /api/auth/login: {response.status_code}" if login_success else f"❌ POST /api/auth/login: {response.status_code}")
        else:
            results.append("❌ POST /api/auth/login: Skipped due to registration failure")
    except Exception as e:
        results.append(f"❌ Authentication endpoints: {str(e)}")
    
    # 3. Test game creation
    try:
        game_data = {"bet_amount": 5}
        response = requests.post(f"{API_BASE}/game/create", json=game_data, timeout=10)
        success = response.status_code == 200
        if success:
            data = response.json()
            session_id = data.get("session_id")
            results.append(f"✅ POST /api/game/create: Created session {session_id}")
        else:
            results.append(f"❌ POST /api/game/create: {response.status_code}")
    except Exception as e:
        results.append(f"❌ POST /api/game/create: {str(e)}")
    
    # 4. Test payment endpoints
    try:
        # Create bet
        bet_data = {
            "session_id": str(uuid.uuid4()),
            "player_id": str(uuid.uuid4()),
            "wallet_address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "bet_amount": 3
        }
        response = requests.post(f"{API_BASE}/payment/create-bet", json=bet_data, timeout=10)
        create_success = response.status_code == 200
        results.append(f"✅ POST /api/payment/create-bet: {response.status_code}" if create_success else f"❌ POST /api/payment/create-bet: {response.status_code}")
        
        # Confirm bet
        if create_success:
            data = response.json()
            transaction_id = data.get("transaction_id")
            confirm_data = {
                "transaction_id": transaction_id,
                "signature": f"fake_signature_{uuid.uuid4()}"
            }
            response = requests.post(f"{API_BASE}/payment/confirm-bet", json=confirm_data, timeout=10)
            confirm_success = response.status_code == 200
            results.append(f"✅ POST /api/payment/confirm-bet: {response.status_code}" if confirm_success else f"❌ POST /api/payment/confirm-bet: {response.status_code}")
        else:
            results.append("❌ POST /api/payment/confirm-bet: Skipped due to create-bet failure")
    except Exception as e:
        results.append(f"❌ Payment endpoints: {str(e)}")
    
    # 5. Test database connection (via leaderboard)
    try:
        response = requests.get(f"{API_BASE}/leaderboard", timeout=10)
        success = response.status_code == 200
        if success:
            data = response.json()
            has_required_fields = all(field in data for field in ["leaderboard", "total_winnings", "active_players"])
            results.append(f"✅ Database connection (leaderboard): Working" if has_required_fields else f"❌ Database connection: Missing fields")
        else:
            results.append(f"❌ Database connection (leaderboard): {response.status_code}")
    except Exception as e:
        results.append(f"❌ Database connection: {str(e)}")
    
    # Print results
    print("\n" + "="*60)
    print("SPECIFIC USER CONCERN TEST RESULTS:")
    print("="*60)
    for result in results:
        print(result)
    
    # Summary
    passed = sum(1 for r in results if r.startswith("✅"))
    total = len(results)
    print(f"\nSUMMARY: {passed}/{total} specific concerns addressed successfully")
    
    return passed == total

if __name__ == "__main__":
    success = test_specific_user_concerns()
    if success:
        print("\n🎉 All specific user concerns are working correctly!")
    else:
        print("\n⚠️ Some specific concerns need attention.")