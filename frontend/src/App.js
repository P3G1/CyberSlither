import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

// Game Constants
const GAME_WIDTH = 1200;
const GAME_HEIGHT = 800;
const FOOD_SIZE = 6;
const SNAKE_SEGMENT_SIZE = 8;
const SNAKE_HEAD_SIZE = 14;

// Betting amounts like damnbruh.com
const BET_AMOUNTS = [1, 5, 20];

// Snake color presets
const SNAKE_COLORS = [
  { name: "Purple Storm", color: "#8B5CF6", gradient: "linear-gradient(45deg, #8B5CF6, #A855F7)" },
  { name: "Ocean Wave", color: "#06B6D4", gradient: "linear-gradient(45deg, #06B6D4, #0891B2)" },
  { name: "Fire Dragon", color: "#F59E0B", gradient: "linear-gradient(45deg, #F59E0B, #D97706)" },
  { name: "Emerald Snake", color: "#10B981", gradient: "linear-gradient(45deg, #10B981, #059669)" },
  { name: "Rose Gold", color: "#F43F5E", gradient: "linear-gradient(45deg, #F43F5E, #E11D48)" },
  { name: "Electric Blue", color: "#3B82F6", gradient: "linear-gradient(45deg, #3B82F6, #2563EB)" }
];

