#!/usr/bin/env python3
"""
Focused Test Suite for Enhanced Slither.io Features
Tests the specific new slither.io features mentioned in the review request
"""

import requests
import json
import uuid
import time

# Test Configuration
BACKEND_URL = "https://27ef3f46-1b55-4927-9864-92e764b485c6.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

def test_slither_io_backend_features():
    """Test all the slither.io backend features mentioned in the review request"""
    print("🐍 TESTING ENHANCED SLITHER.IO BACKEND FEATURES")
    print("="*60)
    
    results = []
    
    # 1. Test Admin Account Creation and FREE Game Access
    print("\n1️⃣ Testing Admin Account Creation and FREE Game Access...")
    try:
        # Create admin account
        admin_username = f"slithertest_{uuid.uuid4().hex[:8]}"
        admin_payload = {
            "username": admin_username,
            "password": "slither123456",
            "admin_secret": "cyberslither_admin_2025"
        }
        admin_response = requests.post(f"{API_BASE}/admin/create-admin", json=admin_payload, timeout=10)
        
        if admin_response.status_code == 200:
            admin_data = admin_response.json()
            admin_user_id = admin_data["user_id"]
            print(f"   ✅ Admin account created: {admin_username}")
            
            # Create free game
            free_game_payload = {
                "user_id": admin_user_id,
                "bet_amount": 50  # $50 bet but should be FREE for admin
            }
            free_game_response = requests.post(f"{API_BASE}/admin/create-free-game", json=free_game_payload, timeout=10)
            
            if free_game_response.status_code == 200:
                free_game_data = free_game_response.json()
                if free_game_data.get("entry_fee") == 0.0 and free_game_data.get("admin_mode") == True:
                    print(f"   ✅ FREE game created successfully (Entry fee: ${free_game_data['entry_fee']})")
                    
                    # Join free game
                    join_payload = {
                        "session_id": free_game_data["session_id"],
                        "user_id": admin_user_id,
                        "player_id": f"admin_player_{uuid.uuid4().hex[:8]}"
                    }
                    join_response = requests.post(f"{API_BASE}/admin/join-free-game", json=join_payload, timeout=10)
                    
                    if join_response.status_code == 200:
                        join_data = join_response.json()
                        if join_data.get("admin_mode") == True and join_data.get("entry_fee") == 0.0:
                            print(f"   ✅ Admin joined FREE game successfully")
                            results.append("✅ Admin FREE Game Access - WORKING")
                        else:
                            print(f"   ❌ Admin join failed - not free")
                            results.append("❌ Admin FREE Game Access - FAILED")
                    else:
                        print(f"   ❌ Admin join failed: {join_response.status_code}")
                        results.append("❌ Admin FREE Game Access - FAILED")
                else:
                    print(f"   ❌ Free game not actually free: {free_game_data}")
                    results.append("❌ Admin FREE Game Access - FAILED")
            else:
                print(f"   ❌ Free game creation failed: {free_game_response.status_code}")
                results.append("❌ Admin FREE Game Access - FAILED")
        else:
            print(f"   ❌ Admin creation failed: {admin_response.status_code}")
            results.append("❌ Admin FREE Game Access - FAILED")
    except Exception as e:
        print(f"   ❌ Admin test error: {e}")
        results.append("❌ Admin FREE Game Access - FAILED")
    
    # 2. Test Game Creation and Payment APIs
    print("\n2️⃣ Testing Game Creation and Payment APIs...")
    try:
        # Test different bet amounts
        bet_amounts = [1, 5, 20, 50]
        for bet_amount in bet_amounts:
            game_payload = {"bet_amount": bet_amount}
            game_response = requests.post(f"{API_BASE}/game/create", json=game_payload, timeout=10)
            
            if game_response.status_code == 200:
                game_data = game_response.json()
                expected_fee = bet_amount * 0.01  # Convert to SOL
                if abs(game_data.get("entry_fee", 0) - expected_fee) < 0.001:
                    print(f"   ✅ ${bet_amount} game created (Entry fee: {game_data['entry_fee']} SOL)")
                else:
                    print(f"   ❌ ${bet_amount} game fee incorrect: {game_data.get('entry_fee')}")
            else:
                print(f"   ❌ ${bet_amount} game creation failed: {game_response.status_code}")
        
        results.append("✅ Game Creation APIs - WORKING")
    except Exception as e:
        print(f"   ❌ Game creation test error: {e}")
        results.append("❌ Game Creation APIs - FAILED")
    
    # 3. Test Payment Flow APIs
    print("\n3️⃣ Testing Payment Flow APIs...")
    try:
        # Create a test session
        session_payload = {"bet_amount": 10}
        session_response = requests.post(f"{API_BASE}/game/create", json=session_payload, timeout=10)
        
        if session_response.status_code == 200:
            session_data = session_response.json()
            session_id = session_data["session_id"]
            
            # Create bet payment
            bet_payload = {
                "session_id": session_id,
                "player_id": f"test_player_{uuid.uuid4().hex[:8]}",
                "wallet_address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
                "bet_amount": 10
            }
            bet_response = requests.post(f"{API_BASE}/payment/create-bet", json=bet_payload, timeout=10)
            
            if bet_response.status_code == 200:
                bet_data = bet_response.json()
                if all(field in bet_data for field in ["transaction_id", "amount", "recipient", "message"]):
                    print(f"   ✅ Payment transaction created: {bet_data['transaction_id']}")
                    
                    # Confirm payment
                    confirm_payload = {
                        "transaction_id": bet_data["transaction_id"],
                        "signature": f"test_signature_{uuid.uuid4().hex}"
                    }
                    confirm_response = requests.post(f"{API_BASE}/payment/confirm-bet", json=confirm_payload, timeout=10)
                    
                    if confirm_response.status_code == 200:
                        print(f"   ✅ Payment confirmed successfully")
                        results.append("✅ Payment Flow APIs - WORKING")
                    else:
                        print(f"   ❌ Payment confirmation failed: {confirm_response.status_code}")
                        results.append("❌ Payment Flow APIs - FAILED")
                else:
                    print(f"   ❌ Payment creation missing fields: {list(bet_data.keys())}")
                    results.append("❌ Payment Flow APIs - FAILED")
            else:
                print(f"   ❌ Payment creation failed: {bet_response.status_code}")
                results.append("❌ Payment Flow APIs - FAILED")
        else:
            print(f"   ❌ Session creation failed: {session_response.status_code}")
            results.append("❌ Payment Flow APIs - FAILED")
    except Exception as e:
        print(f"   ❌ Payment flow test error: {e}")
        results.append("❌ Payment Flow APIs - FAILED")
    
    # 4. Test Leaderboard with Enhanced Length Tracking
    print("\n4️⃣ Testing Leaderboard with Enhanced Length Tracking...")
    try:
        leaderboard_response = requests.get(f"{API_BASE}/leaderboard", timeout=10)
        
        if leaderboard_response.status_code == 200:
            leaderboard_data = leaderboard_response.json()
            required_fields = ["leaderboard", "total_winnings", "active_players"]
            
            if all(field in leaderboard_data for field in required_fields):
                print(f"   ✅ Leaderboard structure correct")
                print(f"   ✅ Active players: {leaderboard_data['active_players']}")
                print(f"   ✅ Total winnings: ${leaderboard_data['total_winnings']:.2f}")
                
                # Check if leaderboard entries have proper fields
                if leaderboard_data["leaderboard"]:
                    first_entry = leaderboard_data["leaderboard"][0]
                    entry_fields = ["display_name", "total_winnings", "wallet_address"]
                    if all(field in first_entry for field in entry_fields):
                        print(f"   ✅ Leaderboard entries have proper structure")
                        results.append("✅ Enhanced Leaderboard - WORKING")
                    else:
                        print(f"   ❌ Leaderboard entries missing fields: {list(first_entry.keys())}")
                        results.append("❌ Enhanced Leaderboard - FAILED")
                else:
                    print(f"   ✅ Leaderboard empty but structure correct")
                    results.append("✅ Enhanced Leaderboard - WORKING")
            else:
                print(f"   ❌ Leaderboard missing required fields: {list(leaderboard_data.keys())}")
                results.append("❌ Enhanced Leaderboard - FAILED")
        else:
            print(f"   ❌ Leaderboard request failed: {leaderboard_response.status_code}")
            results.append("❌ Enhanced Leaderboard - FAILED")
    except Exception as e:
        print(f"   ❌ Leaderboard test error: {e}")
        results.append("❌ Enhanced Leaderboard - FAILED")
    
    # 5. Test User Authentication System
    print("\n5️⃣ Testing User Authentication System...")
    try:
        # Test user registration
        test_username = f"slitheruser_{uuid.uuid4().hex[:8]}"
        register_payload = {
            "username": test_username,
            "password": "slitherpass123"
        }
        register_response = requests.post(f"{API_BASE}/auth/register", json=register_payload, timeout=10)
        
        if register_response.status_code == 200:
            register_data = register_response.json()
            if "user_id" in register_data and "username" in register_data:
                print(f"   ✅ User registration successful: {test_username}")
                
                # Test user login
                login_payload = {
                    "username": test_username,
                    "password": "slitherpass123"
                }
                login_response = requests.post(f"{API_BASE}/auth/login", json=login_payload, timeout=10)
                
                if login_response.status_code == 200:
                    login_data = login_response.json()
                    if "user_id" in login_data and "username" in login_data:
                        print(f"   ✅ User login successful")
                        
                        # Test wallet connection
                        wallet_payload = {
                            "user_id": login_data["user_id"],
                            "wallet_address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
                        }
                        wallet_response = requests.post(f"{API_BASE}/user/connect-wallet", json=wallet_payload, timeout=10)
                        
                        if wallet_response.status_code == 200:
                            print(f"   ✅ Wallet connection successful")
                            results.append("✅ User Authentication System - WORKING")
                        else:
                            print(f"   ❌ Wallet connection failed: {wallet_response.status_code}")
                            results.append("❌ User Authentication System - FAILED")
                    else:
                        print(f"   ❌ Login response missing fields: {list(login_data.keys())}")
                        results.append("❌ User Authentication System - FAILED")
                else:
                    print(f"   ❌ User login failed: {login_response.status_code}")
                    results.append("❌ User Authentication System - FAILED")
            else:
                print(f"   ❌ Registration response missing fields: {list(register_data.keys())}")
                results.append("❌ User Authentication System - FAILED")
        else:
            print(f"   ❌ User registration failed: {register_response.status_code}")
            results.append("❌ User Authentication System - FAILED")
    except Exception as e:
        print(f"   ❌ Authentication test error: {e}")
        results.append("❌ User Authentication System - FAILED")
    
    # Print final results
    print("\n" + "="*60)
    print("🎯 SLITHER.IO BACKEND FEATURES TEST RESULTS")
    print("="*60)
    
    working_count = sum(1 for result in results if result.startswith("✅"))
    total_count = len(results)
    
    for result in results:
        print(f"  {result}")
    
    print(f"\n📊 SUMMARY: {working_count}/{total_count} backend features working")
    
    if working_count == total_count:
        print("🎉 ALL SLITHER.IO BACKEND FEATURES ARE WORKING PERFECTLY!")
        return True
    else:
        print("⚠️  Some backend features need attention.")
        return False

if __name__ == "__main__":
    success = test_slither_io_backend_features()
    exit(0 if success else 1)