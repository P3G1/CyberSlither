from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import uuid
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from datetime import datetime
import random
import math
import hashlib

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Helper functions
def hash_password(password: str) -> str:
    """Hash password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hash: str) -> bool:
    """Verify password against hash"""
    return hash_password(password) == hash

# Enhanced Game Models
class UserAuth(BaseModel):
    user_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    password_hash: str
    wallet_address: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

class UserAccount(BaseModel):
    user_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    wallet_address: str
    display_name: Optional[str] = None
    games_played: int = 0
    games_won: int = 0
    total_winnings: float = 0.0
    total_spent: float = 0.0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_active: datetime = Field(default_factory=datetime.utcnow)

class GameSession(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    players: Dict[str, dict] = Field(default_factory=dict)
    entry_fee: float = 0.01  # 0.01 SOL
    prize_pool: float = 0.0
    house_fee_percent: float = 0.20
    status: str = "waiting"  # waiting, active, finished
    winner: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    food: List[dict] = Field(default_factory=list)
    game_radius: float = 1000.0
    max_players: int = 10

class Player(BaseModel):
    player_id: str
    wallet_address: str
    x: float = 400.0
    y: float = 300.0
    segments: List[dict] = Field(default_factory=lambda: [{"x": 400, "y": 300}])
    direction: dict = Field(default_factory=lambda: {"x": 1, "y": 0, "angle": 0})
    speed: float = 3.0
    score: int = 10
    alive: bool = True
    color: str = "#00ff00"
    length: int = 10

class PaymentTransaction(BaseModel):
    transaction_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    player_id: str
    wallet_address: str
    amount: float
    transaction_type: str  # "entry_fee", "payout"
    solana_signature: Optional[str] = None
    status: str = "pending"  # pending, completed, failed
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Game State Management
game_sessions: Dict[str, GameSession] = {}
websocket_connections: Dict[str, Dict[str, WebSocket]] = {}

def generate_food(session_id: str, count: int = 100):
    """Generate random food items with better distribution"""
    food_items = []
    for _ in range(count):
        angle = random.random() * 2 * math.pi
        distance = random.random() * 350  # Within radius
        center_x, center_y = 400, 300
        
        food_items.append({
            "x": center_x + math.cos(angle) * distance,
            "y": center_y + math.sin(angle) * distance,
            "id": str(uuid.uuid4()),
            "size": random.randint(4, 8),
            "color": random.choice(["#ffff00", "#ff8800", "#ff0088", "#88ff00", "#0088ff"])
        })
    return food_items

def check_collision(segments1: List[dict], segments2: List[dict], min_distance: float = 15) -> bool:
    """Enhanced collision detection"""
    if not segments1 or not segments2:
        return False
        
    head = segments1[0]
    for segment in segments2:
        distance = math.sqrt((head["x"] - segment["x"]) ** 2 + (head["y"] - segment["y"]) ** 2)
        if distance < min_distance:
            return True
    return False

def check_food_collision(snake_head: dict, food_items: List[dict]) -> Optional[str]:
    """Check collision with food"""
    for food in food_items:
        distance = math.sqrt((snake_head["x"] - food["x"]) ** 2 + (snake_head["y"] - food["y"]) ** 2)
        if distance < (food.get("size", 6) + 10):
            return food["id"]
    return None

def move_snake(player: dict, game_bounds: dict = {"width": 800, "height": 600}) -> dict:
    """Enhanced snake movement with smooth physics"""
    if not player.get("alive", False) or not player.get("segments"):
        return player
    
    head = player["segments"][0].copy()
    direction = player.get("direction", {"x": 1, "y": 0, "angle": 0})
    speed = player.get("speed", 3.0)
    
    # Update position based on direction
    head["x"] += direction["x"] * speed
    head["y"] += direction["y"] * speed
    
    # Check boundaries (wrap around or bounce)
    if head["x"] < 0:
        head["x"] = game_bounds["width"]
    elif head["x"] > game_bounds["width"]:
        head["x"] = 0
        
    if head["y"] < 0:
        head["y"] = game_bounds["height"]
    elif head["y"] > game_bounds["height"]:
        head["y"] = 0
    
    # Add new head
    player["segments"].insert(0, head)
    
    # Maintain snake length based on score
    target_length = max(player.get("score", 10), 10)
    while len(player["segments"]) > target_length:
        player["segments"].pop()
    
    return player

def calculate_direction_from_angle(angle: float) -> dict:
    """Convert angle to direction vector"""
    return {
        "x": math.cos(angle),
        "y": math.sin(angle),
        "angle": angle
    }

async def broadcast_to_session(session_id: str, message: dict):
    """Broadcast message to all players in a session"""
    if session_id in websocket_connections:
        disconnected = []
        for player_id, websocket in websocket_connections[session_id].items():
            try:
                await websocket.send_json(message)
            except:
                disconnected.append(player_id)
        
        # Clean up disconnected players
        for player_id in disconnected:
            if player_id in websocket_connections[session_id]:
                del websocket_connections[session_id][player_id]

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Enhanced Crypto Slither Game API v2.0"}

# Authentication endpoints
@api_router.post("/auth/register")
async def register_user(data: dict = Body(...)):
    """Register a new user"""
    username = data.get("username", "").strip()
    password = data.get("password", "")
    quick_setup = data.get("quick_setup", False)
    
    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    
    if not password or len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Check if username already exists
    existing_user = await db.user_auth.find_one({"username": username.lower()})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Create new user
    user_auth = UserAuth(
        username=username.lower(),
        password_hash=hash_password(password)
    )
    
    await db.user_auth.insert_one(user_auth.dict())
    
    # Return user data (without password hash)
    return {
        "user_id": user_auth.user_id,
        "username": username,
        "created_at": user_auth.created_at,
        "message": "Account created successfully"
    }

@api_router.post("/auth/login") 
async def login_user(data: dict = Body(...)):
    """Login user"""
    username = data.get("username", "").strip().lower()
    password = data.get("password", "")
    
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password required")
    
    # Find user
    user = await db.user_auth.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Verify password
    if not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Update last login
    await db.user_auth.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    return {
        "user_id": user["user_id"],
        "username": user["username"],
        "last_login": user.get("last_login"),
        "wallet_address": user.get("wallet_address"),
        "message": "Login successful"
    }

@api_router.post("/user/connect-wallet")
async def connect_user_wallet(data: dict = Body(...)):
    """Connect wallet to user account"""
    user_id = data.get("user_id")
    wallet_address = data.get("wallet_address")
    
    if not user_id or not wallet_address:
        raise HTTPException(status_code=400, detail="User ID and wallet address required")
    
    # Update user auth with wallet
    await db.user_auth.update_one(
        {"user_id": user_id},
        {"$set": {"wallet_address": wallet_address}}
    )
    
    # Check if account exists
    existing_account = await db.user_accounts.find_one({"wallet_address": wallet_address})
    
    if existing_account:
        return existing_account
    
    # Create new account
    user = await db.user_auth.find_one({"user_id": user_id})
    new_account = UserAccount(
        user_id=user_id,
        wallet_address=wallet_address,
        display_name=user["username"] if user else "Player"
    )
    
    await db.user_accounts.insert_one(new_account.dict())
    return new_account.dict()

@api_router.post("/game/create")
async def create_game_session(data: dict = Body(...)):
    """Create a new game session with bet amount"""
    bet_amount = data.get("bet_amount", 1)  # Default $1 bet
    
    session = GameSession()
    session.entry_fee = bet_amount * 0.01  # Convert to SOL (assuming $1 = 0.01 SOL for demo)
    session.food = generate_food(session.session_id, 150)  # More food like damnbruh
    game_sessions[session.session_id] = session
    websocket_connections[session.session_id] = {}
    
    # Save to database
    await db.game_sessions.insert_one(session.dict())
    
    return {
        "session_id": session.session_id,
        "entry_fee": session.entry_fee,
        "bet_amount": bet_amount,
        "status": session.status,
        "max_players": session.max_players
    }

@api_router.post("/payment/create-bet")
async def create_bet_payment(data: dict = Body(...)):
    """Create bet payment transaction"""
    session_id = data.get("session_id")
    player_id = data.get("player_id") 
    wallet_address = data.get("wallet_address")
    bet_amount = data.get("bet_amount", 1)
    
    if session_id not in game_sessions:
        # Create session if it doesn't exist
        session = GameSession()
        session.session_id = session_id
        session.entry_fee = bet_amount * 0.01
        session.food = generate_food(session_id, 150)
        game_sessions[session_id] = session
        websocket_connections[session_id] = {}
        await db.game_sessions.insert_one(session.dict())
    
    session = game_sessions[session_id]
    
    if len(session.players) >= session.max_players:
        raise HTTPException(status_code=400, detail="Game is full")
    
    # Create payment transaction record
    transaction = PaymentTransaction(
        session_id=session_id,
        player_id=player_id,
        wallet_address=wallet_address,
        amount=session.entry_fee,
        transaction_type="bet"
    )
    
    # Save transaction to database
    await db.payment_transactions.insert_one(transaction.dict())
    
    return {
        "transaction_id": transaction.transaction_id,
        "amount": session.entry_fee,
        "bet_amount": bet_amount,
        "recipient": "3FTmCxdfcNNSPiEd253ecEn2xTLqcBZNbacMcHMdrbkC",
        "message": f"${bet_amount} bet for Cyber Slither Arena"
    }

@api_router.post("/payment/confirm-bet")
async def confirm_bet_payment(data: dict = Body(...)):
    """Confirm bet payment and add player to game"""
    transaction_id = data.get("transaction_id")
    solana_signature = data.get("signature")
    
    # Update transaction status
    await db.payment_transactions.update_one(
        {"transaction_id": transaction_id},
        {"$set": {"solana_signature": solana_signature, "status": "completed"}}
    )
    
    # Get transaction details
    transaction_doc = await db.payment_transactions.find_one({"transaction_id": transaction_id})
    if not transaction_doc:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    session_id = transaction_doc["session_id"]
    player_id = transaction_doc["player_id"]
    wallet_address = transaction_doc["wallet_address"]
    
    # Add player to game session
    if session_id in game_sessions:
        session = game_sessions[session_id]
        
        # Create new player with enhanced colors like damnbruh
        snake_colors = [
            "#8B5CF6", "#06B6D4", "#F59E0B", "#10B981", 
            "#F43F5E", "#3B82F6", "#8B5A2B", "#EC4899"
        ]
        player_color = random.choice(snake_colors)
        
        # Spawn in different areas of the map
        spawn_areas = [
            {"x": 200, "y": 150}, {"x": 1000, "y": 150}, 
            {"x": 200, "y": 650}, {"x": 1000, "y": 650},
            {"x": 600, "y": 400}
        ]
        spawn_pos = random.choice(spawn_areas)
        
        # Create longer initial snake
        initial_segments = []
        for i in range(15):  # Longer snake like damnbruh
            initial_segments.append({
                "x": spawn_pos["x"] - (i * 10),
                "y": spawn_pos["y"]
            })
        
        player_data = {
            "player_id": player_id,
            "wallet_address": wallet_address,
            "x": spawn_pos["x"],
            "y": spawn_pos["y"],
            "segments": initial_segments,
            "direction": {"x": 1, "y": 0, "angle": 0},
            "speed": 4.0,  # Faster like damnbruh
            "score": 15,   # Start with higher score
            "alive": True,
            "color": player_color,
            "length": 15,
            "bet_amount": transaction_doc["amount"] / 0.01  # Store bet amount
        }
        
        session.players[player_id] = player_data
        session.prize_pool += session.entry_fee * (1 - session.house_fee_percent)
        
        # Update user account
        await db.user_accounts.update_one(
            {"wallet_address": wallet_address},
            {
                "$inc": {"games_played": 1, "total_spent": session.entry_fee},
                "$set": {"last_active": datetime.utcnow()}
            }
        )
        
        # Update database
        await db.game_sessions.update_one(
            {"session_id": session_id},
            {"$set": session.dict()}
        )
        
        # Start game if we have 2+ players
        if len(session.players) >= 2 and session.status == "waiting":
            session.status = "active"
            await broadcast_to_session(session_id, {
                "type": "game_started",
                "players": session.players,
                "food": session.food,
                "prize_pool": session.prize_pool
            })
    
    return {"status": "success", "message": "Player added to game"}

@api_router.get("/leaderboard")
async def get_leaderboard():
    """Get top players leaderboard"""
    top_players = await db.user_accounts.find(
        {},
        {"_id": 0, "display_name": 1, "total_winnings": 1, "wallet_address": 1}
    ).sort("total_winnings", -1).limit(10).to_list(10)
    
    # Calculate total winnings
    total_winnings = await db.user_accounts.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$total_winnings"}}}
    ]).to_list(1)
    
    total = total_winnings[0]["total"] if total_winnings else 0
    
    # Count active players
    active_players = sum(len(session.players) for session in game_sessions.values())
    
    return {
        "leaderboard": top_players,
        "total_winnings": total,
        "active_players": active_players
    }

# Enhanced WebSocket connection for real-time gameplay
@app.websocket("/ws/{session_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, player_id: str):
    await websocket.accept()
    logger.info(f"Player {player_id} connected to game {session_id}")
    
    # Add connection to tracking
    if session_id not in websocket_connections:
        websocket_connections[session_id] = {}
    websocket_connections[session_id][player_id] = websocket
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if session_id in game_sessions:
                session = game_sessions[session_id]
                
                if data["type"] == "move" and player_id in session.players:
                    player = session.players[player_id]
                    if player["alive"]:
                        # Update direction with smoother movement
                        new_direction = data["direction"]
                        direction_map = {
                            "up": {"x": 0, "y": -1, "angle": -math.pi/2},
                            "down": {"x": 0, "y": 1, "angle": math.pi/2},
                            "left": {"x": -1, "y": 0, "angle": math.pi},
                            "right": {"x": 1, "y": 0, "angle": 0}
                        }
                        
                        if new_direction in direction_map:
                            # Prevent immediate reverse direction
                            current_angle = player["direction"]["angle"]
                            new_angle = direction_map[new_direction]["angle"]
                            
                            # Check if it's not a complete reverse
                            angle_diff = abs(current_angle - new_angle)
                            if angle_diff != math.pi:
                                player["direction"] = direction_map[new_direction]
                
                elif data["type"] == "mouse_move" and player_id in session.players:
                    player = session.players[player_id]
                    if player["alive"]:
                        angle = data["angle"]
                        player["direction"] = calculate_direction_from_angle(angle)
                
                # Enhanced game loop update
                elif data["type"] == "update" and session.status == "active":
                    alive_players = []
                    eliminated_players = []
                    
                    # Update all players
                    for pid, player in session.players.items():
                        if player["alive"]:
                            # Move snake
                            player = move_snake(player, {"width": 800, "height": 600})
                            
                            # Check food collision
                            food_id = check_food_collision(player["segments"][0], session.food)
                            if food_id:
                                player["score"] += random.randint(1, 3)
                                player["length"] = player["score"]
                                
                                # Remove eaten food and add new one
                                session.food = [f for f in session.food if f["id"] != food_id]
                                new_food = generate_food(session_id, 1)[0]
                                session.food.append(new_food)
                            
                            # Check collision with other players
                            for other_pid, other_player in session.players.items():
                                if pid != other_pid and other_player["alive"]:
                                    if check_collision(player["segments"], other_player["segments"][1:]):  # Don't collide with head
                                        player["alive"] = False
                                        eliminated_players.append(pid)
                                        break
                            
                            # Check self collision (only if long enough)
                            if player["alive"] and len(player["segments"]) > 10:
                                if check_collision([player["segments"][0]], player["segments"][4:]):
                                    player["alive"] = False
                                    eliminated_players.append(pid)
                            
                            session.players[pid] = player
                            if player["alive"]:
                                alive_players.append(pid)
                    
                    # Notify about eliminations
                    for eliminated_pid in eliminated_players:
                        await broadcast_to_session(session_id, {
                            "type": "player_eliminated",
                            "player_id": eliminated_pid
                        })
                    
                    # Check win condition
                    if len(alive_players) <= 1 and len(session.players) > 1:
                        session.status = "finished"
                        if alive_players:
                            session.winner = alive_players[0]
                            winner_player = session.players[session.winner]
                            
                            # Update winner's account
                            await db.user_accounts.update_one(
                                {"wallet_address": winner_player["wallet_address"]},
                                {
                                    "$inc": {
                                        "games_won": 1,
                                        "total_winnings": session.prize_pool
                                    }
                                }
                            )
                        
                        await broadcast_to_session(session_id, {
                            "type": "game_ended",
                            "winner": session.winner,
                            "prize_pool": session.prize_pool
                        })
                        
                        # Update game session in database
                        await db.game_sessions.update_one(
                            {"session_id": session_id},
                            {"$set": session.dict()}
                        )
                    else:
                        # Broadcast game state
                        await broadcast_to_session(session_id, {
                            "type": "game_state",
                            "players": session.players,
                            "food": session.food,
                            "status": session.status
                        })
    
    except WebSocketDisconnect:
        logger.info(f"Player {player_id} disconnected from game {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error for player {player_id}: {e}")
    finally:
        # Remove connection
        if session_id in websocket_connections and player_id in websocket_connections[session_id]:
            del websocket_connections[session_id][player_id]
        
        # Mark player as disconnected
        if session_id in game_sessions and player_id in game_sessions[session_id].players:
            game_sessions[session_id].players[player_id]["alive"] = False

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()