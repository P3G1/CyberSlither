import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

// Game Constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const FOOD_SIZE = 6;
const SNAKE_SEGMENT_SIZE = 8;
const SNAKE_HEAD_SIZE = 12;

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

// Game Constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const FOOD_SIZE = 6;
const SNAKE_SEGMENT_SIZE = 8;
const SNAKE_HEAD_SIZE = 12;

// Mock wallet for now (we'll replace with real Solana later)
const mockWallet = {
  connected: false,
  publicKey: null,
  connect: async () => {
    // For now, simulate connecting to Phantom wallet
    if (window.solana && window.solana.isPhantom) {
      try {
        const response = await window.solana.connect();
        mockWallet.connected = true;
        mockWallet.publicKey = response.publicKey.toString();
        return response.publicKey;
      } catch (error) {
        throw error;
      }
    } else {
      // Fallback to mock wallet for demo
      mockWallet.connected = true;
      mockWallet.publicKey = "MockWallet" + Math.random().toString(36).substr(2, 9);
      return { toString: () => mockWallet.publicKey };
    }
  },
  sendTransaction: async (transaction) => {
    if (window.solana && window.solana.isPhantom) {
      // Real Phantom wallet transaction
      return await window.solana.signAndSendTransaction(transaction);
    } else {
      // Mock transaction for demo
      await new Promise(resolve => setTimeout(resolve, 2000));
      return "MockSignature" + Math.random().toString(36).substr(2, 20);
    }
  }
};

