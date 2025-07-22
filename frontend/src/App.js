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

// Enhanced Slither.io Game Constants - AUTHENTIC MAP SIZE
const WORLD_RADIUS = 6000; // Large circular world like original slither.io
const VIEWPORT_WIDTH = 1200;
const VIEWPORT_HEIGHT = 700;
const MINIMAP_SIZE = 150; // Minimap in bottom-right corner

// Mobile responsive canvas sizing
const getCanvasSize = () => {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    const width = Math.min(window.innerWidth - 40, 800);
    const height = Math.min(window.innerHeight * 0.6, 500);
    return { width, height };
  }
  return { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT };
};

// Enhanced Game Physics Constants
const FOOD_SIZE = 8;
const SNAKE_SEGMENT_SIZE = 10;
const SNAKE_HEAD_SIZE = 16;
const BASE_SPEED = 3.5;
const MIN_SPEED = 2.0;
const BOOST_SPEED_MULTIPLIER = 1.8;
const MASS_SPEED_FACTOR = 0.02; // Larger snakes are slower

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

// NEW SLITHER.IO CONSTANTS
const GAME_SERVERS = [
  { name: "US East", flag: "🇺🇸", ping: 25, players: 142 },
  { name: "US West", flag: "🇺🇸", ping: 45, players: 98 },
  { name: "Europe", flag: "🇪🇺", ping: 78, players: 203 },
  { name: "Asia", flag: "🌏", ping: 120, players: 186 },
  { name: "Australia", flag: "🇦🇺", ping: 95, players: 54 }
];

const SPECIAL_CODES = {
  'CYBERPUNK2025': { reward: 'skin', skinId: 6, name: 'Quantum Serpent' },
  'NEONVIBES': { reward: 'skin', skinId: 7, name: 'RGB Dragon' },
  'MATRIXMODE': { reward: 'skin', skinId: 8, name: 'Digital Ghost' },
  'SLITHERKING': { reward: 'accessory', accessoryId: 6, name: 'Golden Crown' },
  'BOOSTMASTER': { reward: 'trail', trailId: 6, name: 'Lightning Bolt' }
};

// Add new skins for codes
const ADDITIONAL_SKINS = [
  { 
    name: "Quantum Serpent", 
    color: "#ff00ff", 
    gradient: "linear-gradient(45deg, #ff00ff, #00ffff)",
    glow: "#ff00ff",
    pattern: "quantum"
  },
  { 
    name: "RGB Dragon", 
    color: "#ffffff", 
    gradient: "linear-gradient(45deg, #ff0000, #00ff00, #0000ff)",
    glow: "#ffffff",
    pattern: "rgb"
  },
  { 
    name: "Digital Ghost", 
    color: "#80ff80", 
    gradient: "linear-gradient(45deg, #80ff80, #40ff40)",
    glow: "#80ff80",
    pattern: "ghost"
  }
];

