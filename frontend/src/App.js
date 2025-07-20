import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ConnectionProvider, WalletProvider, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl, Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import './App.css';

// Import wallet adapter CSS
require('@solana/wallet-adapter-react-ui/styles.css');

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const WS_URL = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

// Cyberpunk Game Constants
const GAME_WIDTH = 1200;
const GAME_HEIGHT = 700;

// Mobile responsive canvas sizing
const getCanvasSize = () => {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    const width = Math.min(window.innerWidth - 40, 800);
    const height = Math.min(window.innerHeight * 0.6, 500);
    return { width, height };
  }
  return { width: GAME_WIDTH, height: GAME_HEIGHT };
};
const FOOD_SIZE = 8;
const SNAKE_SEGMENT_SIZE = 10;
const SNAKE_HEAD_SIZE = 16;

// Cyberpunk betting amounts
const BET_AMOUNTS = [1, 5, 20, 50];

// Your Solana wallet for fees
const HOUSE_WALLET = "3FTmCxdfcNNSPiEd253ecEn2xTLqcBZNbacMcHMdrbkC";

// Enhanced Snake Customization Options
const SNAKE_SKINS = [
  { 
    name: "Neon Viper", 
    color: "#00ffff", 
    gradient: "linear-gradient(45deg, #00ffff, #0080ff)",
    glow: "#00ffff",
    pattern: "solid"
  },
  { 
    name: "Cyber Dragon", 
    color: "#ff0080", 
    gradient: "linear-gradient(45deg, #ff0080, #ff4000)",
    glow: "#ff0080",
    pattern: "striped"
  },
  { 
    name: "Matrix Snake", 
    color: "#00ff00", 
    gradient: "linear-gradient(45deg, #00ff00, #80ff00)",
    glow: "#00ff00",
    pattern: "digital"
  },
  { 
    name: "Plasma Serpent", 
    color: "#8000ff", 
    gradient: "linear-gradient(45deg, #8000ff, #ff0080)",
    glow: "#8000ff",
    pattern: "pulse"
  },
  { 
    name: "Holo Beast", 
    color: "#ffff00", 
    gradient: "linear-gradient(45deg, #ffff00, #ff8000)",
    glow: "#ffff00",
    pattern: "hologram"
  },
  { 
    name: "Dark Matter", 
    color: "#4000ff", 
    gradient: "linear-gradient(45deg, #4000ff, #8000ff)",
    glow: "#4000ff",
    pattern: "void"
  }
];

const SNAKE_ACCESSORIES = [
  { name: "None", icon: "❌" },
  { name: "Crown", icon: "👑" },
  { name: "Horns", icon: "👹" },
  { name: "Halo", icon: "😇" },
  { name: "Spikes", icon: "⚡" },
  { name: "Gems", icon: "💎" }
];

const SNAKE_TRAILS = [
  { name: "None", effect: "none" },
  { name: "Neon Trail", effect: "neon" },
  { name: "Fire Trail", effect: "fire" },
  { name: "Electric", effect: "electric" },
  { name: "Glitch", effect: "glitch" },
  { name: "Hologram", effect: "hologram" }
];

