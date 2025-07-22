#!/usr/bin/env python3
"""
Solana Wallet Integration Compatibility Test Suite
Tests backend API compatibility with new Solana wallet integration frontend
"""

import requests
import json
import uuid
import time
from datetime import datetime

# Test Configuration
BACKEND_URL = "https://e6c5f9ea-47fe-4b4f-884e-7a3c8906a379.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

class SolanaWalletIntegrationTester:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []
        self.test_user_id = None
        self.test_session_id = None
        self.test_transaction_id = None
        
        # Realistic test data for Cyberpunk Slither Arena
        self.test_username = f"cyberslither_{uuid.uuid4().hex[:8]}"
        self.test_password = "neurallink2025"
        self.test_wallet = "3FTmCxdfcNNSPiEd253ecEn2xTLqcBZNbacMcHMdrbkC"  # House wallet from context
        self.test_player_wallet = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"  # Player wallet
    
    def log_result(self, test_name: str, passed: bool, details: str = ""):
        if passed:
            self.passed += 1
            print(f"✅ {test_name}")
        else:
            self.failed += 1
            print(f"❌ {test_name}")
            self.errors.append(f"{test_name}: {details}")
        
        if details:
            print(f"   Details: {details}")
    
    def test_basic_health_check(self):
        """Test GET /api/ endpoint"""
        print("\n🏥 Testing Basic Health Check...")
        
        try:
            response = requests.get(f"{API_BASE}/", timeout=10)
            success = response.status_code == 200 and "Crypto Slither Game API" in response.text
            self.log_result(
                "GET /api/ - Basic health check", 
                success,
                f"Status: {response.status_code}, Response contains API identifier"
            )
        except Exception as e:
            self.log_result("GET /api/ - Basic health check", False, str(e))
    
    def test_authentication_endpoints(self):
        """Test authentication endpoints that frontend uses"""
        print("\n🔐 Testing Authentication Endpoints...")
        
        # Test 1: User Registration
        try:
            payload = {
                "username": self.test_username,
                "password": self.test_password,
                "quick_setup": True  # Frontend uses quick setup
            }
            response = requests.post(f"{API_BASE}/auth/register", json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["user_id", "username", "message"]
                has_all_fields = all(field in data for field in required_fields)
                if has_all_fields:
                    self.test_user_id = data["user_id"]
                    self.log_result(
                        "POST /api/auth/register - User registration", 
                        True,
                        f"User created: {data['username']}, ID: {self.test_user_id}"
                    )
                else:
                    self.log_result(
                        "POST /api/auth/register - User registration", 
                        False,
                        f"Missing required fields. Got: {list(data.keys())}"
                    )
            else:
                self.log_result(
                    "POST /api/auth/register - User registration", 
                    False,
                    f"Status: {response.status_code}, Response: {response.text}"
                )
        except Exception as e:
            self.log_result("POST /api/auth/register - User registration", False, str(e))
        
        # Test 2: User Login
        try:
            payload = {
                "username": self.test_username,
                "password": self.test_password
            }
            response = requests.post(f"{API_BASE}/auth/login", json=payload, timeout=10)
            
            success = response.status_code == 200
            if success:
                data = response.json()
                required_fields = ["user_id", "username", "message"]
                success = all(field in data for field in required_fields)
                details = f"Login successful for {data.get('username')}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text}"
            
            self.log_result(
                "POST /api/auth/login - User login", 
                success,
                details
            )
        except Exception as e:
            self.log_result("POST /api/auth/login - User login", False, str(e))
    
    def test_wallet_connection(self):
        """Test wallet connection endpoint"""
        print("\n💳 Testing User Wallet Connection...")
        
        if not self.test_user_id:
            self.log_result("Wallet Connection Tests", False, "No user ID available")
            return
        
        try:
            payload = {
                "user_id": self.test_user_id,
                "wallet_address": self.test_player_wallet
            }
            response = requests.post(f"{API_BASE}/user/connect-wallet", json=payload, timeout=10)
            
            success = response.status_code == 200
            if success:
                data = response.json()
                required_fields = ["user_id", "wallet_address"]
                success = all(field in data for field in required_fields)
                details = f"Wallet connected: {data.get('wallet_address')}"
            else:
                details = f"Status: {response.status_code}, Response: {response.text}"
            
            self.log_result(
                "POST /api/user/connect-wallet - Connect wallet", 
                success,
                details
            )
        except Exception as e:
            self.log_result("POST /api/user/connect-wallet - Connect wallet", False, str(e))
    
    def test_game_creation(self):
        """Test game creation endpoint"""
        print("\n🎮 Testing Game Creation...")
        
        # Test different bet amounts that frontend supports
        bet_amounts = [1, 5, 20, 50]  # $1, $5, $20, $50 as mentioned in context
        
        for bet_amount in bet_amounts:
            try:
                payload = {"bet_amount": bet_amount}
                response = requests.post(f"{API_BASE}/game/create", json=payload, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    required_fields = ["session_id", "entry_fee", "status", "max_players"]
                    has_all_fields = all(field in data for field in required_fields)
                    if has_all_fields and not self.test_session_id:
                        self.test_session_id = data["session_id"]  # Save first session for later tests
                    
                    self.log_result(
                        f"POST /api/game/create - Create game (${bet_amount} bet)", 
                        has_all_fields,
                        f"Session: {data.get('session_id', 'N/A')}, Entry fee: {data.get('entry_fee', 'N/A')} SOL"
                    )
                else:
                    self.log_result(
                        f"POST /api/game/create - Create game (${bet_amount} bet)", 
                        False,
                        f"Status: {response.status_code}, Response: {response.text}"
                    )
            except Exception as e:
                self.log_result(f"POST /api/game/create - Create game (${bet_amount} bet)", False, str(e))
    
    def test_payment_flow_compatibility(self):
        """Test payment flow compatibility with Solana transactions"""
        print("\n💰 Testing Payment Flow Compatibility...")
        
        if not self.test_session_id:
            self.log_result("Payment Flow Tests", False, "No session ID available")
            return
        
        # Test 1: Create bet payment (simulating frontend Solana transaction creation)
        try:
            payload = {
                "session_id": self.test_session_id,
                "player_id": str(uuid.uuid4()),
                "wallet_address": self.test_player_wallet,
                "bet_amount": 5  # $5 bet
            }
            response = requests.post(f"{API_BASE}/payment/create-bet", json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["transaction_id", "amount", "recipient", "message"]
                has_all_fields = all(field in data for field in required_fields)
                
                # Verify house wallet address matches
                correct_recipient = data.get("recipient") == "3FTmCxdfcNNSPiEd253ecEn2xTLqcBZNbacMcHMdrbkC"
                
                if has_all_fields and correct_recipient:
                    self.test_transaction_id = data["transaction_id"]
                    self.log_result(
                        "POST /api/payment/create-bet - Create bet payment", 
                        True,
                        f"Transaction: {self.test_transaction_id}, Amount: {data['amount']} SOL, Recipient: {data['recipient']}"
                    )
                else:
                    self.log_result(
                        "POST /api/payment/create-bet - Create bet payment", 
                        False,
                        f"Missing fields or incorrect recipient. Fields: {list(data.keys())}, Recipient: {data.get('recipient')}"
                    )
            else:
                self.log_result(
                    "POST /api/payment/create-bet - Create bet payment", 
                    False,
                    f"Status: {response.status_code}, Response: {response.text}"
                )
        except Exception as e:
            self.log_result("POST /api/payment/create-bet - Create bet payment", False, str(e))
        
        # Test 2: Confirm bet payment (simulating Solana transaction confirmation)
        if self.test_transaction_id:
            try:
                # Simulate a real Solana transaction signature
                fake_signature = f"5{uuid.uuid4().hex}3{uuid.uuid4().hex}7{uuid.uuid4().hex}"
                payload = {
                    "transaction_id": self.test_transaction_id,
                    "signature": fake_signature
                }
                response = requests.post(f"{API_BASE}/payment/confirm-bet", json=payload, timeout=10)
                
                success = response.status_code == 200
                if success:
                    data = response.json()
                    success = data.get("status") == "success"
                    details = f"Payment confirmed with signature: {fake_signature[:20]}..."
                else:
                    details = f"Status: {response.status_code}, Response: {response.text}"
                
                self.log_result(
                    "POST /api/payment/confirm-bet - Confirm bet payment", 
                    success,
                    details
                )
            except Exception as e:
                self.log_result("POST /api/payment/confirm-bet - Confirm bet payment", False, str(e))
        else:
            self.log_result("POST /api/payment/confirm-bet - Confirm bet payment", False, "No transaction ID available")
    
    def test_leaderboard_api(self):
        """Test leaderboard API endpoint"""
        print("\n🏆 Testing Leaderboard API...")
        
        try:
            response = requests.get(f"{API_BASE}/leaderboard", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["leaderboard", "total_winnings", "active_players"]
                has_all_fields = all(field in data for field in required_fields)
                
                # Verify leaderboard structure
                leaderboard_valid = isinstance(data.get("leaderboard"), list)
                
                self.log_result(
                    "GET /api/leaderboard - Get leaderboard", 
                    has_all_fields and leaderboard_valid,
                    f"Active players: {data.get('active_players')}, Total winnings: {data.get('total_winnings')} SOL"
                )
            else:
                self.log_result(
                    "GET /api/leaderboard - Get leaderboard", 
                    False,
                    f"Status: {response.status_code}, Response: {response.text}"
                )
        except Exception as e:
            self.log_result("GET /api/leaderboard - Get leaderboard", False, str(e))
    
    def test_solana_integration_compatibility(self):
        """Test specific Solana integration compatibility"""
        print("\n🔗 Testing Solana Integration Compatibility...")
        
        # Test 1: Verify house wallet configuration
        try:
            payload = {
                "session_id": str(uuid.uuid4()),
                "player_id": str(uuid.uuid4()),
                "wallet_address": self.test_player_wallet,
                "bet_amount": 1
            }
            response = requests.post(f"{API_BASE}/payment/create-bet", json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                house_wallet_correct = data.get("recipient") == "3FTmCxdfcNNSPiEd253ecEn2xTLqcBZNbacMcHMdrbkC"
                self.log_result(
                    "Solana Integration - House wallet configuration", 
                    house_wallet_correct,
                    f"House wallet: {data.get('recipient')}"
                )
            else:
                self.log_result(
                    "Solana Integration - House wallet configuration", 
                    False,
                    f"Could not verify house wallet: {response.status_code}"
                )
        except Exception as e:
            self.log_result("Solana Integration - House wallet configuration", False, str(e))
        
        # Test 2: Verify transaction message format
        try:
            payload = {
                "session_id": str(uuid.uuid4()),
                "player_id": str(uuid.uuid4()),
                "wallet_address": self.test_player_wallet,
                "bet_amount": 20
            }
            response = requests.post(f"{API_BASE}/payment/create-bet", json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                message = data.get("message", "")
                message_valid = "Cyber Slither Arena" in message and "$20" in message
                self.log_result(
                    "Solana Integration - Transaction message format", 
                    message_valid,
                    f"Message: {message}"
                )
            else:
                self.log_result(
                    "Solana Integration - Transaction message format", 
                    False,
                    f"Could not verify message format: {response.status_code}"
                )
        except Exception as e:
            self.log_result("Solana Integration - Transaction message format", False, str(e))
    
    def run_all_tests(self):
        """Run all Solana wallet integration compatibility tests"""
        print("🚀 Starting Solana Wallet Integration Compatibility Tests")
        print("🎯 Focus: Backend API compatibility with new Solana wallet frontend")
        print(f"Testing against: {BACKEND_URL}")
        print("="*70)
        
        self.test_basic_health_check()
        self.test_authentication_endpoints()
        self.test_wallet_connection()
        self.test_game_creation()
        self.test_payment_flow_compatibility()
        self.test_leaderboard_api()
        self.test_solana_integration_compatibility()
        
        # Print summary
        total = self.passed + self.failed
        print(f"\n{'='*70}")
        print(f"SOLANA WALLET INTEGRATION TEST SUMMARY: {self.passed}/{total} tests passed")
        print(f"{'='*70}")
        
        if self.errors:
            print("\nFAILED TESTS:")
            for error in self.errors:
                print(f"  - {error}")
        
        if self.failed == 0:
            print("\n🎉 All Solana wallet integration tests passed!")
            print("✅ Backend APIs are fully compatible with new frontend wallet integration")
        else:
            print(f"\n⚠️  {self.failed} test(s) failed. Backend may need adjustments for Solana integration.")
        
        return self.failed == 0

def main():
    """Main test runner"""
    tester = SolanaWalletIntegrationTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    exit(main())