// Combine all skins
const ALL_SKINS = [...SNAKE_SKINS, ...ADDITIONAL_SKINS];

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
  
  // Real Game Data and Effects
  const [userAccount, setUserAccount] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [globalStats, setGlobalStats] = useState({
    totalWinnings: 0,
    playersInGame: 0
  });
  const [particles, setParticles] = useState([]); // For eating effects

  // NEW SLITHER.IO FEATURES
  const [isBoosting, setIsBoosting] = useState(false);
  const [boostCooldown, setBoostCooldown] = useState(0);
  const [victoryMessage, setVictoryMessage] = useState('');
  const [showVictoryModal, setShowVictoryModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState('US East');
  const [showServerSelection, setShowServerSelection] = useState(false);
  const [codeEntry, setCodeEntry] = useState('');
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [unlockedSkins, setUnlockedSkins] = useState([0, 1, 2]); // Default unlocked skins
  const [showPlayButton, setShowPlayButton] = useState(true);
  const [deathEffects, setDeathEffects] = useState([]);
  const [trailParticles, setTrailParticles] = useState([]);

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

  // Initialize unlocked skins from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('unlockedSkins');
    if (saved) {
      setUnlockedSkins(JSON.parse(saved));
    }
  }, []);

  // Load real leaderboard data with enhanced length-based scoring
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
      // Fallback data with length-based scores like slither.io
      setLeaderboard([
        { display_name: "CyberViper", total_winnings: 1337.42, max_length: 2847 },
        { display_name: "NeonHunter", total_winnings: 892.15, max_length: 1923 },
        { display_name: "MatrixSlayer", total_winnings: 665.88, max_length: 1654 },
        { display_name: "QuantumSerpent", total_winnings: 443.22, max_length: 1432 },
        { display_name: "DigitalDragon", total_winnings: 321.15, max_length: 1298 }
      ]);
      setGlobalStats({ totalWinnings: 25420, playersInGame: 8 });
    }
  };

  // Cooldown reducer effect
  useEffect(() => {
    if (boostCooldown > 0) {
      const timer = setTimeout(() => setBoostCooldown(prev => prev - 1), 50);
      return () => clearTimeout(timer);
    }
  }, [boostCooldown]);

  // CODE ENTRY SYSTEM
  const handleCodeSubmit = () => {
    const code = codeEntry.toUpperCase().trim();
    
    if (SPECIAL_CODES[code]) {
      const reward = SPECIAL_CODES[code];
      
      if (reward.reward === 'skin' && !unlockedSkins.includes(reward.skinId)) {
        setUnlockedSkins(prev => [...prev, reward.skinId]);
        setMessage(`🎉 Unlocked ${reward.name} skin!`);
        localStorage.setItem('unlockedSkins', JSON.stringify([...unlockedSkins, reward.skinId]));
      } else if (reward.reward === 'accessory') {
        setMessage(`🎉 Unlocked ${reward.name} accessory!`);
      } else if (reward.reward === 'trail') {
        setMessage(`🎉 Unlocked ${reward.name} trail effect!`);
      } else {
        setMessage('⚠️ Reward already unlocked!');
      }
    } else {
      setMessage('❌ Invalid code. Try: CYBERPUNK2025, NEONVIBES, MATRIXMODE');
    }
    
    setCodeEntry('');
    setShowCodeModal(false);
  };

  // DEATH SYSTEM with Victory Message
  const handlePlayerDeath = useCallback((playerId, cause) => {
    // Create death explosion effect
    const player = gameState.players[playerId];
    if (player && player.segments[0]) {
      const deathEffect = {
        x: player.segments[0].x,
        y: player.segments[0].y,
        particles: [],
        life: 60,
        maxLife: 60
      };
      
      // Create explosion particles
      for (let i = 0; i < 20; i++) {
        deathEffect.particles.push({
          x: player.segments[0].x,
          y: player.segments[0].y,
          vx: (Math.random() - 0.5) * 20,
          vy: (Math.random() - 0.5) * 20,
          color: player.color,
          size: 8,
          life: 40
        });
      }
      
      setDeathEffects(prev => [...prev, deathEffect]);
    }
    
    // Show victory message modal for the eliminated player
    if (playerId === (currentUser?.username || 'Player')) {
      setShowVictoryModal(true);
    }
  }, [gameState.players, currentUser]);

  // Save victory message
  const saveVictoryMessage = () => {
    if (victoryMessage.trim()) {
      localStorage.setItem('victoryMessage', victoryMessage.trim());
      setMessage(`💬 Victory message saved: "${victoryMessage.trim()}"`);
    }
    setShowVictoryModal(false);
    setVictoryMessage('');
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

  // Check for saved user and setup resize handler
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

    // Handle canvas resize for mobile
    const handleResize = () => {
      setCanvasSize(getCanvasSize());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
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

  // Local game mode with proper slither.io mechanics
  const startLocalGame = () => {
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const playerName = currentUser?.username || 'Player';
    
    // Create proper slither.io game state
    setGameState({
      sessionId: 'local_game',
      playerId: playerName,
      players: {
        [playerName]: {
          player_id: playerName,
          segments: initializeSnakeSegments({ x: centerX, y: centerY }),
          color: SNAKE_SKINS[selectedSkin].color,
          alive: true,
          score: 15,
          targetAngle: 0,
          currentAngle: 0,
          speed: 3
        },
        'DemoBot1': {
          player_id: 'DemoBot1',
          segments: initializeSnakeSegments({ 
            x: centerX - 200, 
            y: centerY - 100 
          }),
          color: '#ff0080',
          alive: true,
          score: 15,
          targetAngle: Math.PI / 4,
          currentAngle: Math.PI / 4,
          speed: 2.5
        },
        'DemoBot2': {
          player_id: 'DemoBot2',
          segments: initializeSnakeSegments({ 
            x: centerX + 200, 
            y: centerY + 100 
          }),
          color: '#00ff00',
          alive: true,
          score: 15,
          targetAngle: -Math.PI / 4,
          currentAngle: -Math.PI / 4,
          speed: 2.8
        }
      },
      food: generateDemoFood(),
      status: 'active',
      connected: true
    });
    
    startDemoGameLoop();
  };

  const generateDemoFood = () => {
    const food = [];
    const maxFood = Math.floor(canvasSize.width * canvasSize.height / 8000); // More food for slither.io style
    
    for (let i = 0; i < maxFood; i++) {
      food.push({
        x: Math.random() * (canvasSize.width - 60) + 30,
        y: Math.random() * (canvasSize.height - 60) + 30,
        id: `food_${i}`,
        color: ['#ff0080', '#00ffff', '#ffff00', '#00ff00', '#ff4000', '#8000ff'][Math.floor(Math.random() * 6)],
        size: 3 + Math.random() * 5 // Variable food sizes like slither.io
      });
    }
    return food;
  };

  // Enhanced game loop with proper slither.io mechanics
  const startDemoGameLoop = () => {
    let lastTime = 0;
    const targetFPS = 60; // Higher FPS for smooth movement
    const frameTime = 1000 / targetFPS;

    const gameLoop = (currentTime) => {
      if (currentTime - lastTime >= frameTime) {
        updateSlitherGame();
        lastTime = currentTime;
      }
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  };

  // Proper slither.io game mechanics
  const updateSlitherGame = () => {
    setGameState(prevState => {
      const newPlayers = { ...prevState.players };
      let newFood = [...prevState.food];
      const playerName = currentUser?.username || 'Player';
      
      // Update each snake
      Object.keys(newPlayers).forEach(playerId => {
        const snake = newPlayers[playerId];
        if (!snake.alive) return;
        
        // Initialize snake properties if needed
        if (!snake.targetAngle) snake.targetAngle = 0;
        if (!snake.currentAngle) snake.currentAngle = 0;
        if (!snake.speed) snake.speed = 3;
        if (!snake.segments) snake.segments = initializeSnakeSegments(snake);
        
        // Smooth angle interpolation for realistic movement
        const angleDiff = snake.targetAngle - snake.currentAngle;
        let smoothAngle = angleDiff;
        
        // Handle angle wrapping
        if (smoothAngle > Math.PI) smoothAngle -= 2 * Math.PI;
        if (smoothAngle < -Math.PI) smoothAngle += 2 * Math.PI;
        
        // Apply smooth rotation
        snake.currentAngle += smoothAngle * 0.1; // Rotation smoothing factor
        
        // Move snake head based on angle
        const newHead = {
          x: snake.segments[0].x + Math.cos(snake.currentAngle) * snake.speed,
          y: snake.segments[0].y + Math.sin(snake.currentAngle) * snake.speed
        };
        
        // Wrap around screen edges
        if (newHead.x < 0) newHead.x = canvasSize.width;
        if (newHead.x > canvasSize.width) newHead.x = 0;
        if (newHead.y < 0) newHead.y = canvasSize.height;
        if (newHead.y > canvasSize.height) newHead.y = 0;
        
        // Update snake segments to follow head properly
        const newSegments = [newHead];
        const segmentDistance = 12; // Distance between segments
        
        for (let i = 1; i < snake.segments.length; i++) {
          const prevSegment = newSegments[i - 1];
          const currentSegment = snake.segments[i];
          
          // Calculate distance between segments
          const dx = prevSegment.x - currentSegment.x;
          const dy = prevSegment.y - currentSegment.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > segmentDistance) {
            // Move segment toward previous segment
            const angle = Math.atan2(dy, dx);
            newSegments.push({
              x: prevSegment.x - Math.cos(angle) * segmentDistance,
              y: prevSegment.y - Math.sin(angle) * segmentDistance
            });
          } else {
            // Keep segment in same position
            newSegments.push({ ...currentSegment });
          }
        }
        
        // Food collision detection
        let ateFood = false;
        newFood = newFood.filter(food => {
          const distance = Math.sqrt(
            Math.pow(newHead.x - food.x, 2) + Math.pow(newHead.y - food.y, 2)
          );
          
          if (distance < 20) { // Food collision radius
            ateFood = true;
            
            if (playerId === playerName) {
              setMessage(`🍎 Food consumed! Growing stronger...`);
              
              // Create eating particles
              const newParticles = [];
              for (let i = 0; i < 6; i++) {
                newParticles.push({
                  x: food.x,
                  y: food.y,
                  vx: (Math.random() - 0.5) * 8,
                  vy: (Math.random() - 0.5) * 8,
                  color: food.color,
                  life: 25,
                  maxLife: 25,
                  size: 4
                });
              }
              setParticles(prev => [...prev, ...newParticles]);
            }
            
            return false; // Remove food
          }
          return true;
        });
        
        // Grow snake when food is eaten
        if (ateFood) {
          // Add new segments to the tail
          const tailSegment = newSegments[newSegments.length - 1];
          const secondToLast = newSegments[newSegments.length - 2] || tailSegment;
          
          // Calculate direction from second-to-last to last segment
          const dx = tailSegment.x - secondToLast.x;
          const dy = tailSegment.y - secondToLast.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0) {
            const normalizedDx = dx / distance;
            const normalizedDy = dy / distance;
            
            // Add 2 new segments for noticeable growth
            newSegments.push({
              x: tailSegment.x + normalizedDx * segmentDistance,
              y: tailSegment.y + normalizedDy * segmentDistance
            });
            newSegments.push({
              x: tailSegment.x + normalizedDx * segmentDistance * 2,
              y: tailSegment.y + normalizedDy * segmentDistance * 2
            });
          }
          
          snake.score = (snake.score || 15) + 5;
        }
        
        // Snake-to-snake collision detection with death handler
        Object.keys(newPlayers).forEach(otherPlayerId => {
          if (otherPlayerId === playerId) return;
          
          const otherSnake = newPlayers[otherPlayerId];
          if (!otherSnake.alive || !otherSnake.segments) return;
          
          // Check collision with other snake's body (excluding head-to-head)
          otherSnake.segments.forEach((segment, index) => {
            const distance = Math.sqrt(
              Math.pow(newHead.x - segment.x, 2) + Math.pow(newHead.y - segment.y, 2)
            );
            
            if (distance < 15) { // Collision radius
              snake.alive = false;
              handlePlayerDeath(playerId, `Crashed into ${otherPlayerId}`);
              
              if (playerId === playerName) {
                setMessage(`💀 Crashed into ${otherPlayerId}! Length: ${snake.segments.length}`);
              }
              
              // Convert dead snake to food
              const deadSnakeFood = snake.segments.map((segment, i) => ({
                x: segment.x + (Math.random() - 0.5) * 15,
                y: segment.y + (Math.random() - 0.5) * 15,
                id: `dead_${playerId}_${i}_${Date.now()}`,
                color: snake.color,
                size: 8
              }));
              
              newFood = [...newFood, ...deadSnakeFood];
            }
          });
        });
        
        // Self-collision detection with death handler
        if (newSegments.length > 5) {
          for (let i = 4; i < newSegments.length; i++) {
            const distance = Math.sqrt(
              Math.pow(newHead.x - newSegments[i].x, 2) + Math.pow(newHead.y - newSegments[i].y, 2)
            );
            
            if (distance < 12) {
              snake.alive = false;
              handlePlayerDeath(playerId, 'Self collision');
              if (playerId === playerName) {
                setMessage(`💀 You hit yourself! Final length: ${newSegments.length}`);
              }
              break;
            }
          }
        }
        
        // AI behavior for demo bots
        if (playerId !== playerName && Math.random() < 0.005) {
          // Find nearest food
          let nearestFood = null;
          let nearestDistance = Infinity;
          
          newFood.forEach(food => {
            const distance = Math.sqrt(
              Math.pow(newHead.x - food.x, 2) + Math.pow(newHead.y - food.y, 2)
            );
            if (distance < nearestDistance) {
              nearestDistance = distance;
              nearestFood = food;
            }
          });
          
          if (nearestFood) {
            snake.targetAngle = Math.atan2(
              nearestFood.y - newHead.y,
              nearestFood.x - newHead.x
            );
          } else {
            // Random movement
            snake.targetAngle = Math.random() * Math.PI * 2;
          }
        }
        
        newPlayers[playerId] = {
          ...snake,
          segments: newSegments
        };
      });
      
      // Maintain food supply
      while (newFood.length < Math.floor(canvasSize.width * canvasSize.height / 8000)) {
        newFood.push({
          x: Math.random() * (canvasSize.width - 60) + 30,
          y: Math.random() * (canvasSize.height - 60) + 30,
          id: `food_${Date.now()}_${Math.random()}`,
          color: ['#ff0080', '#00ffff', '#ffff00', '#00ff00', '#ff4000', '#8000ff'][Math.floor(Math.random() * 6)],
          size: 4 + Math.random() * 4
        });
      }
      
      // Respawn AI bots
      const alivePlayers = Object.values(newPlayers).filter(p => p.alive).length;
      if (alivePlayers < 3) {
        ['DemoBot1', 'DemoBot2'].forEach(botId => {
          if (!newPlayers[botId] || !newPlayers[botId].alive) {
            if (Math.random() < 0.008) { // Respawn chance
              const spawnX = Math.random() * canvasSize.width;
              const spawnY = Math.random() * canvasSize.height;
              
              newPlayers[botId] = {
                player_id: botId,
                segments: initializeSnakeSegments({
                  x: spawnX,
                  y: spawnY
                }),
                color: botId === 'DemoBot1' ? '#ff0080' : '#00ff00',
                alive: true,
                score: 15,
                targetAngle: Math.random() * Math.PI * 2,
                currentAngle: Math.random() * Math.PI * 2,
                speed: 2.5 + Math.random()
              };
            }
          }
        });
      }
      
      // Update particles (eating effects, boost trails, death effects)
      setParticles(prevParticles => {
        return prevParticles
          .map(particle => ({
            ...particle,
            x: particle.x + particle.vx,
            y: particle.y + particle.vy,
            life: particle.life - 1,
            vx: particle.vx * 0.96,
            vy: particle.vy * 0.96
          }))
          .filter(particle => particle.life > 0);
      });
      
      // Update trail particles (for boost effects)
      setTrailParticles(prevTrails => {
        return prevTrails
          .map(particle => ({
            ...particle,
            x: particle.x + particle.vx,
            y: particle.y + particle.vy,
            life: particle.life - 1,
            vx: particle.vx * 0.92,
            vy: particle.vy * 0.92
          }))
          .filter(particle => particle.life > 0);
      });
      
      // Update death effects
      setDeathEffects(prevEffects => {
        return prevEffects
          .map(effect => ({
            ...effect,
            life: effect.life - 1,
            particles: effect.particles
              .map(particle => ({
                ...particle,
                x: particle.x + particle.vx,
                y: particle.y + particle.vy,
                life: particle.life - 1,
                vx: particle.vx * 0.95,
                vy: particle.vy * 0.95
              }))
              .filter(particle => particle.life > 0)
          }))
          .filter(effect => effect.life > 0);
      });
      
      return {
        ...prevState,
        players: newPlayers,
        food: newFood
      };
    });
  };

  // Initialize snake segments properly
  const initializeSnakeSegments = (startPos) => {
    const segments = [];
    const segmentCount = 5;
    const segmentDistance = 12;
    
    for (let i = 0; i < segmentCount; i++) {
      segments.push({
        x: (startPos.x || canvasSize.width / 2) - (i * segmentDistance),
        y: startPos.y || canvasSize.height / 2
      });
    }
    
    return segments;
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

  // Controls with BOOST SYSTEM
  const handleKeyPress = useCallback((event) => {
    if (gameStatus !== 'playing') return;
    
    // SPEED BOOST SYSTEM - Spacebar consumes length for speed
    if (event.code === 'Space') {
      event.preventDefault();
      const playerId = currentUser?.username || 'Player';
      const player = gameState.players[playerId];
      
      if (player && player.alive && player.segments.length > 5 && boostCooldown === 0) {
        setIsBoosting(true);
        setBoostCooldown(30); // Cooldown frames
        
        // Consume snake length for boost
        setGameState(prevState => ({
          ...prevState,
          players: {
            ...prevState.players,
            [playerId]: {
              ...prevState.players[playerId],
              segments: prevState.players[playerId].segments.slice(0, -1), // Remove last segment
              speed: (prevState.players[playerId].speed || 3) * 2, // Double speed
              boosting: true
            }
          }
        }));
        
        // Trail particles for boost effect
        if (player.segments[0]) {
          const boostParticles = [];
          for (let i = 0; i < 8; i++) {
            boostParticles.push({
              x: player.segments[0].x + (Math.random() - 0.5) * 30,
              y: player.segments[0].y + (Math.random() - 0.5) * 30,
              vx: (Math.random() - 0.5) * 10,
              vy: (Math.random() - 0.5) * 10,
              color: '#ffff00',
              life: 15,
              maxLife: 15,
              size: 6,
              type: 'boost'
            });
          }
          setTrailParticles(prev => [...prev, ...boostParticles]);
        }
        
        setMessage('⚡ BOOST ACTIVATED! Speed increased!');
        
        // Reset boost after duration
        setTimeout(() => {
          setIsBoosting(false);
          setGameState(prevState => ({
            ...prevState,
            players: {
              ...prevState.players,
              [playerId]: {
                ...prevState.players[playerId],
                speed: 3, // Reset to normal speed
                boosting: false
              }
            }
          }));
        }, 1000);
      } else if (player && player.segments.length <= 5) {
        setMessage('⚠️ Need more length to boost!');
      } else if (boostCooldown > 0) {
        setMessage('⚠️ Boost cooling down...');
      }
      return;
    }
    
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
  }, [gameStatus, gameState.players, boostCooldown, currentUser]);

  const handleMouseMove = useCallback((event) => {
    if (gameStatus !== 'playing' || gameState.status !== 'active') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Convert to game coordinates
    const gameX = (mouseX / rect.width) * canvasSize.width;
    const gameY = (mouseY / rect.height) * canvasSize.height;
    
    updatePlayerDirection(gameX, gameY);
  }, [gameStatus, gameState.status, canvasSize]);

  // Update player direction based on touch/mouse position (angle-based movement like slither.io)
  const updatePlayerDirection = (targetX, targetY) => {
    const playerId = currentUser?.username || 'Player';
    
    setGameState(prevState => {
      if (!prevState.players[playerId] || !prevState.players[playerId].segments[0]) {
        return prevState;
      }
      
      const player = prevState.players[playerId];
      const head = player.segments[0];
      
      // Calculate angle from head to target position
      const targetAngle = Math.atan2(targetY - head.y, targetX - head.x);
      
      return {
        ...prevState,
        players: {
          ...prevState.players,
          [playerId]: {
            ...player,
            targetAngle: targetAngle
          }
        }
      };
    });
  };

  // Mobile touch handlers with better direction control
  const handleTouchStart = useCallback((event) => {
    event.preventDefault();
    if (gameStatus !== 'playing' || gameState.status !== 'active') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const touch = event.touches[0];
    const rect = canvas.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    
    // Convert to game coordinates
    const gameX = (touchX / rect.width) * canvasSize.width;
    const gameY = (touchY / rect.height) * canvasSize.height;
    
    updatePlayerDirection(gameX, gameY);
  }, [gameStatus, gameState.status, canvasSize]);

  const handleTouchMove = useCallback((event) => {
    event.preventDefault();
    if (gameStatus !== 'playing' || gameState.status !== 'active') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const touch = event.touches[0];
    const rect = canvas.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    
    // Convert to game coordinates
    const gameX = (touchX / rect.width) * canvasSize.width;
    const gameY = (touchY / rect.height) * canvasSize.height;
    
    updatePlayerDirection(gameX, gameY);
  }, [gameStatus, gameState.status, canvasSize]);

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
    
    // Render eating particles
    particles.forEach(particle => {
      ctx.save();
      const alpha = particle.life / particle.maxLife;
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 15 * alpha;
      ctx.shadowColor = particle.color;
      ctx.fillStyle = particle.color;
      
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      
      // Sparkle effect
      if (particle.life % 4 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * alpha * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    });
    
    // Render trail particles (boost effects)
    trailParticles.forEach(particle => {
      ctx.save();
      const alpha = particle.life / particle.maxLife;
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 25 * alpha;
      ctx.shadowColor = particle.color;
      ctx.fillStyle = particle.color;
      
      // Lightning bolt effect for boost
      if (particle.type === 'boost') {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 3 * alpha;
        ctx.beginPath();
        ctx.moveTo(particle.x - 5, particle.y);
        ctx.lineTo(particle.x + 5, particle.y);
        ctx.moveTo(particle.x, particle.y - 5);
        ctx.lineTo(particle.x, particle.y + 5);
        ctx.stroke();
      }
      
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    
    // Render death effects
    deathEffects.forEach(effect => {
      effect.particles.forEach(particle => {
        ctx.save();
        const alpha = particle.life / 40;
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 20 * alpha;
        ctx.shadowColor = particle.color;
        ctx.fillStyle = particle.color;
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        
        // Explosion ring effect
        if (particle.life > 35) {
          ctx.strokeStyle = particle.color;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, (40 - particle.life) * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        ctx.restore();
      });
    });
    
    // Enhanced snakes with customization
    Object.values(gameState.players).forEach(player => {
      if (player.alive && player.segments && player.segments.length > 0) {
        const skin = ALL_SKINS[selectedSkin] || ALL_SKINS[0];
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
          const playerName = currentUser?.username || 'Player';
          const isPlayerSnake = player.player_id === playerName;
          
          // Slither.io style circular segments with smooth size transition
          const segmentCount = player.segments.length;
          let radius;
          
          if (isHead) {
            radius = 16 + (segmentCount * 0.3); // Head grows with length
          } else {
            // Body segments get smaller toward tail
            const sizeMultiplier = Math.max(0.4, 1 - (index / segmentCount) * 0.6);
            radius = (12 + (segmentCount * 0.2)) * sizeMultiplier;
          }
          
          // Enhanced glow for player snake
          if (isPlayerSnake) {
            ctx.shadowBlur = 20 + (radius * 0.5);
            ctx.shadowColor = skin.glow;
          } else {
            ctx.shadowBlur = 15;
            ctx.shadowColor = player.color;
          }
          
          // Create radial gradient for 3D effect
          const gradient = ctx.createRadialGradient(
            segment.x, segment.y, 0,
            segment.x, segment.y, radius
          );
          
          if (isHead) {
            // Head has special gradient
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.3, skin.color || player.color);
            gradient.addColorStop(0.8, skin.color || player.color);
            gradient.addColorStop(1, '#000000');
          } else {
            // Body segments
            const intensity = Math.max(0.4, 1 - (index / segmentCount) * 0.5);
            gradient.addColorStop(0, '#ffffff' + Math.floor(intensity * 255).toString(16));
            gradient.addColorStop(0.4, player.color);
            gradient.addColorStop(1, '#000000' + Math.floor(intensity * 128).toString(16));
          }
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(segment.x, segment.y, radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Outline for definition
          if (isPlayerSnake || isHead) {
            ctx.strokeStyle = skin.glow || player.color;
            ctx.lineWidth = isHead ? 3 : 2;
            ctx.stroke();
          }
          
          // Head details
          if (isHead) {
            // Eyes for the head
            const eyeSize = 4 + (radius * 0.15);
            const eyeOffset = radius * 0.3;
            
            // Calculate eye positions based on movement direction
            let eyeAngle = 0;
            if (player.currentAngle !== undefined) {
              eyeAngle = player.currentAngle;
            }
            
            const leftEyeX = segment.x + Math.cos(eyeAngle + Math.PI/6) * eyeOffset;
            const leftEyeY = segment.y + Math.sin(eyeAngle + Math.PI/6) * eyeOffset;
            const rightEyeX = segment.x + Math.cos(eyeAngle - Math.PI/6) * eyeOffset;
            const rightEyeY = segment.y + Math.sin(eyeAngle - Math.PI/6) * eyeOffset;
            
            ctx.fillStyle = '#ffffff';
            ctx.shadowBlur = 5;
            
            ctx.beginPath();
            ctx.arc(leftEyeX, leftEyeY, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(rightEyeX, rightEyeY, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Eye pupils
            ctx.fillStyle = isPlayerSnake ? '#00ffff' : '#000000';
            ctx.shadowBlur = 3;
            
            ctx.beginPath();
            ctx.arc(leftEyeX, leftEyeY, eyeSize * 0.4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.beginPath();
            ctx.arc(rightEyeX, rightEyeY, eyeSize * 0.4, 0, Math.PI * 2);
            ctx.fill();
            
            // Accessory
            if (accessory && accessory.icon !== "❌") {
              ctx.font = `${16 + (radius * 0.3)}px Arial`;
              ctx.textAlign = 'center';
              ctx.fillStyle = '#ffffff';
              ctx.shadowBlur = 8;
              ctx.fillText(accessory.icon, segment.x, segment.y - radius - 15);
            }
          }
        });
        
        // Player name with cyberpunk styling and growth stats
        if (player.segments[0]) {
          const growthFactor = Math.min(player.segments.length / 10, 2);
          const fontSize = 14 + (growthFactor * 3);
          
          ctx.font = `bold ${fontSize}px "Courier New", monospace`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#00ffff';
          ctx.shadowBlur = 10 + (growthFactor * 5);
          ctx.shadowColor = '#00ffff';
          
          const playerName = player.player_id.split('_')[0];
          const scoreText = `${playerName} [${player.segments.length}] [$${selectedBetAmount}]`;
          const textX = player.segments[0].x;
          const textY = player.segments[0].y - (35 + growthFactor * 5);
          
          // Enhanced text background for larger snakes
          const textWidth = ctx.measureText(scoreText).width;
          const bgPadding = 5 + (growthFactor * 2);
          const bgHeight = 20 + (growthFactor * 3);
          
          ctx.fillStyle = '#000000aa';
          ctx.fillRect(textX - textWidth/2 - bgPadding, textY - 15, textWidth + bgPadding*2, bgHeight);
          
          // Text with enhanced glow for larger snakes
          ctx.fillStyle = player.player_id === (currentUser?.username || 'Player') ? '#ffff00' : '#00ffff';
          ctx.shadowColor = player.player_id === (currentUser?.username || 'Player') ? '#ffff00' : '#00ffff';
          ctx.fillText(scoreText, textX, textY);
          
          // Additional size milestone indicators
          if (player.segments.length > 15) {
            ctx.font = 'bold 10px Arial';
            ctx.fillStyle = '#ff0080';
            ctx.fillText('🔥 LARGE', textX, textY + 18);
          } else if (player.segments.length > 25) {
            ctx.font = 'bold 12px Arial';
            ctx.fillStyle = '#ff4000';
            ctx.fillText('⚡ HUGE', textX, textY + 20);
          }
        }
        
        ctx.restore();
      }
    });
    
  }, [gameState.players, gameState.food, particles, trailParticles, deathEffects, selectedBetAmount, selectedSkin, selectedAccessory, selectedTrail, canvasSize, currentUser]);

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
                  <div className="leader-rank">#{index + 1}</div>
                  <div className="leader-info">
                    <div className="leader-name">{player.display_name}</div>
                    <div className="leader-stats">
                      <span className="leader-length">Length: {player.max_length || 0}</span>
                      <span className="leader-winnings">${player.total_winnings}</span>
                    </div>
                  </div>
                  <div className="leader-score">
                    {player.max_length || 0}
                  </div>
                </div>
              )) : (
                <div className="loading-text">⌛ Loading neural data...</div>
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
          {/* NEW SLITHER.IO FEATURES UI */}
          
          {/* Server Selection Modal */}
          {showServerSelection && (
            <div className="cyber-modal-overlay">
              <div className="cyber-modal">
                <div className="modal-header">
                  <h2>// SELECT SERVER //</h2>
                  <button className="close-btn" onClick={() => setShowServerSelection(false)}>×</button>
                </div>
                
                <div className="server-list">
                  {GAME_SERVERS.map(server => (
                    <div 
                      key={server.name} 
                      className={`server-option ${selectedServer === server.name ? 'selected' : ''}`}
                      onClick={() => setSelectedServer(server.name)}
                    >
                      <span className="server-flag">{server.flag}</span>
                      <span className="server-name">{server.name}</span>
                      <span className="server-ping">{server.ping}ms</span>
                      <span className="server-players">{server.players} players</span>
                    </div>
                  ))}
                </div>
                
                <button className="cyber-btn primary" onClick={() => setShowServerSelection(false)}>
                  SELECT SERVER
                </button>
              </div>
            </div>
          )}
          
          {/* Code Entry Modal */}
          {showCodeModal && (
            <div className="cyber-modal-overlay">
              <div className="cyber-modal">
                <div className="modal-header">
                  <h2>// ENTER CODE //</h2>
                  <button className="close-btn" onClick={() => setShowCodeModal(false)}>×</button>
                </div>
                
                <div className="code-entry">
                  <p>Enter special codes to unlock skins, accessories, and effects!</p>
                  <div className="input-group">
                    <input
                      type="text"
                      className="cyber-input"
                      placeholder="Enter code..."
                      value={codeEntry}
                      onChange={(e) => setCodeEntry(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleCodeSubmit()}
                    />
                    <button className="cyber-btn primary" onClick={handleCodeSubmit}>
                      REDEEM
                    </button>
                  </div>
                  <div className="code-hints">
                    <p>💡 Try: CYBERPUNK2025, NEONVIBES, MATRIXMODE</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Victory Message Modal */}
          {showVictoryModal && (
            <div className="cyber-modal-overlay">
              <div className="cyber-modal">
                <div className="modal-header">
                  <h2>// GAME OVER //</h2>
                </div>
                
                <div className="victory-message">
                  <p>💀 You were eliminated!</p>
                  <p>Save a victory message for other players to see:</p>
                  <div className="input-group">
                    <input
                      type="text"
                      className="cyber-input"
                      placeholder="Enter your victory message..."
                      value={victoryMessage}
                      onChange={(e) => setVictoryMessage(e.target.value)}
                      maxLength={50}
                    />
                  </div>
                  <div className="modal-actions">
                    <button className="cyber-btn secondary" onClick={() => setShowVictoryModal(false)}>
                      SKIP
                    </button>
                    <button className="cyber-btn primary" onClick={saveVictoryMessage}>
                      SAVE MESSAGE
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {gameStatus === 'menu' && showPlayButton && (
            <div className="slither-play-overlay">
              <div className="play-section">
                <h1 className="game-title">slither<span className="game-accent">.cyber</span></h1>
                
                {/* Server Display */}
                <div className="current-server" onClick={() => setShowServerSelection(true)}>
                  <span>📡 {selectedServer}</span>
                  <span className="change-btn">CHANGE</span>
                </div>
                
                {/* Play Button */}
                <button 
                  className="slither-play-btn" 
                  onClick={() => setShowPlayButton(false)}
                  disabled={!isLoggedIn && !isAdmin}
                >
                  <span className="play-icon">▶</span>
                  <span>PLAY</span>
                </button>
                
                {/* Options */}
                <div className="slither-options">
                  <button className="option-btn" onClick={() => setShowCodeModal(true)}>
                    🎁 ENTER CODE
                  </button>
                  <button className="option-btn" onClick={() => setShowCustomization(true)}>
                    🎨 CUSTOMIZE
                  </button>
                </div>
                
                {/* Speed Boost Indicator */}
                <div className="controls-hint">
                  <p>🖱️ Mouse to steer • <kbd>SPACE</kbd> to boost</p>
                  {boostCooldown > 0 && (
                    <div className="boost-cooldown">
                      Boost cooldown: {Math.ceil(boostCooldown / 10)}s
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {gameStatus === 'menu' && !showPlayButton && (
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
                    <button className="option-chip" onClick={() => setShowServerSelection(true)}>
                      🌐 SERVER: {selectedServer}
                    </button>
                    <button className="option-chip" onClick={() => setShowCodeModal(true)}>
                      🎁 ENTER CODE
                    </button>
                    <button className="option-chip" onClick={() => setShowCustomization(true)}>
                      🎨 CUSTOMIZE SNAKE
                    </button>
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
                width={canvasSize.width}
                height={canvasSize.height}
                className="cyber-canvas"
                style={{ 
                  width: '100%', 
                  maxHeight: '70vh', 
                  height: 'auto',
                  touchAction: 'none'
                }}
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
                  {ALL_SKINS.map((skin, index) => (
                    <div
                      key={index}
                      className={`skin-option ${selectedSkin === index ? 'selected' : ''} ${!unlockedSkins.includes(index) ? 'locked' : ''}`}
                      onClick={() => unlockedSkins.includes(index) && setSelectedSkin(index)}
                    >
                      <div 
                        className="skin-preview" 
                        style={{
                          background: skin.gradient,
                          boxShadow: `0 0 10px ${skin.glow}40`
                        }}
                      ></div>
                      <span className="skin-name">{skin.name}</span>
                      {!unlockedSkins.includes(index) && <span className="lock-icon">🔒</span>}
                    </div>
                  ))}
                </div>
                <div className="unlock-hint">
                  <p>💡 Use codes to unlock more skins!</p>
                </div>
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
