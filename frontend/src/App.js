import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

// Mock Solana wallet functions (simplified for demo)
const mockWallet = {
  connected: false,
  publicKey: null,
  connect: async () => {
    // Mock wallet connection
    mockWallet.connected = true;
    mockWallet.publicKey = "MockWallet" + Math.random().toString(36).substr(2, 9);
    return mockWallet.publicKey;
  },
  sendTransaction: async (amount, recipient, message) => {
    // Mock transaction - in real app, this would use actual Solana Web3.js
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network delay
    return "MockSignature" + Math.random().toString(36).substr(2, 20);
  }
};

const Game = () => {
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const gameLoopRef = useRef(null);
  
  const [gameState, setGameState] = useState({
    sessionId: null,
    playerId: null,
    players: {},
    food: [],
    status: 'waiting',
    connected: false
  });
  
  const [walletConnected, setWalletConnected] = useState(false);
  const [gameStatus, setGameStatus] = useState('menu'); // menu, joining, playing, finished
  const [message, setMessage] = useState('');
  const [entryFee, setEntryFee] = useState(0.01);

  // Connect wallet
  const connectWallet = async () => {
    try {
      const publicKey = await mockWallet.connect();
      setWalletConnected(true);
      setMessage(`Wallet connected: ${publicKey}`);
    } catch (error) {
      setMessage('Failed to connect wallet');
    }
  };

  // Create new game session
  const createGame = async () => {
    try {
      const response = await fetch(`${API}/game/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      setGameState(prev => ({ ...prev, sessionId: data.session_id }));
      setEntryFee(data.entry_fee);
      setMessage(`Game created: ${data.session_id}`);
      return data.session_id;
    } catch (error) {
      setMessage('Failed to create game');
    }
  };

  // Join game with payment
  const joinGame = async (sessionId) => {
    if (!walletConnected) {
      setMessage('Please connect wallet first');
      return;
    }

    setGameStatus('joining');
    setMessage('Processing entry fee payment...');

    try {
      const playerId = `player_${Math.random().toString(36).substr(2, 9)}`;
      
      // Step 1: Create payment transaction
      const paymentResponse = await fetch(`${API}/payment/create-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          player_id: playerId,
          wallet_address: mockWallet.publicKey
        })
      });
      
      const paymentData = await paymentResponse.json();
      setMessage('Confirming payment with blockchain...');
      
      // Step 2: Send mock Solana transaction
      const signature = await mockWallet.sendTransaction(
        paymentData.amount,
        paymentData.recipient,
        paymentData.message
      );
      
      // Step 3: Confirm payment
      const confirmResponse = await fetch(`${API}/payment/confirm-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: paymentData.transaction_id,
          signature: signature
        })
      });
      
      await confirmResponse.json();
      
      // Step 4: Connect to WebSocket
      connectToGame(sessionId, playerId);
      setGameState(prev => ({ ...prev, sessionId, playerId }));
      setMessage('Payment successful! Joining game...');
      
    } catch (error) {
      setMessage('Failed to join game: ' + error.message);
      setGameStatus('menu');
    }
  };

  // Connect to game WebSocket
  const connectToGame = (sessionId, playerId) => {
    const wsUrl = `${WS_URL}/ws/${sessionId}/${playerId}`;
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      setGameState(prev => ({ ...prev, connected: true }));
      setGameStatus('playing');
      setMessage('Connected to game!');
    };
    
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'game_started') {
        setGameState(prev => ({
          ...prev,
          players: data.players,
          food: data.food,
          status: 'active'
        }));
        setMessage('Game started!');
        startGameLoop();
      } else if (data.type === 'game_state') {
        setGameState(prev => ({
          ...prev,
          players: data.players,
          food: data.food,
          status: data.status
        }));
      } else if (data.type === 'game_ended') {
        setGameState(prev => ({ ...prev, status: 'finished' }));
        setGameStatus('finished');
        setMessage(data.winner ? `Game ended! Winner: ${data.winner}` : 'Game ended in a draw!');
        stopGameLoop();
      }
    };
    
    wsRef.current.onclose = () => {
      setGameState(prev => ({ ...prev, connected: false }));
      setMessage('Disconnected from game');
    };
  };

  // Start game loop
  const startGameLoop = () => {
    gameLoopRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'update' }));
      }
    }, 50); // 20 FPS
  };

  // Stop game loop
  const stopGameLoop = () => {
    if (gameLoopRef.current) {
      clearInterval(gameLoopRef.current);
      gameLoopRef.current = null;
    }
  };

  // Handle keyboard input
  const handleKeyPress = useCallback((event) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      let direction = null;
      
      switch(event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          direction = 'up';
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          direction = 'down';
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          direction = 'left';
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          direction = 'right';
          break;
        default:
          return;
      }
      
      if (direction) {
        event.preventDefault();
        wsRef.current.send(JSON.stringify({
          type: 'move',
          direction: direction
        }));
      }
    }
  }, []);

  // Set up keyboard listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw food
    ctx.fillStyle = '#ffff00';
    gameState.food.forEach(food => {
      ctx.beginPath();
      ctx.arc(food.x, food.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Draw players
    Object.values(gameState.players).forEach(player => {
      if (player.alive) {
        ctx.fillStyle = player.color;
        player.segments.forEach((segment, index) => {
          ctx.beginPath();
          const radius = index === 0 ? 12 : 8; // Head is bigger
          ctx.arc(segment.x, segment.y, radius, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    });
    
  }, [gameState.players, gameState.food]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopGameLoop();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="game-container">
      <div className="header">
        <h1>🐍 Crypto Slither</h1>
        <p>Solana-powered multiplayer snake game</p>
      </div>
      
      <div className="status-bar">
        <p>{message}</p>
        {walletConnected && <p>💳 Wallet Connected: {mockWallet.publicKey}</p>}
        {gameState.sessionId && <p>🎮 Session: {gameState.sessionId}</p>}
      </div>
      
      {gameStatus === 'menu' && (
        <div className="menu">
          {!walletConnected ? (
            <button className="btn btn-primary" onClick={connectWallet}>
              Connect Solana Wallet
            </button>
          ) : (
            <div className="menu-options">
              <button 
                className="btn btn-success" 
                onClick={async () => {
                  const sessionId = await createGame();
                  if (sessionId) joinGame(sessionId);
                }}
              >
                Create New Game ({entryFee} SOL)
              </button>
              <div className="join-section">
                <input 
                  type="text" 
                  placeholder="Enter Game Session ID"
                  id="sessionInput"
                  className="session-input"
                />
                <button 
                  className="btn btn-secondary" 
                  onClick={() => {
                    const sessionId = document.getElementById('sessionInput').value;
                    if (sessionId) joinGame(sessionId);
                  }}
                >
                  Join Game ({entryFee} SOL)
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {gameStatus === 'joining' && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Processing payment and joining game...</p>
        </div>
      )}
      
      {gameStatus === 'playing' && (
        <div className="game-area">
          <div className="game-info">
            <p>Players: {Object.keys(gameState.players).length}</p>
            <p>Use WASD or Arrow Keys to move</p>
            <p>Status: {gameState.status}</p>
          </div>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="game-canvas"
          />
        </div>
      )}
      
      {gameStatus === 'finished' && (
        <div className="game-end">
          <h2>Game Finished!</h2>
          <p>{message}</p>
          <button 
            className="btn btn-primary" 
            onClick={() => {
              setGameStatus('menu');
              setGameState({
                sessionId: null,
                playerId: null,
                players: {},
                food: [],
                status: 'waiting',
                connected: false
              });
            }}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <Game />
    </div>
  );
}

export default App;