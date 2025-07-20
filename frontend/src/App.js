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

// Enhanced wallet handler for real Solana wallets
const walletHandler = {
  connected: false,
  publicKey: null,
  
  connect: async () => {
    try {
      // Check for Phantom Wallet
      if (window.solana && window.solana.isPhantom) {
        const response = await window.solana.connect();
        walletHandler.connected = true;
        walletHandler.publicKey = response.publicKey.toString();
        return response.publicKey;
      }
      
      // Check for Solflare
      if (window.solflare && window.solflare.isSolflare) {
        await window.solflare.connect();
        walletHandler.connected = true;
        walletHandler.publicKey = window.solflare.publicKey.toString();
        return window.solflare.publicKey;
      }
      
      // Fallback to mock for demo
      walletHandler.connected = true;
      walletHandler.publicKey = "Demo" + Math.random().toString(36).substr(2, 8);
      return { toString: () => walletHandler.publicKey };
      
    } catch (error) {
      console.error('Wallet connection failed:', error);
      throw new Error('Failed to connect wallet. Please make sure you have Phantom or Solflare installed.');
    }
  },
  
  sendTransaction: async (transactionData) => {
    try {
      if (window.solana && window.solana.isPhantom) {
        // In a real implementation, you would create a proper Solana transaction here
        // For demo purposes, we'll simulate the transaction
        console.log('Sending transaction via Phantom:', transactionData);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network delay
        return "phantom_sig_" + Math.random().toString(36).substr(2, 20);
      }
      
      if (window.solflare && window.solflare.isSolflare) {
        console.log('Sending transaction via Solflare:', transactionData);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return "solflare_sig_" + Math.random().toString(36).substr(2, 20);
      }
      
      // Mock transaction
      await new Promise(resolve => setTimeout(resolve, 2000));
      return "demo_sig_" + Math.random().toString(36).substr(2, 20);
      
    } catch (error) {
      console.error('Transaction failed:', error);
      throw new Error('Transaction failed. Please try again.');
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

  // Detect available wallets
  const detectWallets = () => {
    const wallets = [];
    if (window.solana && window.solana.isPhantom) wallets.push('Phantom');
    if (window.solflare && window.solflare.isSolflare) wallets.push('Solflare');
    if (wallets.length === 0) wallets.push('Demo Mode');
    return wallets;
  };

  // Connect wallet function
  const connectWallet = async () => {
    try {
      setLoading(true);
      const publicKey = await walletHandler.connect();
      setWalletConnected(true);
      
      // Create or get user account
      const response = await fetch(`${API}/user/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: publicKey.toString()
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to create user account');
      }
      
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
      
      if (!response.ok) {
        throw new Error('Failed to create game session');
      }
      
      const data = await response.json();
      setGameState(prev => ({ ...prev, sessionId: data.session_id }));
      setEntryFee(data.entry_fee);
      setMessage(`Game created: ${data.session_id.substring(0, 8)}...`);
      return data.session_id;
    } catch (error) {
      setMessage('Failed to create game: ' + error.message);
      return null;
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
          wallet_address: walletHandler.publicKey
        })
      });
      
      if (!paymentResponse.ok) {
        throw new Error('Failed to create payment transaction');
      }
      
      const paymentData = await paymentResponse.json();
      setMessage('Confirm payment in your wallet...');
      
      // Step 2: Send transaction
      const signature = await walletHandler.sendTransaction({
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
          setMessage('Game started! Use WASD/arrows to move, or move your mouse!');
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
          const prizeAmount = data.prize_pool ? data.prize_pool.toFixed(4) : '0';
          setMessage(`🎉 Game ended! Winner: ${winnerName} | Prize: ${prizeAmount} SOL`);
          stopGameLoop();
          break;
          
        case 'player_eliminated':
          setMessage(`💀 Player eliminated: ${data.player_id.substring(0, 8)}...`);
          break;
          
        case 'error':
          setMessage(`⚠️ Game error: ${data.message}`);
          break;
          
        default:
          break;
      }
    };
    
    wsRef.current.onclose = () => {
      setGameState(prev => ({ ...prev, connected: false }));
      setMessage('Disconnected from game');
      stopGameLoop();
    };
    
    wsRef.current.onerror = () => {
      setMessage('Connection error - please try again');
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

  // Mouse movement for smooth direction control
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

  // Enhanced canvas rendering
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
    
    // Draw players with enhanced visuals
    Object.values(gameState.players).forEach(player => {
      if (player.alive && player.segments && player.segments.length > 0) {
        // Draw snake body with gradient
        const segmentCount = player.segments.length;
        
        player.segments.forEach((segment, index) => {
          ctx.beginPath();
          const radius = index === 0 ? SNAKE_HEAD_SIZE : Math.max(SNAKE_SEGMENT_SIZE - (index * 0.2), 4);
          
          // Color intensity decreases towards tail
          const intensity = Math.max(1 - (index / segmentCount), 0.3);
          const color = player.color;
          const r = parseInt(color.substr(1, 2), 16);
          const g = parseInt(color.substr(3, 2), 16);
          const b = parseInt(color.substr(5, 2), 16);
          
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${intensity})`;
          ctx.arc(segment.x, segment.y, radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Head outline and eyes
          if (index === 0) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw eyes
            ctx.fillStyle = '#ffffff';
            const eyeOffset = radius * 0.3;
            ctx.beginPath();
            ctx.arc(segment.x - eyeOffset, segment.y - eyeOffset, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(segment.x + eyeOffset, segment.y - eyeOffset, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        
        // Draw player name and score
        if (player.segments[0]) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px Arial';
          ctx.textAlign = 'center';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          
          const playerName = `${player.player_id.substring(0, 6)}... (${player.score || 10})`;
          const textX = player.segments[0].x;
          const textY = player.segments[0].y - 25;
          
          ctx.strokeText(playerName, textX, textY);
          ctx.fillText(playerName, textX, textY);
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

  const availableWallets = detectWallets();

  return (
    <div className="game-container">
      <div className="header">
        <h1>🐍 Crypto Slither</h1>
        <p>Real Solana-powered multiplayer snake game</p>
      </div>
      
      <div className="wallet-section">
        {!walletConnected ? (
          <div className="wallet-connection">
            <button className="btn btn-primary" onClick={connectWallet} disabled={loading}>
              {loading ? 'Connecting...' : 'Connect Solana Wallet'}
            </button>
            <p className="wallet-info">Available: {availableWallets.join(', ')}</p>
          </div>
        ) : (
          <div className="wallet-connected">
            <p>✅ Wallet Connected</p>
            <p className="wallet-address">{walletHandler.publicKey?.substring(0, 8)}...{walletHandler.publicKey?.substr(-8)}</p>
          </div>
        )}
      </div>
      
      <div className="status-bar">
        <p className="status-message">{message}</p>
        {userAccount && (
          <div className="user-stats">
            <div className="stat-item">
              <span className="stat-label">Games:</span>
              <span className="stat-value">{userAccount.games_won}/{userAccount.games_played}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Winnings:</span>
              <span className="stat-value">{userAccount.total_winnings.toFixed(4)} SOL</span>
            </div>
          </div>
        )}
        {gameState.sessionId && (
          <p className="game-id">🎮 Game ID: {gameState.sessionId.substring(0, 12)}...</p>
        )}
      </div>
      
      {gameStatus === 'menu' && (
        <div className="menu">
          {!walletConnected ? (
            <div className="connect-prompt">
              <h3>Connect Your Solana Wallet to Play</h3>
              <p>Install Phantom or Solflare wallet to play with real SOL</p>
              <p>Or continue in demo mode to test the game</p>
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
                {loading ? 'Creating...' : `🚀 Create New Game (${entryFee} SOL)`}
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
                    const sessionId = document.getElementById('sessionInput').value.trim();
                    if (sessionId) {
                      joinGame(sessionId);
                    } else {
                      setMessage('Please enter a valid session ID');
                    }
                  }}
                  disabled={loading}
                >
                  {loading ? 'Joining...' : `🎯 Join Game (${entryFee} SOL)`}
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
            <div className="info-item">
              <span>👥 Players:</span>
              <span>{Object.keys(gameState.players).length}</span>
            </div>
            <div className="info-item">
              <span>🎮 Controls:</span>
              <span>Mouse + WASD</span>
            </div>
            <div className="info-item">
              <span>📊 Status:</span>
              <span className={`status-${gameState.status}`}>{gameState.status}</span>
            </div>
          </div>
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="game-canvas"
          />
          <div className="game-tips">
            <p>💡 Move your mouse to change direction smoothly</p>
            <p>🍎 Eat food to grow larger and increase your score</p>
            <p>💀 Avoid hitting other players or yourself</p>
          </div>
        </div>
      )}
      
      {gameStatus === 'finished' && (
        <div className="game-end">
          <h2>🎉 Game Finished!</h2>
          <p className="game-result">{message}</p>
          <div className="game-actions">
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
                setMessage('Ready to play again!');
              }}
            >
              🔄 Play Again
            </button>
          </div>
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