const Game = () => {
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const animationRef = useRef(null);
  
  const [gameState, setGameState] = useState({
    sessionId: null,
    playerId: null,
    players: {},
    food: [],
    status: 'waiting',
    connected: false,
    myDirection: 0
  });
  
  const [userAccount, setUserAccount] = useState(null);
  const [walletConnected, setWalletConnected] = useState(false);
  const [gameStatus, setGameStatus] = useState('menu'); // menu, joining, playing, finished
  const [message, setMessage] = useState('Connect your Solana wallet to play!');
  const [entryFee, setEntryFee] = useState(0.01);
  const [loading, setLoading] = useState(false);

  // Connect wallet function
  const connectWallet = async () => {
    try {
      setLoading(true);
      const publicKey = await mockWallet.connect();
      setWalletConnected(true);
      
      // Create or get user account
      const response = await fetch(`${API}/user/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: publicKey.toString()
        })
      });
      
      const accountData = await response.json();
      setUserAccount(accountData);
      setMessage(`Welcome ${accountData.display_name || 'Player'}! Ready to play.`);
      
    } catch (error) {
      setMessage('Failed to connect wallet: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Create new game session
  const createGame = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/game/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      setGameState(prev => ({ ...prev, sessionId: data.session_id }));
      setEntryFee(data.entry_fee);
      setMessage(`Game created: ${data.session_id.substring(0, 8)}...`);
      return data.session_id;
    } catch (error) {
      setMessage('Failed to create game: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Join game with payment
  const joinGame = async (sessionId) => {
    if (!walletConnected) {
      setMessage('Please connect your Solana wallet first');
      return;
    }

    setGameStatus('joining');
    setLoading(true);
    setMessage('Processing entry fee payment...');

    try {
      const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
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
      
      if (!paymentResponse.ok) {
        throw new Error('Failed to create payment transaction');
      }
      
      const paymentData = await paymentResponse.json();
      setMessage('Confirm payment in your wallet...');
      
      // Step 2: Send transaction (mock for now)
      const signature = await mockWallet.sendTransaction({
        amount: paymentData.amount,
        recipient: paymentData.recipient,
        message: paymentData.message
      });
      
      setMessage('Payment sent! Waiting for confirmation...');
      
      // Step 3: Confirm payment with backend
      const confirmResponse = await fetch(`${API}/payment/confirm-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: paymentData.transaction_id,
          signature: signature
        })
      });
      
      if (!confirmResponse.ok) {
        throw new Error('Failed to confirm payment');
      }
      
      // Step 4: Connect to game WebSocket
      connectToGame(sessionId, playerId);
      setGameState(prev => ({ ...prev, sessionId, playerId }));
      setMessage('Payment confirmed! Joining game...');
      
    } catch (error) {
      setMessage('Payment failed: ' + error.message);
      setGameStatus('menu');
    } finally {
      setLoading(false);
    }
  };

  // Connect to game WebSocket
  const connectToGame = (sessionId, playerId) => {
    const wsUrl = `${WS_URL}/ws/${sessionId}/${playerId}`;
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      setGameState(prev => ({ ...prev, connected: true }));
      setGameStatus('playing');
      setMessage('Connected! Waiting for other players...');
    };
    
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch(data.type) {
        case 'game_started':
          setGameState(prev => ({
            ...prev,
            players: data.players,
            food: data.food,
            status: 'active'
          }));
          setMessage('Game started! Use WASD or arrows to move');
          startGameLoop();
          break;
          
        case 'game_state':
          setGameState(prev => ({
            ...prev,
            players: data.players,
            food: data.food,
            status: data.status
          }));
          break;
          
        case 'game_ended':
          setGameState(prev => ({ ...prev, status: 'finished' }));
          setGameStatus('finished');
          const winnerName = data.winner ? `Player ${data.winner.substring(0, 8)}...` : 'No one';
          setMessage(`Game ended! Winner: ${winnerName} | Prize: ${data.prize_pool} SOL`);
          stopGameLoop();
          break;
          
        case 'player_eliminated':
          setMessage(`Player eliminated: ${data.player_id.substring(0, 8)}...`);
          break;
          
        case 'error':
          setMessage(`Game error: ${data.message}`);
          break;
      }
    };
    
    wsRef.current.onclose = () => {
      setGameState(prev => ({ ...prev, connected: false }));
      setMessage('Disconnected from game');
      stopGameLoop();
    };
    
    wsRef.current.onerror = (error) => {
      setMessage('Connection error');
    };
  };

  // Game loop
  const startGameLoop = () => {
    let lastTime = performance.now();
    
    const gameLoop = (currentTime) => {
      const deltaTime = currentTime - lastTime;
      
      if (deltaTime >= 50) { // 20 FPS
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ 
            type: 'update',
            timestamp: currentTime 
          }));
        }
        lastTime = currentTime;
      }
      
      animationRef.current = requestAnimationFrame(gameLoop);
    };
    
    animationRef.current = requestAnimationFrame(gameLoop);
  };

  // Stop game loop
  const stopGameLoop = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  // Keyboard input
  const handleKeyPress = useCallback((event) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      let direction = null;
      
      switch(event.key.toLowerCase()) {
        case 'arrowup':
        case 'w':
          direction = 'up';
          break;
        case 'arrowdown':
        case 's':
          direction = 'down';
          break;
        case 'arrowleft':
        case 'a':
          direction = 'left';
          break;
        case 'arrowright':
        case 'd':
          direction = 'right';
          break;
        default:
          return;
      }
      
      if (direction) {
        event.preventDefault();
        wsRef.current.send(JSON.stringify({
          type: 'move',
          direction: direction,
          timestamp: performance.now()
        }));
      }
    }
  }, []);

  // Mouse movement
  const handleMouseMove = useCallback((event) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && gameState.status === 'active') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left - canvas.width / 2;
      const mouseY = event.clientY - rect.top - canvas.height / 2;
      const angle = Math.atan2(mouseY, mouseX);
      
      wsRef.current.send(JSON.stringify({
        type: 'mouse_move',
        angle: angle,
        timestamp: performance.now()
      }));
    }
  }, [gameState.status]);

  // Event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
      }
    };
  }, [handleKeyPress, handleMouseMove]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Clear canvas with gradient background
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
    );
    gradient.addColorStop(0, '#001122');
    gradient.addColorStop(1, '#000511');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw food with glow effect
    ctx.shadowBlur = 10;
    gameState.food.forEach(food => {
      ctx.shadowColor = food.color || '#ffff00';
      ctx.fillStyle = food.color || '#ffff00';
      ctx.beginPath();
      ctx.arc(food.x, food.y, food.size || FOOD_SIZE, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Reset shadow
    ctx.shadowBlur = 0;
    
    // Draw players
    Object.values(gameState.players).forEach(player => {
      if (player.alive && player.segments && player.segments.length > 0) {
        // Draw snake body
        ctx.fillStyle = player.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        
        player.segments.forEach((segment, index) => {
          ctx.beginPath();
          const radius = index === 0 ? SNAKE_HEAD_SIZE : SNAKE_SEGMENT_SIZE - (index * 0.1);
          ctx.arc(segment.x, segment.y, Math.max(radius, 4), 0, Math.PI * 2);
          ctx.fill();
          
          if (index === 0) { // Head outline
            ctx.stroke();
          }
        });
        
        // Draw player name
        if (player.segments[0]) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          const playerName = player.player_id.substring(0, 8) + '...';
          ctx.fillText(playerName, player.segments[0].x, player.segments[0].y - 20);
        }
      }
    });
    
  }, [gameState.players, gameState.food]);

  // Cleanup
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
        <p>Real Solana-powered multiplayer snake game</p>
      </div>
      
      <div className="wallet-section">
        {!walletConnected ? (
          <button className="btn btn-primary" onClick={connectWallet} disabled={loading}>
            {loading ? 'Connecting...' : 'Connect Solana Wallet'}
          </button>
        ) : (
          <div className="wallet-connected">
            <p>✅ Wallet Connected: {mockWallet.publicKey?.substring(0, 8)}...</p>
          </div>
        )}
      </div>
      
      <div className="status-bar">
        <p>{message}</p>
        {userAccount && (
          <div className="user-stats">
            <p>💰 Games Won: {userAccount.games_won}/{userAccount.games_played}</p>
            <p>🏆 Total Winnings: {userAccount.total_winnings} SOL</p>
          </div>
        )}
        {gameState.sessionId && <p>🎮 Game ID: {gameState.sessionId.substring(0, 8)}...</p>}
      </div>
      
      {gameStatus === 'menu' && (
        <div className="menu">
          {!walletConnected ? (
            <div className="connect-prompt">
              <h3>Connect Your Solana Wallet to Play</h3>
              <p>Supported: Phantom, Solflare, and other Solana wallets</p>
            </div>
          ) : (
            <div className="menu-options">
              <button 
                className="btn btn-success" 
                onClick={async () => {
                  const sessionId = await createGame();
                  if (sessionId) joinGame(sessionId);
                }}
                disabled={loading}
              >
                {loading ? 'Creating...' : `Create New Game (${entryFee} SOL)`}
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
                  disabled={loading}
                >
                  {loading ? 'Joining...' : `Join Game (${entryFee} SOL)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {gameStatus === 'joining' && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Processing Solana payment...</p>
          <p>Check your wallet for transaction approval</p>
        </div>
      )}
      
      {gameStatus === 'playing' && (
        <div className="game-area">
          <div className="game-info">
            <p>Players: {Object.keys(gameState.players).length}</p>
            <p>Use Mouse or WASD to move</p>
            <p>Status: {gameState.status}</p>
          </div>
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="game-canvas"
          />
        </div>
      )}
      
      {gameStatus === 'finished' && (
        <div className="game-end">
          <h2>🎉 Game Finished!</h2>
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
                connected: false,
                myDirection: 0
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
  
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const gameLoopRef = useRef(null);
  const animationRef = useRef(null);
  
  const [gameState, setGameState] = useState({
    sessionId: null,
    playerId: null,
    players: {},
    food: [],
    status: 'waiting',
    connected: false,
    myDirection: 0 // angle in radians
  });
  
  const [userAccount, setUserAccount] = useState(null);
  const [gameStatus, setGameStatus] = useState('menu'); // menu, joining, playing, finished
  const [message, setMessage] = useState('Connect your Solana wallet to play!');
  const [entryFee, setEntryFee] = useState(0.01);
  const [loading, setLoading] = useState(false);
  
  // Create or get user account when wallet connects
  const createOrGetAccount = async () => {
    if (!connected || !publicKey) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${API}/user/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: publicKey.toString()
        })
      });
      
      const accountData = await response.json();
      setUserAccount(accountData);
      setMessage(`Welcome ${accountData.display_name || 'Player'}! Ready to play.`);
    } catch (error) {
      setMessage('Error creating account: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected && publicKey && !userAccount) {
      createOrGetAccount();
    }
  }, [connected, publicKey]);

  // Create new game session
  const createGame = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/game/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      setGameState(prev => ({ ...prev, sessionId: data.session_id }));
      setEntryFee(data.entry_fee);
      setMessage(`Game created: ${data.session_id.substring(0, 8)}...`);
      return data.session_id;
    } catch (error) {
      setMessage('Failed to create game: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Join game with real Solana payment
  const joinGame = async (sessionId) => {
    if (!connected || !publicKey) {
      setMessage('Please connect your Solana wallet first');
      return;
    }

    setGameStatus('joining');
    setLoading(true);
    setMessage('Processing entry fee payment...');

    try {
      const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      // Step 1: Create payment transaction
      const paymentResponse = await fetch(`${API}/payment/create-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          player_id: playerId,
          wallet_address: publicKey.toString()
        })
      });
      
      if (!paymentResponse.ok) {
        throw new Error('Failed to create payment transaction');
      }
      
      const paymentData = await paymentResponse.json();
      setMessage('Confirm payment in your wallet...');
      
      // Step 2: Create and send Solana transaction
      const gameVaultPubkey = new PublicKey("11111111111111111111111111111112"); // System program for demo
      const lamports = Math.floor(paymentData.amount * 1000000000); // Convert SOL to lamports
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: gameVaultPubkey,
          lamports: lamports
        })
      );
      
      const signature = await sendTransaction(transaction, connection);
      
      setMessage('Payment sent! Waiting for confirmation...');
      
      // Step 3: Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Step 4: Confirm payment with backend
      const confirmResponse = await fetch(`${API}/payment/confirm-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: paymentData.transaction_id,
          signature: signature
        })
      });
      
      if (!confirmResponse.ok) {
        throw new Error('Failed to confirm payment');
      }
      
      // Step 5: Connect to game WebSocket
      connectToGame(sessionId, playerId);
      setGameState(prev => ({ ...prev, sessionId, playerId }));
      setMessage('Payment confirmed! Joining game...');
      
    } catch (error) {
      setMessage('Payment failed: ' + error.message);
      setGameStatus('menu');
    } finally {
      setLoading(false);
    }
  };

  // Connect to game WebSocket with improved protocol
  const connectToGame = (sessionId, playerId) => {
    const wsUrl = `${WS_URL}/ws/${sessionId}/${playerId}`;
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      setGameState(prev => ({ ...prev, connected: true }));
      setGameStatus('playing');
      setMessage('Connected! Waiting for other players...');
    };
    
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch(data.type) {
        case 'game_started':
          setGameState(prev => ({
            ...prev,
            players: data.players,
            food: data.food,
            status: 'active'
          }));
          setMessage('Game started! Use WASD or arrows to move');
          startGameLoop();
          break;
          
        case 'game_state':
          setGameState(prev => ({
            ...prev,
            players: data.players,
            food: data.food,
            status: data.status
          }));
          break;
          
        case 'game_ended':
          setGameState(prev => ({ ...prev, status: 'finished' }));
          setGameStatus('finished');
          const winnerName = data.winner ? `Player ${data.winner.substring(0, 8)}...` : 'No one';
          setMessage(`Game ended! Winner: ${winnerName} | Prize: ${data.prize_pool} SOL`);
          stopGameLoop();
          break;
          
        case 'player_eliminated':
          setMessage(`Player eliminated: ${data.player_id.substring(0, 8)}...`);
          break;
          
        case 'error':
          setMessage(`Game error: ${data.message}`);
          break;
      }
    };
    
    wsRef.current.onclose = () => {
      setGameState(prev => ({ ...prev, connected: false }));
      setMessage('Disconnected from game');
      stopGameLoop();
    };
    
    wsRef.current.onerror = (error) => {
      setMessage('Connection error: ' + error.message);
    };
  };

  // Improved game loop
  const startGameLoop = () => {
    let lastTime = performance.now();
    
    const gameLoop = (currentTime) => {
      const deltaTime = currentTime - lastTime;
      
      if (deltaTime >= 50) { // 20 FPS
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ 
            type: 'update',
            timestamp: currentTime 
          }));
        }
        lastTime = currentTime;
      }
      
      animationRef.current = requestAnimationFrame(gameLoop);
    };
    
    animationRef.current = requestAnimationFrame(gameLoop);
  };

  // Stop game loop
  const stopGameLoop = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  // Enhanced keyboard input with smooth direction changes
  const handleKeyPress = useCallback((event) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      let direction = null;
      
      switch(event.key.toLowerCase()) {
        case 'arrowup':
        case 'w':
          direction = 'up';
          break;
        case 'arrowdown':
        case 's':
          direction = 'down';
          break;
        case 'arrowleft':
        case 'a':
          direction = 'left';
          break;
        case 'arrowright':
        case 'd':
          direction = 'right';
          break;
        default:
          return;
      }
      
      if (direction) {
        event.preventDefault();
        wsRef.current.send(JSON.stringify({
          type: 'move',
          direction: direction,
          timestamp: performance.now()
        }));
      }
    }
  }, []);

  // Mouse movement for direction (like original slither.io)
  const handleMouseMove = useCallback((event) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && gameState.status === 'active') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left - canvas.width / 2;
      const mouseY = event.clientY - rect.top - canvas.height / 2;
      const angle = Math.atan2(mouseY, mouseX);
      
      wsRef.current.send(JSON.stringify({
        type: 'mouse_move',
        angle: angle,
        timestamp: performance.now()
      }));
    }
  }, [gameState.status]);

  // Set up event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
      }
    };
  }, [handleKeyPress, handleMouseMove]);

  // Enhanced canvas rendering with smooth interpolation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Clear canvas with gradient background
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
    );
    gradient.addColorStop(0, '#001122');
    gradient.addColorStop(1, '#000511');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw food with glow effect
    ctx.shadowBlur = 10;
    gameState.food.forEach(food => {
      ctx.shadowColor = '#ffff00';
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.arc(food.x, food.y, FOOD_SIZE, 0, Math.PI * 2);
      ctx.fill();
    });
    
    // Reset shadow for players
    ctx.shadowBlur = 0;
    
    // Draw players with enhanced visuals
    Object.values(gameState.players).forEach(player => {
      if (player.alive && player.segments && player.segments.length > 0) {
        // Draw snake body
        ctx.fillStyle = player.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        
        player.segments.forEach((segment, index) => {
          ctx.beginPath();
          const radius = index === 0 ? SNAKE_HEAD_SIZE : SNAKE_SEGMENT_SIZE - (index * 0.1);
          ctx.arc(segment.x, segment.y, Math.max(radius, 4), 0, Math.PI * 2);
          ctx.fill();
          
          if (index === 0) { // Head outline
            ctx.stroke();
          }
        });
        
        // Draw player name above head
        if (player.segments[0]) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          const playerName = player.player_id.substring(0, 8) + '...';
          ctx.fillText(playerName, player.segments[0].x, player.segments[0].y - 20);
        }
      }
    });
    
  }, [gameState.players, gameState.food]);

  // Cleanup
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
        <p>Real Solana-powered multiplayer snake game</p>
      </div>
      
      <div className="wallet-section">
        <WalletMultiButton />
      </div>
      
      <div className="status-bar">
        <p>{message}</p>
        {userAccount && (
          <div className="user-stats">
            <p>💰 Games Won: {userAccount.games_won}/{userAccount.games_played}</p>
            <p>🏆 Total Winnings: {userAccount.total_winnings} SOL</p>
          </div>
        )}
        {gameState.sessionId && <p>🎮 Game ID: {gameState.sessionId.substring(0, 8)}...</p>}
      </div>
      
      {gameStatus === 'menu' && (
        <div className="menu">
          {!connected ? (
            <div className="connect-prompt">
              <h3>Connect Your Wallet to Play</h3>
              <p>Supported wallets: Phantom, Solflare, Backpack</p>
            </div>
          ) : (
            <div className="menu-options">
              <button 
                className="btn btn-success" 
                onClick={async () => {
                  const sessionId = await createGame();
                  if (sessionId) joinGame(sessionId);
                }}
                disabled={loading}
              >
                {loading ? 'Creating...' : `Create New Game (${entryFee} SOL)`}
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
                  disabled={loading}
                >
                  {loading ? 'Joining...' : `Join Game (${entryFee} SOL)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {gameStatus === 'joining' && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Processing Solana payment...</p>
          <p>Check your wallet for transaction approval</p>
        </div>
      )}
      
      {gameStatus === 'playing' && (
        <div className="game-area">
          <div className="game-info">
            <p>Players: {Object.keys(gameState.players).length}</p>
            <p>Use Mouse or WASD to move</p>
            <p>Status: {gameState.status}</p>
            <p>🎯 Prize Pool: {gameState.prize_pool || 0} SOL</p>
          </div>
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="game-canvas"
          />
        </div>
      )}
      
      {gameStatus === 'finished' && (
        <div className="game-end">
          <h2>🎉 Game Finished!</h2>
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
                connected: false,
                myDirection: 0
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
    <SolanaWalletProvider>
      <div className="App">
        <Game />
      </div>
    </SolanaWalletProvider>
  );
}

export default App;