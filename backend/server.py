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

# Game Models
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

class Player(BaseModel):
    player_id: str
    wallet_address: str
    x: float = 400.0
    y: float = 300.0
    segments: List[dict] = Field(default_factory=lambda: [{"x": 400, "y": 300}])
    direction: str = "right"
    score: int = 1
    alive: bool = True
    color: str = "#00ff00"

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

def generate_food(session_id: str, count: int = 50):
    """Generate random food items for the game"""
    food_items = []
    for _ in range(count):
        food_items.append({
            "x": random.randint(20, 780),
            "y": random.randint(20, 580),
            "id": str(uuid.uuid4())
        })
    return food_items

def check_collision(snake_segments: List[dict], other_segments: List[dict]) -> bool:
    """Check if snake head collides with another snake"""
    head = snake_segments[0]
    for segment in other_segments:
        distance = math.sqrt((head["x"] - segment["x"]) ** 2 + (head["y"] - segment["y"]) ** 2)
        if distance < 15:  # Snake segment radius
            return True
    return False

def check_food_collision(snake_head: dict, food_items: List[dict]) -> Optional[str]:
    """Check if snake head collides with food"""
    for food in food_items:
        distance = math.sqrt((snake_head["x"] - food["x"]) ** 2 + (snake_head["y"] - food["y"]) ** 2)
        if distance < 20:
            return food["id"]
    return None

def move_snake(player: dict) -> dict:
    """Move snake based on direction"""
    head = player["segments"][0].copy()
    speed = 3
    
    if player["direction"] == "up":
        head["y"] -= speed
    elif player["direction"] == "down":
        head["y"] += speed
    elif player["direction"] == "left":
        head["x"] -= speed
    elif player["direction"] == "right":
        head["x"] += speed
    
    # Add new head
    player["segments"].insert(0, head)
    
    # Keep snake length based on score
    while len(player["segments"]) > player["score"]:
        player["segments"].pop()
    
    # Check boundaries
    if head["x"] < 0 or head["x"] > 800 or head["y"] < 0 or head["y"] > 600:
        player["alive"] = False
    
    return player

async def broadcast_to_session(session_id: str, message: dict):
    """Broadcast message to all players in a session"""
    if session_id in websocket_connections:
        for websocket in websocket_connections[session_id].values():
            try:
                await websocket.send_json(message)
            except:
                pass

# API Routes
@api_router.get("/")
async def root():
    return {"message": "Crypto Slither Game API"}

@api_router.post("/game/create")
async def create_game_session():
    """Create a new game session"""
    session = GameSession()
    session.food = generate_food(session.session_id)
    game_sessions[session.session_id] = session
    websocket_connections[session.session_id] = {}
    
    # Save to database
    await db.game_sessions.insert_one(session.dict())
    
    return {
        "session_id": session.session_id,
        "entry_fee": session.entry_fee,
        "status": session.status
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
        "entry_fee": session.entry_fee
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
        "recipient": "Game_Vault_Address",  # This would be your game's Solana wallet
        "message": f"Entry fee for game {session_id}"
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
        
        # Create new player
        colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff", "#ffa500"]
        player_color = random.choice(colors)
        
        # Random spawn position
        spawn_x = random.randint(100, 700)
        spawn_y = random.randint(100, 500)
        
        player_data = {
            "player_id": player_id,
            "wallet_address": wallet_address,
            "x": spawn_x,
            "y": spawn_y,
            "segments": [{"x": spawn_x, "y": spawn_y}],
            "direction": "right",
            "score": 1,
            "alive": True,
            "color": player_color
        }
        
        session.players[player_id] = player_data
        session.prize_pool += session.entry_fee * (1 - session.house_fee_percent)
        
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
                "food": session.food
            })
    
    return {"status": "success", "message": "Player added to game"}

@api_router.post("/payment/payout-winner")
async def payout_winner(data: dict = Body(...)):
    """Process payout to game winner"""
    session_id = data.get("session_id")
    winner_id = data.get("winner_id")
    
    if session_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    
    session = game_sessions[session_id]
    if session.status != "finished" or not session.winner:
        raise HTTPException(status_code=400, detail="Game not finished or no winner")
    
    winner = session.players.get(session.winner)
    if not winner:
        raise HTTPException(status_code=404, detail="Winner not found")
    
    # Create payout transaction
    payout_transaction = PaymentTransaction(
        session_id=session_id,
        player_id=winner_id,
        wallet_address=winner["wallet_address"],
        amount=session.prize_pool,
        transaction_type="payout"
    )
    
    await db.payment_transactions.insert_one(payout_transaction.dict())
    
    return {
        "transaction_id": payout_transaction.transaction_id,
        "amount": payout_transaction.amount,
        "recipient": winner["wallet_address"],
        "message": f"Prize payout for winning game {session_id}"
    }

# WebSocket connection for real-time gameplay
@app.websocket("/ws/{session_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, player_id: str):
    await websocket.accept()
    
    # Add connection to tracking
    if session_id not in websocket_connections:
        websocket_connections[session_id] = {}
    websocket_connections[session_id][player_id] = websocket
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if session_id in game_sessions:
                session = game_sessions[session_id]
                
                # Handle player movement
                if data["type"] == "move" and player_id in session.players:
                    player = session.players[player_id]
                    if player["alive"]:
                        # Update direction
                        new_direction = data["direction"]
                        # Prevent reversing direction
                        opposite_directions = {
                            "up": "down", "down": "up", 
                            "left": "right", "right": "left"
                        }
                        if new_direction != opposite_directions.get(player["direction"]):
                            player["direction"] = new_direction
                
                # Game loop update
                if data["type"] == "update" and session.status == "active":
                    alive_players = []
                    
                    # Update all players
                    for pid, player in session.players.items():
                        if player["alive"]:
                            # Move snake
                            player = move_snake(player)
                            
                            # Check food collision
                            food_id = check_food_collision(player["segments"][0], session.food)
                            if food_id:
                                player["score"] += 1
                                # Remove eaten food and add new one
                                session.food = [f for f in session.food if f["id"] != food_id]
                                session.food.append({
                                    "x": random.randint(20, 780),
                                    "y": random.randint(20, 580),
                                    "id": str(uuid.uuid4())
                                })
                            
                            # Check collision with other players
                            for other_pid, other_player in session.players.items():
                                if pid != other_pid and other_player["alive"]:
                                    if check_collision(player["segments"], other_player["segments"]):
                                        player["alive"] = False
                            
                            # Check self collision
                            if len(player["segments"]) > 4:
                                if check_collision([player["segments"][0]], player["segments"][4:]):
                                    player["alive"] = False
                            
                            session.players[pid] = player
                            if player["alive"]:
                                alive_players.append(pid)
                    
                    # Check win condition
                    if len(alive_players) <= 1 and len(session.players) > 1:
                        session.status = "finished"
                        if alive_players:
                            session.winner = alive_players[0]
                        
                        await broadcast_to_session(session_id, {
                            "type": "game_ended",
                            "winner": session.winner,
                            "prize_pool": session.prize_pool
                        })
                    else:
                        # Broadcast game state
                        await broadcast_to_session(session_id, {
                            "type": "game_state",
                            "players": session.players,
                            "food": session.food,
                            "status": session.status
                        })
    
    except WebSocketDisconnect:
        # Remove connection
        if session_id in websocket_connections and player_id in websocket_connections[session_id]:
            del websocket_connections[session_id][player_id]

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