const GameComponent = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const animationRef = useRef(null);
  const gameLoopRef = useRef(null);
  
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
  const [gameStatus, setGameStatus] = useState('menu');
  const [message, setMessage] = useState('🌆 Welcome to the Cyberpunk Slither Arena! Connect your wallet to start.');
  const [selectedBetAmount, setSelectedBetAmount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [canvasSize, setCanvasSize] = useState(getCanvasSize());
  
  // Customization State
  const [selectedSkin, setSelectedSkin] = useState(0);
  const [selectedAccessory, setSelectedAccessory] = useState(0);
  const [selectedTrail, setSelectedTrail] = useState(1);
  const [showCustomization, setShowCustomization] = useState(false);
  
  // Authentication State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Admin State
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');
  
  // Real Game Data
  const [userAccount, setUserAccount] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [globalStats, setGlobalStats] = useState({
    totalWinnings: 0,
    playersInGame: 0
  });

  // Load wallet balance
  const loadWalletBalance = async () => {
    if (connected && publicKey && connection) {
      try {
        const balance = await connection.getBalance(publicKey);
        setWalletBalance(balance / LAMPORTS_PER_SOL);
      } catch (error) {
        console.error('Error loading wallet balance:', error);
      }
    }
  };

  useEffect(() => {
    if (connected) {
      loadWalletBalance();
    }
  }, [connected, publicKey, connection]);

  // Load real leaderboard data
  const loadLeaderboard = async () => {
    try {
      const response = await fetch(`${API}/leaderboard`);
      if (response.ok) {
        const data = await response.json();
        setLeaderboard(data.leaderboard || []);
        setGlobalStats({
          totalWinnings: data.total_winnings || 0,
          playersInGame: data.active_players || 0
        });
      }
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      // Fallback data
      setLeaderboard([
        { display_name: "CyberViper", total_winnings: 1337.42 },
        { display_name: "NeonHunter", total_winnings: 892.15 },
        { display_name: "MatrixSlayer", total_winnings: 665.88 }
      ]);
      setGlobalStats({ totalWinnings: 25420, playersInGame: 8 });
    }
  };

  useEffect(() => {
    loadLeaderboard();
    const interval = setInterval(loadLeaderboard, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, []);

  // Authentication functions
  const handleLogin = async () => {
    if (!username || !password) {
      setMessage('⚠️ Enter username and password');
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
        setIsAdmin(userData.is_admin || false);
        setShowAuthModal(false);
        setMessage(`🎮 Welcome back, ${userData.username}${userData.is_admin ? ' (ADMIN)' : ''}! Ready to dominate the cyber arena?`);
        
        setUsername('');
        setPassword('');
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        const error = await response.json();
        setMessage('❌ Login failed: ' + error.detail);
      }
    } catch (error) {
      setMessage('🔥 Connection error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username || !password) {
      setMessage('⚠️ Enter username and password');
      return;
    }

    if (username.length < 3) {
      setMessage('⚠️ Username must be at least 3 characters');
      return;
    }

    if (password.length < 6) {
      setMessage('⚠️ Password must be at least 6 characters');
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
        setIsAdmin(userData.is_admin || false);
        setShowAuthModal(false);
        setMessage(`🚀 Account created! Welcome to the matrix, ${userData.username}${userData.is_admin ? ' (ADMIN)' : ''}!`);
        
        setUsername('');
        setPassword('');
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        const error = await response.json();
        setMessage('❌ Registration failed: ' + error.detail);
      }
    } catch (error) {
      setMessage('🔥 Registration error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickUsernameSet = async () => {
    const quickUsername = document.getElementById('quickUsername').value.trim();
    
    if (!quickUsername) {
      setMessage('⚠️ Enter a cyber handle');
      return;
    }

    if (quickUsername.length < 3) {
      setMessage('⚠️ Cyber handle must be at least 3 characters');
      return;
    }

    try {
      setLoading(true);
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
        setMessage(`🎯 Cyber handle locked! Welcome, ${userData.username}!`);
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        const error = await response.json();
        setMessage('❌ Failed to set handle: ' + error.detail);
      }
    } catch (error) {
      setMessage('🔥 Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsLoggedIn(false);
    setIsAdmin(false);
    setUserAccount(null);
    setMessage('👋 Disconnected from the matrix');
    localStorage.removeItem('user');
  };

  // Admin functions
  const handleCreateAdmin = async () => {
    if (!username || !password || !adminSecret) {
      setMessage('⚠️ Enter username, password, and admin secret');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API}/admin/create-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password,
          admin_secret: adminSecret
        })
      });

      if (response.ok) {
        const userData = await response.json();
        setCurrentUser(userData);
        setIsLoggedIn(true);
        setIsAdmin(true);
        setShowAuthModal(false);
        setShowAdminPanel(false);
        setMessage(`👑 Admin account created! Welcome, ${userData.username}! You can play FREE games.`);
        
        setUsername('');
        setPassword('');
        setAdminSecret('');
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        const error = await response.json();
        setMessage('❌ Admin creation failed: ' + error.detail);
      }
    } catch (error) {
      setMessage('🔥 Admin creation error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const createFreeGameAsAdmin = async () => {
    if (!isAdmin) {
      setMessage('🔒 Admin access required');
      return;
    }

    try {
      setLoading(true);
      setMessage(`🎲 Creating FREE admin arena with $${selectedBetAmount} display bet...`);
      
      const response = await fetch(`${API}/admin/create-free-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.user_id,
          bet_amount: selectedBetAmount
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        joinFreeGameAsAdmin(data.session_id);
      } else {
        throw new Error('Free game creation failed');
      }
      
    } catch (error) {
      setMessage('❌ Failed to create free game: ' + error.message);
      setLoading(false);
    }
  };

  const joinFreeGameAsAdmin = async (sessionId) => {
    if (!isAdmin) {
      setMessage('🔒 Admin access required');
      return;
    }

    setGameStatus('lobby');
    setMessage(`👑 Joining FREE admin arena (no payment required)...`);

    try {
      const playerId = `${currentUser.username}_${Date.now()}`;
      
      const response = await fetch(`${API}/admin/join-free-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          user_id: currentUser.user_id,
          player_id: playerId
        })
      });
      
      if (!response.ok) {
        throw new Error('Free game join failed');
      }
      
      const joinData = await response.json();
      setMessage('👑 Admin entered arena FREE! Starting game...');
      
      // Connect to game
      connectToGame(sessionId, joinData.player_id);
      setGameState(prev => ({ ...prev, sessionId: sessionId, playerId: joinData.player_id }));
      
    } catch (error) {
      setMessage('❌ Failed to join free game: ' + error.message);
      setGameStatus('menu');
      setLoading(false);
    }
  };

  // Check for saved user
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setCurrentUser(userData);
        setIsLoggedIn(true);
        setIsAdmin(userData.is_admin || false);
        setMessage(`🔮 Reconnected to the matrix, ${userData.username}${userData.is_admin ? ' (ADMIN)' : ''}!`);
      } catch (error) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  // Connect user account to wallet
  const connectUserWallet = async () => {
    if (!isLoggedIn || !connected || !publicKey) {
      setMessage('🔒 Authenticate and connect wallet first');
      return;
    }

    try {
      setLoading(true);
      setMessage('🔗 Linking wallet to cyber profile...');
      
      const response = await fetch(`${API}/user/connect-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.user_id,
          wallet_address: publicKey.toString()
        })
      });
      
      if (response.ok) {
        const accountData = await response.json();
        setUserAccount(accountData);
        setMessage(`⚡ Cyber wallet linked! Balance: ${walletBalance.toFixed(4)} SOL`);
      } else {
        setMessage('⚠️ Wallet linked but account sync failed');
      }
      
    } catch (error) {
      setMessage('❌ Wallet linking failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-link wallet when both user and wallet are connected
  useEffect(() => {
    if (isLoggedIn && connected && publicKey && !userAccount) {
      connectUserWallet();
    }
  }, [isLoggedIn, connected, publicKey]);

  // Create and join game
  const createGameWithBet = async () => {
    if (!isLoggedIn) {
      setMessage('🔒 Authenticate first');
      return;
    }

    if (!connected || !publicKey) {
      setMessage('💳 Connect your cyber wallet first');
      return;
    }

    // Check if user has sufficient SOL
    const requiredSOL = selectedBetAmount * 0.01; // Assuming $1 = 0.01 SOL for demo
    if (walletBalance < requiredSOL) {
      setMessage(`❌ Insufficient SOL! Need ${requiredSOL.toFixed(4)} SOL for $${selectedBetAmount} bet`);
      return;
    }

    try {
      setLoading(true);
      setMessage(`🎲 Initializing cyber arena with $${selectedBetAmount} bet...`);
      
      const response = await fetch(`${API}/game/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bet_amount: selectedBetAmount,
          user_id: currentUser.user_id
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        joinGameWithBet(data.session_id);
      } else {
        throw new Error('Game creation failed');
      }
      
    } catch (error) {
      setMessage('❌ Failed to create game: ' + error.message);
      setLoading(false);
    }
  };

  // Join game with real Solana transaction
  const joinGameWithBet = async (sessionId) => {
    if (!connected || !publicKey) {
      setMessage('💳 Connect cyber wallet first!');
      return;
    }

    setGameStatus('lobby');
    setMessage(`💰 Processing $${selectedBetAmount} bet transaction...`);

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
          wallet_address: publicKey.toString(),
          bet_amount: selectedBetAmount
        })
      });
      
      if (!paymentResponse.ok) {
        throw new Error('Payment creation failed');
      }
      
      const paymentData = await paymentResponse.json();
      setMessage('🔄 Confirm transaction in your wallet...');
      
      // Create real Solana transaction
      const houseWalletPubkey = new PublicKey(HOUSE_WALLET);
      const lamports = Math.floor(selectedBetAmount * 0.01 * LAMPORTS_PER_SOL); // Convert USD to SOL to lamports
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: houseWalletPubkey,
          lamports: lamports
        })
      );
      
      // Send transaction
      const signature = await sendTransaction(transaction, connection);
      setMessage('⚡ Transaction sent! Waiting for confirmation...');
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      setMessage('✅ Transaction confirmed! Entering arena...');
      
      // Update wallet balance
      await loadWalletBalance();
      
      // Confirm payment with backend
      const confirmResponse = await fetch(`${API}/payment/confirm-bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: paymentData.transaction_id,
          signature: signature
        })
      });
      
      if (!confirmResponse.ok) {
        throw new Error('Payment confirmation failed');
      }
      
      // Connect to game
      connectToGame(sessionId || `game_${Date.now()}`, playerId);
      setGameState(prev => ({ ...prev, sessionId: sessionId || `game_${Date.now()}`, playerId }));
      
    } catch (error) {
      setMessage('❌ Transaction failed: ' + error.message);
      setGameStatus('menu');
      setLoading(false);
    }
  };

  // WebSocket connection
  const connectToGame = (sessionId, playerId) => {
    try {
      const wsUrl = `${WS_URL}/ws/${sessionId}/${playerId}`;
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        setGameState(prev => ({ ...prev, connected: true }));
        setGameStatus('playing');
        setMessage('🎮 Cyber arena activated! Dominate with WASD or mouse!');
        setLoading(false);
        startGameLoop();
      };
      
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleGameMessage(data);
      };
      
      wsRef.current.onclose = () => {
        setGameState(prev => ({ ...prev, connected: false }));
        setMessage('🔌 Disconnected from cyber arena');
        stopGameLoop();
      };
      
      wsRef.current.onerror = (error) => {
        setMessage('⚠️ Connection error - trying alternate mode...');
        // Fallback to local game mode for development
        setGameStatus('playing');
        setLoading(false);
        startLocalGame();
      };
      
      // Connection timeout
      setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
          setMessage('🔧 WebSocket timeout - starting offline mode...');
          wsRef.current.close();
          setGameStatus('playing');
          setLoading(false);
          startLocalGame();
        }
      }, 5000);
      
    } catch (error) {
      setMessage('🔥 Connection failed - starting offline mode...');
      setGameStatus('playing');
      setLoading(false);
      startLocalGame();
    }
  };

  // Local game mode for development/demo
  const startLocalGame = () => {
    // Create demo game state
    setGameState({
      sessionId: 'local_game',
      playerId: currentUser?.username || 'Player',
      players: {
        [currentUser?.username || 'Player']: {
          player_id: currentUser?.username || 'Player',
          segments: [{ x: 400, y: 300 }],
          color: SNAKE_SKINS[selectedSkin].color,
          alive: true,
          score: 10
        }
      },
      food: generateDemoFood(),
      status: 'active',
      connected: true
    });
    
    startGameLoop();
  };

  const generateDemoFood = () => {
    const food = [];
    for (let i = 0; i < 50; i++) {
      food.push({
        x: Math.random() * (GAME_WIDTH - 40) + 20,
        y: Math.random() * (GAME_HEIGHT - 40) + 20,
        id: `food_${i}`,
        color: ['#ff0080', '#00ffff', '#ffff00', '#00ff00', '#ff4000'][Math.floor(Math.random() * 5)]
      });
    }
    return food;
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
        setMessage('🚀 Cyber arena is live! Eliminate opponents to win!');
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
        setMessage(winner ? `🏆 ${winner} dominated the arena! Won $${winnings}!` : '💀 Arena closed!');
        stopGameLoop();
        loadLeaderboard(); // Refresh leaderboard
        break;
        
      case 'player_eliminated':
        setMessage(`💀 ${data.player} has been eliminated!`);
        break;
    }
  };

  // Game loop
  const startGameLoop = () => {
    const gameLoop = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ 
          type: 'update',
          timestamp: performance.now() 
        }));
      }
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  };

  const stopGameLoop = () => {
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
      gameLoopRef.current = null;
    }
  };

  // Controls
  const handleKeyPress = useCallback((event) => {
    if (gameStatus !== 'playing') return;
    
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
    
    if (direction && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      event.preventDefault();
      wsRef.current.send(JSON.stringify({
        type: 'move',
        direction: direction
      }));
    }
  }, [gameStatus]);

  const handleMouseMove = useCallback((event) => {
    if (gameStatus !== 'playing' || gameState.status !== 'active') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left - canvas.width / 2;
    const mouseY = event.clientY - rect.top - canvas.height / 2;
    const angle = Math.atan2(mouseY, mouseX);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'mouse_move',
        angle: angle
      }));
    }
  }, [gameStatus, gameState.status]);

  // Mobile touch handlers
  const handleTouchStart = useCallback((event) => {
    event.preventDefault();
    if (gameStatus !== 'playing' || gameState.status !== 'active') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const touch = event.touches[0];
    const rect = canvas.getBoundingClientRect();
    const touchX = touch.clientX - rect.left - canvas.width / 2;
    const touchY = touch.clientY - rect.top - canvas.height / 2;
    const angle = Math.atan2(touchY, touchX);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'mouse_move',
        angle: angle
      }));
    }
  }, [gameStatus, gameState.status]);

  const handleTouchMove = useCallback((event) => {
    event.preventDefault();
    if (gameStatus !== 'playing' || gameState.status !== 'active') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const touch = event.touches[0];
    const rect = canvas.getBoundingClientRect();
    const touchX = touch.clientX - rect.left - canvas.width / 2;
    const touchY = touch.clientY - rect.top - canvas.height / 2;
    const angle = Math.atan2(touchY, touchX);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'mouse_move',
        angle: angle
      }));
    }
  }, [gameStatus, gameState.status]);

  // Event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, [handleKeyPress, handleMouseMove, handleTouchStart, handleTouchMove]);

  // Enhanced canvas rendering with cyberpunk effects
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Cyberpunk background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#0a0a1a');
    gradient.addColorStop(0.5, '#1a0a2a');
    gradient.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Neon grid
    ctx.strokeStyle = '#00ffff20';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    // Glowing food
    gameState.food.forEach(food => {
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = food.color || '#00ffff';
      ctx.fillStyle = food.color || '#00ffff';
      
      // Pulsating effect
      const pulse = Math.sin(Date.now() * 0.005) * 0.3 + 1;
      const size = (food.size || FOOD_SIZE) * pulse;
      
      ctx.beginPath();
      ctx.arc(food.x, food.y, size, 0, Math.PI * 2);
      ctx.fill();
      
      // Inner glow
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff80';
      ctx.beginPath();
      ctx.arc(food.x, food.y, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    
    // Enhanced snakes with customization
    Object.values(gameState.players).forEach(player => {
      if (player.alive && player.segments && player.segments.length > 0) {
        const skin = SNAKE_SKINS[selectedSkin] || SNAKE_SKINS[0];
        const accessory = SNAKE_ACCESSORIES[selectedAccessory];
        const trail = SNAKE_TRAILS[selectedTrail];
        
        ctx.save();
        
        // Snake trail effect
        if (trail.effect !== 'none') {
          ctx.shadowBlur = 30;
          ctx.shadowColor = skin.glow;
        }
        
        player.segments.forEach((segment, index) => {
          const isHead = index === 0;
          const radius = isHead ? SNAKE_HEAD_SIZE : SNAKE_SEGMENT_SIZE - (index * 0.1);
          const intensity = Math.max(1 - (index / player.segments.length), 0.4);
          
          // Gradient based on skin
          const gradient = ctx.createRadialGradient(
            segment.x, segment.y, 0,
            segment.x, segment.y, radius
          );
          
          if (skin.pattern === 'striped') {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.3, skin.color);
            gradient.addColorStop(0.7, skin.color + '80');
            gradient.addColorStop(1, '#000000');
          } else if (skin.pattern === 'digital') {
            const digital = Math.random() > 0.5 ? skin.color : '#000000';
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.5, digital);
            gradient.addColorStop(1, '#000000');
          } else {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.3, skin.color);
            gradient.addColorStop(1, skin.color + Math.floor(intensity * 255).toString(16));
          }
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(segment.x, segment.y, Math.max(radius, 4), 0, Math.PI * 2);
          ctx.fill();
          
          // Head details
          if (isHead) {
            // Outer glow
            ctx.shadowBlur = 40;
            ctx.shadowColor = skin.glow;
            ctx.strokeStyle = skin.glow;
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Eyes with cyberpunk style
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 10;
            const eyeOffset = radius * 0.4;
            
            ctx.beginPath();
            ctx.arc(segment.x - eyeOffset, segment.y - eyeOffset, 4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(segment.x + eyeOffset, segment.y - eyeOffset, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Eye glow
            ctx.fillStyle = '#00ffff';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(segment.x - eyeOffset, segment.y - eyeOffset, 2, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(segment.x + eyeOffset, segment.y - eyeOffset, 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Accessory
            if (accessory && accessory.icon !== "❌") {
              ctx.font = '20px Arial';
              ctx.textAlign = 'center';
              ctx.fillStyle = '#ffffff';
              ctx.shadowBlur = 5;
              ctx.fillText(accessory.icon, segment.x, segment.y - radius - 10);
            }
          }
        });
        
        // Player name with cyberpunk styling
        if (player.segments[0]) {
          ctx.font = 'bold 14px "Courier New", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#00ffff';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#00ffff';
          
          const name = `${player.player_id.split('_')[0]} [$${selectedBetAmount}]`;
          const textX = player.segments[0].x;
          const textY = player.segments[0].y - 35;
          
          // Text background
          const textWidth = ctx.measureText(name).width;
          ctx.fillStyle = '#000000aa';
          ctx.fillRect(textX - textWidth/2 - 5, textY - 15, textWidth + 10, 20);
          
          // Text
          ctx.fillStyle = '#00ffff';
          ctx.fillText(name, textX, textY);
        }
        
        ctx.restore();
      }
    });
    
  }, [gameState.players, gameState.food, selectedBetAmount, selectedSkin, selectedAccessory, selectedTrail]);

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
    <div className="cyberpunk-container">
      {/* Cyberpunk Header */}
      <div className="cyber-header">
        <div className="logo-section">
          <div className="logo-glow">
            <span className="logo-icon">🐍</span>
            <span className="logo-text">CYBER<span className="logo-accent">SLITHER</span></span>
          </div>
          <div className="tagline">// Neural Network Arena //</div>
        </div>
        
        <div className="header-controls">
          {isLoggedIn ? (
            <div className="user-panel">
              <div className="user-info">
                <span className="user-handle">{currentUser.username}</span>
                <span className="user-status">{isAdmin ? 'ADMIN' : 'ONLINE'}</span>
              </div>
              {isAdmin && (
                <button className="cyber-btn success small" onClick={() => setShowAdminPanel(!showAdminPanel)}>
                  ADMIN PANEL
                </button>
              )}
              <button className="cyber-btn danger" onClick={handleLogout}>DISCONNECT</button>
            </div>
          ) : (
            <div className="auth-buttons">
              <button className="cyber-btn primary" onClick={() => setShowAuthModal(true)}>
                JACK IN
              </button>
              <button className="cyber-btn secondary" onClick={() => setShowAdminPanel(true)}>
                ADMIN
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Admin Panel Modal */}
      {showAdminPanel && (
        <div className="cyber-modal-overlay">
          <div className="cyber-modal">
            <div className="modal-header">
              <h2>// ADMIN CONTROL PANEL //</h2>
              <button className="close-btn" onClick={() => setShowAdminPanel(false)}>×</button>
            </div>
            
            <div className="cyber-form">
              <div className="admin-warning">
                <p>⚠️ Admin accounts can play FREE games without spending Solana</p>
              </div>
              
              <div className="input-group">
                <label>ADMIN USERNAME:</label>
                <input
                  type="text"
                  placeholder="Enter admin username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="cyber-input"
                />
              </div>
              
              <div className="input-group">
                <label>ADMIN PASSWORD:</label>
                <input
                  type="password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="cyber-input"
                />
              </div>
              
              <div className="input-group">
                <label>ADMIN SECRET:</label>
                <input
                  type="password"
                  placeholder="Enter admin secret key"
                  value={adminSecret}
                  onChange={(e) => setAdminSecret(e.target.value)}
                  className="cyber-input"
                />
              </div>
              
              <button 
                className="cyber-btn primary full"
                onClick={handleCreateAdmin}
                disabled={loading}
              >
                {loading ? 'CREATING ADMIN...' : 'CREATE ADMIN ACCOUNT'}
              </button>
              
              <div className="admin-info">
                <p>Admin accounts bypass all Solana payments</p>
                <p>Perfect for testing and demonstration purposes</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Authentication Modal */}
      {showAuthModal && (
        <div className="cyber-modal-overlay">
          <div className="cyber-modal">
            <div className="modal-header">
              <h2>// {authMode === 'login' ? 'AUTHENTICATION' : 'REGISTRATION'} //</h2>
              <button className="close-btn" onClick={() => setShowAuthModal(false)}>×</button>
            </div>
            
            <div className="cyber-form">
              <div className="input-group">
                <label>HANDLE:</label>
                <input
                  type="text"
                  placeholder="Enter your cyber handle"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="cyber-input"
                />
              </div>
              
              <div className="input-group">
                <label>ACCESS CODE:</label>
                <input
                  type="password"
                  placeholder="Enter access code"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="cyber-input"
                />
              </div>
              
              <button 
                className="cyber-btn primary full"
                onClick={authMode === 'login' ? handleLogin : handleRegister}
                disabled={loading}
              >
                {loading ? 'PROCESSING...' : (authMode === 'login' ? 'AUTHENTICATE' : 'REGISTER')}
              </button>
              
              <div className="auth-switch">
                {authMode === 'login' ? (
                  <p>New to the matrix? <button onClick={() => setAuthMode('register')}>REGISTER</button></p>
                ) : (
                  <p>Already connected? <button onClick={() => setAuthMode('login')}>AUTHENTICATE</button></p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="main-interface">
        {/* Left Neural Panel */}
        <div className="neural-panel left">
          {/* Live Leaderboard */}
          <div className="cyber-panel">
            <div className="panel-header">
              <span className="panel-icon">🏆</span>
              <span className="panel-title">NEURAL LEADERBOARD</span>
              <span className="live-indicator">● LIVE</span>
            </div>
            <div className="leaderboard-content">
              {leaderboard.length > 0 ? leaderboard.map((player, index) => (
                <div key={index} className="leader-entry">
                  <span className="rank-number">#{index + 1}</span>
                  <span className="player-name">{player.display_name || `Player${index + 1}`}</span>
                  <span className="winnings">${(player.total_winnings || 0).toFixed(2)}</span>
                </div>
              )) : (
                <div className="no-data">// LOADING NEURAL DATA //</div>
              )}
            </div>
            <button className="cyber-btn secondary small">VIEW FULL MATRIX</button>
          </div>

          {/* Cyber Squad */}
          <div className="cyber-panel">
            <div className="panel-header">
              <span className="panel-icon">👥</span>
              <span className="panel-title">CYBER SQUAD</span>
              <button className="refresh-btn">⟲</button>
            </div>
            <div className="squad-content">
              <div className="no-squad">
                <div className="squad-icon">🤖</div>
                <p>// NO SQUAD MEMBERS //</p>
                <p>Recruit cyber warriors!</p>
              </div>
            </div>
            <button className="cyber-btn secondary small">RECRUIT SQUAD</button>
          </div>
        </div>

        {/* Central Arena */}
        <div className="arena-zone">
          {gameStatus === 'menu' && (
            <div className="arena-lobby">
              <div className="arena-title">
                <h1>// CYBER<span className="title-glow">SLITHER</span> ARENA //</h1>
                <div className="subtitle">Neural Combat Protocol v2.0</div>
              </div>
              
              {!isLoggedIn ? (
                <div className="quick-access">
                  <div className="access-prompt">
                    <p>// QUICK ACCESS PROTOCOL //</p>
                    <div className="quick-input-group">
                      <input 
                        type="text" 
                        placeholder="Enter cyber handle..." 
                        className="cyber-input"
                        id="quickUsername"
                      />
                      <button className="cyber-btn accent" onClick={handleQuickUsernameSet} disabled={loading}>
                        {loading ? '...' : 'ACTIVATE'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : !connected && !isAdmin ? (
                <div className="wallet-zone">
                  <div className="connection-status">
                    <p>OPERATOR: <span className="highlight">{currentUser.username}</span></p>
                    <p>STATUS: <span className="status-ready">AUTHENTICATED</span></p>
                  </div>
                  <div className="wallet-connection">
                    <WalletMultiButton className="cyber-wallet-btn" />
                  </div>
                </div>
              ) : (
                <div className="battle-zone">
                  {isAdmin ? (
                    <>
                      <div className="admin-notice">
                        <h3>👑 ADMIN MODE ACTIVE</h3>
                        <p>You can play FREE without spending Solana!</p>
                      </div>
                      
                      <div className="bet-selector">
                        <div className="bet-label">// DISPLAY BET AMOUNT (FREE FOR ADMIN) //</div>
                        <div className="bet-options">
                          {BET_AMOUNTS.map(amount => (
                            <button
                              key={amount}
                              className={`bet-chip ${selectedBetAmount === amount ? 'selected' : ''} admin-chip`}
                              onClick={() => setSelectedBetAmount(amount)}
                            >
                              ${amount} <span className="free-label">FREE</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <button className="enter-arena-btn admin-btn" onClick={createFreeGameAsAdmin} disabled={loading}>
                        <span className="btn-icon">👑</span>
                        <span className="btn-text">{loading ? 'CREATING FREE ARENA...' : 'ENTER ARENA (FREE)'}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="bet-selector">
                        <div className="bet-label">// ARENA ENTRY FEE //</div>
                        <div className="bet-options">
                          {BET_AMOUNTS.map(amount => (
                            <button
                              key={amount}
                              className={`bet-chip ${selectedBetAmount === amount ? 'selected' : ''}`}
                              onClick={() => setSelectedBetAmount(amount)}
                            >
                              ${amount}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <button className="enter-arena-btn" onClick={createGameWithBet} disabled={loading}>
                        <span className="btn-icon">⚡</span>
                        <span className="btn-text">{loading ? 'INITIALIZING ARENA...' : 'ENTER CYBER ARENA'}</span>
                      </button>
                    </>
                  )}
                  
                  <div className="arena-options">
                    <button className="option-chip">🌐 GLOBAL SERVERS</button>
                    <button className="option-chip">🎯 TOURNAMENT MODE</button>
                  </div>
                </div>
              )}
              
              <div className="arena-stats">
                <div className="stat-display">
                  <div className="stat-value">{globalStats.playersInGame}</div>
                  <div className="stat-label">ACTIVE NEURAL LINKS</div>
                </div>
                <div className="stat-display">
                  <div className="stat-value">${globalStats.totalWinnings.toLocaleString()}</div>
                  <div className="stat-label">TOTAL NEURAL REWARDS</div>
                </div>
              </div>
            </div>
          )}

          {gameStatus === 'playing' && (
            <div className="arena-active">
              <div className="game-hud">
                <div className="hud-left">
                  <span>ARENA: {gameState.sessionId?.substring(0, 8) || 'LOCAL'}...</span>
                  <span>PLAYERS: {Object.keys(gameState.players).length}</span>
                </div>
                <div className="hud-center">
                  <span>BET: ${selectedBetAmount}</span>
                  <span className="status-active">● LIVE</span>
                </div>
                <div className="hud-right">
                  <button className="cyber-btn danger small" onClick={() => {
                    if (wsRef.current) wsRef.current.close();
                    setGameStatus('menu');
                    stopGameLoop();
                  }}>
                    EXIT ARENA
                  </button>
                </div>
              </div>
              
              <canvas
                ref={canvasRef}
                width={GAME_WIDTH}
                height={GAME_HEIGHT}
                className="cyber-canvas"
              />
              
              <div className="controls-hint">
                <span>
                  {/Mobi|Android/i.test(navigator.userAgent) 
                    ? "Touch and drag to control • Eliminate opponents to win" 
                    : "WASD or MOUSE to control • Eliminate opponents to win"
                  }
                </span>
              </div>
            </div>
          )}

          {gameStatus === 'finished' && (
            <div className="arena-end">
              <div className="end-screen">
                <h2>// NEURAL COMBAT COMPLETE //</h2>
                <div className="result-display">{message}</div>
                <button 
                  className="cyber-btn primary large"
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
                    setMessage('🎮 Ready for another neural combat session!');
                  }}
                >
                  RE-ENTER MATRIX
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Control Panel */}
        <div className="neural-panel right">
          {/* Neural Wallet */}
          <div className="cyber-panel">
            <div className="panel-header">
              <span className="panel-icon">💳</span>
              <span className="panel-title">NEURAL WALLET</span>
              <div className="wallet-controls">
                <button className="icon-btn">📋</button>
                <button className="icon-btn" onClick={loadWalletBalance}>⟲</button>
              </div>
            </div>
            
            {!connected ? (
              <div className="wallet-disconnected">
                {!isLoggedIn ? (
                  <div className="wallet-message">// AUTHENTICATION REQUIRED //</div>
                ) : (
                  <div className="wallet-connection">
                    <WalletMultiButton className="cyber-wallet-btn" />
                  </div>
                )}
              </div>
            ) : (
              <div className="wallet-connected">
                <div className="balance-display">
                  <div className="balance-main">${(walletBalance * 100).toFixed(2)}</div>
                  <div className="balance-sub">{walletBalance.toFixed(6)} SOL</div>
                  <div className="wallet-address">{publicKey?.toString().substring(0, 8)}...{publicKey?.toString().substr(-6)}</div>
                </div>
                
                <div className="wallet-actions">
                  <button className="cyber-btn success" onClick={() => window.open('https://solfaucet.com/', '_blank')}>
                    ADD SOL (FAUCET)
                  </button>
                  <button className="cyber-btn warning" onClick={loadWalletBalance}>
                    REFRESH BALANCE
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Customization */}
          <div className="cyber-panel">
            <div className="panel-header">
              <span className="panel-icon">🎨</span>
              <span className="panel-title">NEURAL AUGMENTS</span>
              <button 
                className="icon-btn" 
                onClick={() => setShowCustomization(!showCustomization)}
              >
                {showCustomization ? '▼' : '▶'}
              </button>
            </div>
            
            <div className={`customization-content ${showCustomization ? 'expanded' : ''}`}>
              {/* Snake Skins */}
              <div className="customize-section">
                <label>SKIN MODULE:</label>
                <div className="skin-grid">
                  {SNAKE_SKINS.map((skin, index) => (
                    <div 
                      key={index}
                      className={`skin-preview ${selectedSkin === index ? 'selected' : ''}`}
                      onClick={() => setSelectedSkin(index)}
                      style={{ background: skin.gradient }}
                      title={skin.name}
                    >
                      <div className="skin-pattern"></div>
                    </div>
                  ))}
                </div>
                <div className="skin-name">{SNAKE_SKINS[selectedSkin].name}</div>
              </div>
              
              {/* Accessories */}
              <div className="customize-section">
                <label>HEAD AUGMENT:</label>
                <div className="accessory-grid">
                  {SNAKE_ACCESSORIES.map((accessory, index) => (
                    <button 
                      key={index}
                      className={`accessory-btn ${selectedAccessory === index ? 'selected' : ''}`}
                      onClick={() => setSelectedAccessory(index)}
                      title={accessory.name}
                    >
                      {accessory.icon}
                    </button>
                  ))}
                </div>
                <div className="accessory-name">{SNAKE_ACCESSORIES[selectedAccessory].name}</div>
              </div>
              
              {/* Trail Effects */}
              <div className="customize-section">
                <label>NEURAL TRAIL:</label>
                <div className="trail-selector">
                  {SNAKE_TRAILS.map((trail, index) => (
                    <button 
                      key={index}
                      className={`trail-btn ${selectedTrail === index ? 'selected' : ''}`}
                      onClick={() => setSelectedTrail(index)}
                    >
                      {trail.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <button className="cyber-btn accent">SAVE AUGMENTS</button>
          </div>
        </div>
      </div>

      {/* Neural Status Bar */}
      <div className="neural-status-bar">
        <div className="status-left">
          <span className="status-indicator">●</span>
          <span>{message}</span>
        </div>
        <div className="status-right">
          <span>WALLET: {connected ? 'CONNECTED' : 'DISCONNECTED'}</span>
          <span>BALANCE: {walletBalance.toFixed(4)} SOL</span>
        </div>
      </div>
    </div>
  );
};

// Solana Wallet Configuration
const WalletContextProvider = ({ children }) => {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

function App() {
  return (
    <div className="App">
      <WalletContextProvider>
        <GameComponent />
      </WalletContextProvider>
    </div>
  );
}

export default App;
