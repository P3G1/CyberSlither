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

# Enhanced Game Models
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

@api_router.post("/user/account")
async def create_or_get_user_account(data: dict = Body(...)):
    """Create or retrieve user account"""
    wallet_address = data.get("wallet_address")
    if not wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address required")
    
    # Check if account exists
    existing_account = await db.user_accounts.find_one({"wallet_address": wallet_address})
    
    if existing_account:
        # Update last active
        await db.user_accounts.update_one(
            {"wallet_address": wallet_address},
            {"$set": {"last_active": datetime.utcnow()}}
        )
        return existing_account
    
    # Create new account
    new_account = UserAccount(
        wallet_address=wallet_address,
        display_name=f"Player_{wallet_address[:8]}"
    )
    
    await db.user_accounts.insert_one(new_account.dict())
    return new_account.dict()

@api_router.post("/game/create")
async def create_game_session():
    """Create a new enhanced game session"""
    session = GameSession()
    session.food = generate_food(session.session_id, 100)
    game_sessions[session.session_id] = session
    websocket_connections[session.session_id] = {}
    
    # Save to database
    await db.game_sessions.insert_one(session.dict())
    
    return {
        "session_id": session.session_id,
        "entry_fee": session.entry_fee,
        "status": session.status,
        "max_players": session.max_players
    }

@api_router.get("/game/{session_id}")
async def get_game_session(session_id: str):
    """Get game session details"""
    if session_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    
    session = game_sessions[session_id]
    return {
        "session_id": session.session_id,
        "players": len(session.players),
        "status": session.status,
        "prize_pool": session.prize_pool,
        "entry_fee": session.entry_fee,
        "max_players": session.max_players
    }

@api_router.post("/payment/create-entry")
async def create_entry_payment(data: dict = Body(...)):
    """Create entry fee payment transaction"""
    session_id = data.get("session_id")
    player_id = data.get("player_id") 
    wallet_address = data.get("wallet_address")
    
    if session_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    
    session = game_sessions[session_id]
    if session.status != "waiting":
        raise HTTPException(status_code=400, detail="Game already started")
    
    if len(session.players) >= session.max_players:
        raise HTTPException(status_code=400, detail="Game is full")
    
    # Create payment transaction record
    transaction = PaymentTransaction(
        session_id=session_id,
        player_id=player_id,
        wallet_address=wallet_address,
        amount=session.entry_fee,
        transaction_type="entry_fee"
    )
    
    # Save transaction to database
    await db.payment_transactions.insert_one(transaction.dict())
    
    return {
        "transaction_id": transaction.transaction_id,
        "amount": transaction.amount,
        "recipient": "11111111111111111111111111111112",  # System program for demo
        "message": f"Entry fee for Crypto Slither game {session_id[:8]}"
    }

@api_router.post("/payment/confirm-entry")
async def confirm_entry_payment(data: dict = Body(...)):
    """Confirm entry fee payment and add player to game"""
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
        
        # Create new player with random spawn
        colors = ["#ff3333", "#33ff33", "#3333ff", "#ffff33", "#ff33ff", "#33ffff", "#ff8833", "#8833ff", "#33ff88"]
        player_color = random.choice(colors)
        
        # Random spawn position away from center
        angle = random.random() * 2 * math.pi
        distance = random.randint(100, 200)
        spawn_x = 400 + math.cos(angle) * distance
        spawn_y = 300 + math.sin(angle) * distance
        
        # Initial segments for snake body
        initial_segments = []
        for i in range(10):  # Start with 10 segments
            initial_segments.append({
                "x": spawn_x - (i * 8 * math.cos(angle)),
                "y": spawn_y - (i * 8 * math.sin(angle))
            })
        
        player_data = {
            "player_id": player_id,
            "wallet_address": wallet_address,
            "x": spawn_x,
            "y": spawn_y,
            "segments": initial_segments,
            "direction": {"x": math.cos(angle), "y": math.sin(angle), "angle": angle},
            "speed": 3.0,
            "score": 10,
            "alive": True,
            "color": player_color,
            "length": 10
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
        
        # Start game if we have enough players
        if len(session.players) >= 2 and session.status == "waiting":
            session.status = "active"
            await broadcast_to_session(session_id, {
                "type": "game_started",
                "players": session.players,
                "food": session.food,
                "prize_pool": session.prize_pool
            })
    
    return {"status": "success", "message": "Player added to game"}

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