// Enhanced wallet handler
const walletHandler = {
  connected: false,
  publicKey: null,
  balance: 0,
  
  connect: async () => {
    try {
      if (window.solana && window.solana.isPhantom) {
        const response = await window.solana.connect();
        walletHandler.connected = true;
        walletHandler.publicKey = response.publicKey.toString();
        walletHandler.balance = Math.random() * 10; // Mock balance for demo
        return response.publicKey;
      }
      
      // Demo mode
      walletHandler.connected = true;
      walletHandler.publicKey = "Demo" + Math.random().toString(36).substr(2, 8);
      walletHandler.balance = Math.random() * 10;
      return { toString: () => walletHandler.publicKey };
      
    } catch (error) {
      throw new Error('Failed to connect wallet');
    }
  },
  
  sendTransaction: async (amount) => {
    if (walletHandler.balance < amount) {
      throw new Error('Insufficient funds');
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    walletHandler.balance -= amount;
    return "sig_" + Math.random().toString(36).substr(2, 20);
  }
};

const Game = () => {
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const animationRef = useRef(null);
  
  // Game State
  const [gameState, setGameState] = useState({
    sessionId: null,
    playerId: null,
    players: {},
    food: [],
    status: 'waiting',
    connected: false
  });
  
  // UI State
  const [walletConnected, setWalletConnected] = useState(false);
  const [gameStatus, setGameStatus] = useState('menu'); // menu, lobby, playing, finished
  const [message, setMessage] = useState('Connect wallet and set your username to start gambling!');
  const [selectedBetAmount, setSelectedBetAmount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedSnakeColor, setSelectedSnakeColor] = useState(0);
  
  // Authentication State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  // User Data
  const [userAccount, setUserAccount] = useState(null);
  const [leaderboard, setLeaderboard] = useState([
    { name: "aj", winnings: 1351.04 },
    { name: "dih", winnings: 823.86 },
    { name: "Darkle", winnings: 623.42 }
  ]);
  const [globalStats, setGlobalStats] = useState({
    totalWinnings: 22610,
    playersInGame: 4
  });

  // Authentication functions
  const handleLogin = async () => {
    if (!username || !password) {
      setMessage('Please enter username and password');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password
        })
      });

      if (response.ok) {
        const userData = await response.json();
        setCurrentUser(userData);
        setIsLoggedIn(true);
        setShowAuthModal(false);
        setMessage(`Welcome back, ${userData.username}!`);
        
        // Clear form
        setUsername('');
        setPassword('');
        
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        const error = await response.json();
        setMessage('Login failed: ' + error.detail);
      }
    } catch (error) {
      setMessage('Login error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username || !password) {
      setMessage('Please enter username and password');
      return;
    }

    if (username.length < 3) {
      setMessage('Username must be at least 3 characters');
      return;
    }

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password
        })
      });

      if (response.ok) {
        const userData = await response.json();
        setCurrentUser(userData);
        setIsLoggedIn(true);
        setShowAuthModal(false);
        setMessage(`Account created! Welcome, ${userData.username}!`);
        
        // Clear form
        setUsername('');
        setPassword('');
        
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        const error = await response.json();
        setMessage('Registration failed: ' + error.detail);
      }
    } catch (error) {
      setMessage('Registration error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickUsernameSet = async () => {
    const quickUsername = document.getElementById('quickUsername').value.trim();
    
    if (!quickUsername) {
      setMessage('Please enter a username');
      return;
    }

    if (quickUsername.length < 3) {
      setMessage('Username must be at least 3 characters');
      return;
    }

    try {
      setLoading(true);
      // Create account with random password for quick setup
      const tempPassword = Math.random().toString(36).substring(2, 15);
      
      const response = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: quickUsername,
          password: tempPassword,
          quick_setup: true
        })
      });

      if (response.ok) {
        const userData = await response.json();
        setCurrentUser(userData);
        setIsLoggedIn(true);
        setMessage(`Username set! Welcome, ${userData.username}!`);
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        const error = await response.json();
        setMessage('Failed to set username: ' + error.detail);
      }
    } catch (error) {
      setMessage('Error setting username: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsLoggedIn(false);
    setUserAccount(null);
    setWalletConnected(false);
    setMessage('Logged out successfully');
    localStorage.removeItem('user');
    walletHandler.connected = false;
    walletHandler.publicKey = null;
  };

  // Check for saved user on component mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setCurrentUser(userData);
        setIsLoggedIn(true);
        setMessage(`Welcome back, ${userData.username}!`);
      } catch (error) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  // Connect wallet
  const connectWallet = async () => {
    if (!isLoggedIn) {
      setMessage('Please login first to connect your wallet');
      return;
    }

    try {
      setLoading(true);
      const publicKey = await walletHandler.connect();
      setWalletConnected(true);
      
      const response = await fetch(`${API}/user/connect-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.user_id,
          wallet_address: publicKey.toString()
        })
      });
      
      const accountData = await response.json();
      setUserAccount(accountData);
      setMessage(`Wallet connected! Choose your bet and join a game.`);
      
    } catch (error) {
      setMessage('Failed to connect wallet: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Create game with bet amount
  const createGameWithBet = async () => {
    if (!isLoggedIn) {
      setMessage('Please login first');
      return;
    }

    if (!walletConnected) {
      setMessage('Please connect your wallet first');
      return;
    }

    try {
      setLoading(true);
      setMessage('Creating game with $' + selectedBetAmount + ' bet...');
      
      const response = await fetch(`${API}/game/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bet_amount: selectedBetAmount,
          user_id: currentUser.user_id
        })
      });
      
      const data = await response.json();
      joinGameWithBet(data.session_id);
      
    } catch (error) {
      setMessage('Failed to create game: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Join game with bet
  const joinGameWithBet = async (sessionId) => {
    if (!walletConnected) {
      setMessage('Connect wallet first!');
      return;
    }

    setGameStatus('lobby');
    setLoading(true);
    setMessage(`Placing $${selectedBetAmount} bet...`);

    try {
      const playerId = `${currentUser.username}_${Date.now()}`;
      
      // Create payment transaction
      const paymentResponse = await fetch(`${API}/payment/create-bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId || `game_${Date.now()}`,
          player_id: playerId,
          user_id: currentUser.user_id,
          wallet_address: walletHandler.publicKey,
          bet_amount: selectedBetAmount
        })
      });
      
      const paymentData = await paymentResponse.json();
      
      // Send transaction
      const signature = await walletHandler.sendTransaction(selectedBetAmount);
      
      // Confirm payment
      const confirmResponse = await fetch(`${API}/payment/confirm-bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: paymentData.transaction_id,
          signature: signature
        })
      });
      
      // Connect to game
      connectToGame(sessionId || `game_${Date.now()}`, playerId);
      setGameState(prev => ({ ...prev, sessionId: sessionId || `game_${Date.now()}`, playerId }));
      
    } catch (error) {
      setMessage('Bet failed: ' + error.message);
      setGameStatus('menu');
    } finally {
      setLoading(false);
    }
  };

  // Connect to WebSocket
  const connectToGame = (sessionId, playerId) => {
    const wsUrl = `${WS_URL}/ws/${sessionId}/${playerId}`;
    wsRef.current = new WebSocket(wsUrl);
    
    wsRef.current.onopen = () => {
      setGameState(prev => ({ ...prev, connected: true }));
      setGameStatus('playing');
      setMessage('Game started! Move with mouse or WASD');
      startGameLoop();
    };
    
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleGameMessage(data);
    };
    
    wsRef.current.onclose = () => {
      setGameState(prev => ({ ...prev, connected: false }));
      setMessage('Disconnected from game');
      stopGameLoop();
    };
  };

  const handleGameMessage = (data) => {
    switch(data.type) {
      case 'game_started':
        setGameState(prev => ({
          ...prev,
          players: data.players,
          food: data.food,
          status: 'active'
        }));
        break;
        
      case 'game_state':
        setGameState(prev => ({
          ...prev,
          players: data.players,
          food: data.food
        }));
        break;
        
      case 'game_ended':
        setGameStatus('finished');
        const winner = data.winner;
        const winnings = data.winnings;
        setMessage(winner ? `🏆 ${winner} won $${winnings}!` : 'Game ended!');
        stopGameLoop();
        break;
        
      case 'player_eliminated':
        setMessage(`💀 ${data.player} eliminated!`);
        break;
    }
  };

  // Game loop and controls (same as before)
  const startGameLoop = () => {
    const gameLoop = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ 
          type: 'update',
          timestamp: performance.now() 
        }));
      }
      animationRef.current = requestAnimationFrame(gameLoop);
    };
    animationRef.current = requestAnimationFrame(gameLoop);
  };

  const stopGameLoop = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  // Controls (same as before)
  const handleKeyPress = useCallback((event) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      let direction = null;
      
      switch(event.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          direction = 'up';
          break;
        case 's':
        case 'arrowdown':
          direction = 'down';
          break;
        case 'a':
        case 'arrowleft':
          direction = 'left';
          break;
        case 'd':
        case 'arrowright':
          direction = 'right';
          break;
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
        angle: angle
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

  // Canvas rendering (same as before but simplified for space)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Clear with dark background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid pattern
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    // Draw food
    gameState.food.forEach(food => {
      ctx.fillStyle = food.color || '#FFD700';
      ctx.beginPath();
      ctx.arc(food.x, food.y, FOOD_SIZE, 0, Math.PI * 2);
      ctx.fill();
      
      // Glow effect
      ctx.shadowBlur = 15;
      ctx.shadowColor = food.color || '#FFD700';
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    
    // Draw players
    Object.values(gameState.players).forEach(player => {
      if (player.alive && player.segments && player.segments.length > 0) {
        const gradient = ctx.createLinearGradient(
          player.segments[0].x - 20, player.segments[0].y - 20,
          player.segments[0].x + 20, player.segments[0].y + 20
        );
        gradient.addColorStop(0, player.color);
        gradient.addColorStop(1, player.color + '80');
        
        player.segments.forEach((segment, index) => {
          const radius = index === 0 ? SNAKE_HEAD_SIZE : SNAKE_SEGMENT_SIZE - (index * 0.2);
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(segment.x, segment.y, Math.max(radius, 4), 0, Math.PI * 2);
          ctx.fill();
          
          // Head details
          if (index === 0) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Eyes
            ctx.fillStyle = '#ffffff';
            const eyeOffset = radius * 0.3;
            ctx.beginPath();
            ctx.arc(segment.x - eyeOffset, segment.y - eyeOffset, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(segment.x + eyeOffset, segment.y - eyeOffset, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        
        // Player name
        if (player.segments[0]) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px Arial';
          ctx.textAlign = 'center';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 4;
          
          const name = `${player.player_id.split('_')[0]} ($${selectedBetAmount})`;
          const textX = player.segments[0].x;
          const textY = player.segments[0].y - 25;
          
          ctx.strokeText(name, textX, textY);
          ctx.fillText(name, textX, textY);
        }
      }
    });
    
  }, [gameState.players, gameState.food, selectedBetAmount]);

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
    <div className="damnbruh-container">
      {/* Header */}
      <div className="header">
        <div className="logo">
          <span className="logo-icon">🐍</span>
          <span className="logo-text">CRYPTO<span className="logo-accent">SLITHER</span></span>
        </div>
        <div className="header-actions">
          {isLoggedIn ? (
            <div className="user-info">
              <span className="welcome-text">Welcome, {currentUser.username}</span>
              <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </div>
          ) : (
            <button className="login-btn" onClick={() => setShowAuthModal(true)}>Login</button>
          )}
        </div>
      </div>

      {/* Authentication Modal */}
      {showAuthModal && (
        <div className="modal-overlay">
          <div className="auth-modal">
            <div className="modal-header">
              <h2>{authMode === 'login' ? 'Login' : 'Register'}</h2>
              <button className="close-btn" onClick={() => setShowAuthModal(false)}>×</button>
            </div>
            
            <div className="auth-form">
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="auth-input"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
              />
              
              <button 
                className="auth-btn"
                onClick={authMode === 'login' ? handleLogin : handleRegister}
                disabled={loading}
              >
                {loading ? 'Please wait...' : (authMode === 'login' ? 'Login' : 'Create Account')}
              </button>
              
              <div className="auth-switch">
                {authMode === 'login' ? (
                  <p>Don't have an account? <button onClick={() => setAuthMode('register')}>Register</button></p>
                ) : (
                  <p>Already have an account? <button onClick={() => setAuthMode('login')}>Login</button></p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="main-content">
        {/* Left Sidebar */}
        <div className="left-sidebar">
          {/* Leaderboard */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-icon">🏆</span>
              <span>Leaderboard</span>
              <span className="live-indicator">● Live</span>
            </div>
            <div className="leaderboard">
              {leaderboard.map((player, index) => (
                <div key={index} className="leaderboard-item">
                  <span className="rank">{index + 1}. {player.name}</span>
                  <span className="winnings">${player.winnings.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <button className="view-full-btn">View Full Leaderboard</button>
          </div>

          {/* Friends */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-icon">👥</span>
              <span>Friends</span>
              <button className="refresh-btn">🔄</button>
              <span className="friends-count">0 playing</span>
            </div>
            <div className="no-friends">
              <div className="no-friends-icon">👤</div>
              <p>No friends... add some!</p>
            </div>
            <button className="add-friends-btn">Add Friends</button>
          </div>
        </div>

        {/* Game Area */}
        <div className="game-area">
          {gameStatus === 'menu' && (
            <div className="game-lobby">
              <h1 className="game-title">CRYPTO<span className="title-accent">SLITHER</span></h1>
              
              {!isLoggedIn ? (
                <div className="connect-section">
                  <input 
                    type="text" 
                    placeholder="Set your username to get started" 
                    className="name-input"
                    id="quickUsername"
                  />
                  <button className="edit-btn" onClick={handleQuickUsernameSet} disabled={loading}>
                    {loading ? '...' : '✏️'}
                  </button>
                </div>
              ) : !walletConnected ? (
                <div className="wallet-connect-section">
                  <p className="username-display">Playing as: <strong>{currentUser.username}</strong></p>
                  <button className="connect-wallet-main-btn" onClick={connectWallet} disabled={loading}>
                    {loading ? 'Connecting...' : 'Connect Wallet to Start'}
                  </button>
                </div>
              ) : (
                <div className="bet-section">
                  <div className="bet-amounts">
                    {BET_AMOUNTS.map(amount => (
                      <button
                        key={amount}
                        className={`bet-btn ${selectedBetAmount === amount ? 'active' : ''}`}
                        onClick={() => setSelectedBetAmount(amount)}
                      >
                        ${amount}
                      </button>
                    ))}
                  </div>
                  
                  <button className="join-game-btn" onClick={createGameWithBet} disabled={loading}>
                    <span className="play-icon">▶</span>
                    {loading ? 'JOINING...' : 'JOIN GAME'}
                  </button>
                  
                  <div className="game-options">
                    <button className="option-btn">🇺🇸 US</button>
                    <button className="option-btn">🌐 Browse Lobbies</button>
                  </div>
                </div>
              )}
              
              <div className="game-stats">
                <div className="stat">
                  <div className="stat-number">{globalStats.playersInGame}</div>
                  <div className="stat-label">Players in Game</div>
                </div>
                <div className="stat">
                  <div className="stat-number">${globalStats.totalWinnings.toLocaleString()}</div>
                  <div className="stat-label">Global Player Winnings</div>
                </div>
              </div>
            </div>
          )}

          {gameStatus === 'playing' && (
            <canvas
              ref={canvasRef}
              width={GAME_WIDTH}
              height={GAME_HEIGHT}
              className="game-canvas"
            />
          )}

          {gameStatus === 'finished' && (
            <div className="game-end">
              <h2>Game Finished!</h2>
              <p>{message}</p>
              <button 
                className="play-again-btn"
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

        {/* Right Sidebar */}
        <div className="right-sidebar">
          {/* Wallet */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-icon">💳</span>
              <span>Wallet</span>
              <button className="copy-btn">📋 Copy Address</button>
              <button className="refresh-balance-btn">🔄 Refresh Balance</button>
            </div>
            
            {!walletConnected ? (
              <div className="wallet-disconnect">
                {!isLoggedIn ? (
                  <p className="wallet-message">Login first to connect wallet</p>
                ) : (
                  <button className="connect-wallet-btn" onClick={connectWallet} disabled={loading}>
                    {loading ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="balance">
                  <div className="balance-amount">${walletHandler.balance.toFixed(2)}</div>
                  <div className="balance-label">{walletHandler.balance.toFixed(4)} SOL</div>
                </div>
                
                <div className="wallet-actions">
                  <button className="add-funds-btn">Add Funds</button>
                  <button className="cash-out-btn">Cash out</button>
                </div>
              </>
            )}
          </div>

          {/* Customize */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-icon">🎨</span>
              <span>Customize</span>
            </div>
            
            <div className="snake-previews">
              {SNAKE_COLORS.map((snake, index) => (
                <div 
                  key={index}
                  className={`snake-preview ${selectedSnakeColor === index ? 'selected' : ''}`}
                  onClick={() => setSelectedSnakeColor(index)}
                  style={{ background: snake.gradient }}
                >
                  <div className="snake-eyes">👀</div>
                </div>
              ))}
            </div>
            
            <button className="change-appearance-btn">Change Appearance</button>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <span>{message}</span>
      </div>
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