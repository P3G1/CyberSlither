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

// Enhanced Game Physics Constants - AUTHENTIC SLITHER.IO SPEEDS
const FOOD_SIZE = 8;
const SNAKE_SEGMENT_SIZE = 10;
const SNAKE_HEAD_SIZE = 16;
const BASE_SPEED = 1.8; // Much slower to match original slither.io
const MIN_SPEED = 1.2; // Minimum speed for very large snakes
const BOOST_SPEED_MULTIPLIER = 1.6; // More conservative boost
const MASS_SPEED_FACTOR = 0.008; // More gradual speed reduction

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

// ENHANCED SLITHER.IO ORB SYSTEM
const ORB_TYPES = {
  NORMAL: {
    size: 6,
    value: 1,
    color: ['#ff0080', '#00ffff', '#ffff00', '#00ff00', '#ff4000', '#8000ff', '#ff8000'],
    glow: true
  },
  LARGE: {
    size: 12,
    value: 3,
    color: ['#ffaa00', '#ff6600', '#ff0000'],
    glow: true,
    pulse: true
  },
  SPECIAL_FLOATING: {
    size: 18,
    value: 8,
    color: ['#ffffff', '#ffff00'],
    glow: true,
    pulse: true,
    float: true, // Moves around the map
    rare: true
  },
  DEATH_ORB: {
    size: 10,
    value: 2,
    color: ['#ff6666', '#ff3333', '#ff0000'],
    glow: true,
    fade: true // Fades over time
  }
};

const FLOATING_ORB_COUNT = 15; // Number of special floating orbs on map
const NORMAL_ORB_DENSITY = 0.00008; // Orbs per square pixel
const LARGE_ORB_DENSITY = 0.00002;

const GameComponent = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const animationRef = useRef(null);
  const gameLoopRef = useRef(null);
  
  // Game State - Enhanced for authentic slither.io
  const [gameState, setGameState] = useState({
    sessionId: null,
    playerId: null,
    players: {},
    food: [],
    floatingOrbs: [],
    deathOrbs: [],
    status: 'waiting',
    connected: false,
    worldBounds: { radius: WORLD_RADIUS, center: { x: 0, y: 0 } }
  });
  
  // Camera and Viewport State
  const [camera, setCamera] = useState({
    x: 0,
    y: 0,
    zoom: 1,
    following: null
  });
  
  // Minimap State
  const [minimap, setMinimap] = useState({
    visible: true,
    playerDots: {},
    hotspots: []
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

  // AUTHENTIC SLITHER.IO BOOST SYSTEM  
  const [isSpacePressed, setIsSpacePressed] = useState(false); // Track if spacebar is held
  const [boostConsumeCounter, setBoostConsumeCounter] = useState(0); // For length consumption timing
  
  // SPECTATOR MODE SYSTEM
  const [spectatorMode, setSpectatorMode] = useState(false);
  const [spectatorTarget, setSpectatorTarget] = useState(null);
  const [spectatorTimeLeft, setSpectatorTimeLeft] = useState(0);
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

  // AUTHENTIC SLITHER.IO BOOST CONSUMPTION + SPECTATOR TIMER
  useEffect(() => {
    if (isSpacePressed && gameStatus === 'playing' && !spectatorMode) {
      const consumeInterval = setInterval(() => {
        setBoostConsumeCounter(prev => prev + 1);
        
        // Consume length every 10 frames (like original slither.io)
        if (boostConsumeCounter % 10 === 0) {
          const playerName = currentUser?.username || 'Player';
          setGameState(prevState => {
            const player = prevState.players[playerName];
            if (player && player.alive && player.segments.length > 5) {
              return {
                ...prevState,
                players: {
                  ...prevState.players,
                  [playerName]: {
                    ...player,
                    segments: player.segments.slice(0, -1), // Remove last segment
                    mass: player.segments.length - 1,
                    boosting: true
                  }
                }
              };
            }
            return prevState;
          });
        }
      }, 50); // Run at 20fps

      return () => clearInterval(consumeInterval);
    }
  }, [isSpacePressed, gameStatus, boostConsumeCounter, currentUser, spectatorMode]);

  // SPECTATOR MODE TIMER
  useEffect(() => {
    if (spectatorMode && spectatorTimeLeft > 0) {
      const timer = setTimeout(() => {
        setSpectatorTimeLeft(prev => {
          if (prev <= 1) {
            // End spectator mode
            setSpectatorMode(false);
            setSpectatorTarget(null);
            setShowVictoryModal(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [spectatorMode, spectatorTimeLeft]);

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
    
    // SPECTATOR MODE SYSTEM (authentic slither.io)
    if (playerId === (currentUser?.username || 'Player')) {
      // Find largest snake to spectate
      const alivePlayers = Object.values(gameState.players).filter(p => 
        p.alive && p.player_id !== playerId && p.segments && p.segments.length > 0
      );
      
      if (alivePlayers.length > 0) {
        // Spectate the largest snake
        const largestSnake = alivePlayers.reduce((largest, current) => 
          (current.segments.length > largest.segments.length) ? current : largest
        );
        
        setSpectatorMode(true);
        setSpectatorTarget(largestSnake.player_id);
        setSpectatorTimeLeft(15); // 15 seconds spectator mode
        setMessage(`💀 ${cause}! Spectating ${largestSnake.player_id}... (${spectatorTimeLeft}s)`);
      } else {
        // No one to spectate, show victory modal
        setShowVictoryModal(true);
      }
    }
  }, [gameState.players, currentUser, spectatorTimeLeft]);

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

  // Enhanced local game with authentic slither.io world
  const startLocalGame = () => {
    const playerName = currentUser?.username || 'Player';
    const { food, floatingOrbs } = generateSlitherWorld();
    
    // Spawn players in world coordinates (center of world)
    setGameState({
      sessionId: 'local_game',
      playerId: playerName,
      players: {
        [playerName]: {
          player_id: playerName,
          segments: initializeSnakeSegments({ x: 0, y: 0 }), // Center of world
          color: ALL_SKINS[selectedSkin].color,
          alive: true,
          score: 15,
          mass: 15,
          targetAngle: 0,
          currentAngle: 0,
          speed: calculateSpeed(15)
        },
        'DemoBot1': {
          player_id: 'DemoBot1',
          segments: initializeSnakeSegments({ x: -300, y: -200 }),
          color: '#ff0080',
          alive: true,
          score: 18,
          mass: 18,
          targetAngle: Math.PI / 4,
          currentAngle: Math.PI / 4,
          speed: calculateSpeed(18)
        },
        'DemoBot2': {
          player_id: 'DemoBot2',
          segments: initializeSnakeSegments({ x: 400, y: 300 }),
          color: '#00ff00',
          alive: true,
          score: 20,
          mass: 20,
          targetAngle: -Math.PI / 3,
          currentAngle: -Math.PI / 3,
          speed: calculateSpeed(20)
        }
      },
      food: food,
      floatingOrbs: floatingOrbs,
      deathOrbs: [],
      status: 'active',
      connected: true,
      worldBounds: { radius: WORLD_RADIUS, center: { x: 0, y: 0 } }
    });
    
    // Set initial camera to follow player
    setCamera({
      x: 0,
      y: 0,
      zoom: 1,
      following: playerName
    });
    
    startDemoGameLoop();
  };

  // AUTHENTIC SLITHER.IO WORLD GENERATION
  const generateSlitherWorld = () => {
    const worldArea = Math.PI * WORLD_RADIUS * WORLD_RADIUS;
    const normalOrbCount = Math.floor(worldArea * NORMAL_ORB_DENSITY);
    const largeOrbCount = Math.floor(worldArea * LARGE_ORB_DENSITY);
    
    const food = [];
    const floatingOrbs = [];
    
    // Generate normal orbs scattered throughout the circular world
    for (let i = 0; i < normalOrbCount; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.sqrt(Math.random()) * (WORLD_RADIUS - 100);
      
      food.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        id: `normal_${i}`,
        type: 'NORMAL',
        ...ORB_TYPES.NORMAL,
        color: ORB_TYPES.NORMAL.color[Math.floor(Math.random() * ORB_TYPES.NORMAL.color.length)],
        size: ORB_TYPES.NORMAL.size + Math.random() * 2
      });
    }
    
    // Generate large orbs
    for (let i = 0; i < largeOrbCount; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.sqrt(Math.random()) * (WORLD_RADIUS - 150);
      
      food.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        id: `large_${i}`,
        type: 'LARGE',
        ...ORB_TYPES.LARGE,
        color: ORB_TYPES.LARGE.color[Math.floor(Math.random() * ORB_TYPES.LARGE.color.length)],
        pulsePhase: Math.random() * Math.PI * 2
      });
    }
    
    // Generate special floating orbs
    for (let i = 0; i < FLOATING_ORB_COUNT; i++) {
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.random() * (WORLD_RADIUS - 200);
      
      floatingOrbs.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        id: `floating_${i}`,
        type: 'SPECIAL_FLOATING',
        ...ORB_TYPES.SPECIAL_FLOATING,
        color: ORB_TYPES.SPECIAL_FLOATING.color[Math.floor(Math.random() * ORB_TYPES.SPECIAL_FLOATING.color.length)],
        vx: (Math.random() - 0.5) * 0.5, // Slow drift
        vy: (Math.random() - 0.5) * 0.5,
        pulsePhase: Math.random() * Math.PI * 2,
        birthTime: Date.now()
      });
    }
    
    return { food, floatingOrbs };
  };

  // Generate death orbs when snake dies
  const generateDeathOrbs = (snakeSegments, snakeScore) => {
    const orbCount = Math.min(snakeSegments.length, 100); // Limit for performance
    const orbs = [];
    
    for (let i = 0; i < orbCount; i++) {
      const segment = snakeSegments[i] || snakeSegments[0];
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 50;
      
      orbs.push({
        x: segment.x + Math.cos(angle) * distance,
        y: segment.y + Math.sin(angle) * distance,
        id: `death_${Date.now()}_${i}`,
        type: 'DEATH_ORB',
        ...ORB_TYPES.DEATH_ORB,
        color: ORB_TYPES.DEATH_ORB.color[Math.floor(Math.random() * ORB_TYPES.DEATH_ORB.color.length)],
        birthTime: Date.now(),
        lifespan: 30000, // 30 seconds
        fadeStartTime: Date.now() + 25000
      });
    }
    
    return orbs;
  };

  // Check if position is within world boundaries
  const isWithinWorldBounds = (x, y) => {
    const distance = Math.sqrt(x * x + y * y);
    return distance <= WORLD_RADIUS;
  };

  // Mass-based speed calculation
  const calculateSpeed = (mass, isBoosting = false) => {
    let speed = BASE_SPEED - (mass * MASS_SPEED_FACTOR);
    speed = Math.max(speed, MIN_SPEED);
    
    if (isBoosting) {
      speed *= BOOST_SPEED_MULTIPLIER;
    }
    
    return speed;
  };

  const generateDemoFood = () => {
    // For demo mode, generate viewport-based orbs
    const { food, floatingOrbs } = generateSlitherWorld();
    
    // Filter orbs that are visible in current viewport for demo
    const viewportFood = food.filter(orb => 
      Math.abs(orb.x) < canvasSize.width/2 + 200 &&
      Math.abs(orb.y) < canvasSize.height/2 + 200
    );
    
    return viewportFood.slice(0, 200); // Limit for demo performance
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

  // ENHANCED SLITHER.IO GAME MECHANICS
  const updateSlitherGame = () => {
    setGameState(prevState => {
      const newPlayers = { ...prevState.players };
      let newFood = [...prevState.food];
      let newFloatingOrbs = [...(prevState.floatingOrbs || [])];
      let newDeathOrbs = [...(prevState.deathOrbs || [])];
      const playerName = currentUser?.username || 'Player';
      
      // Update floating orbs (they drift around the map)
      newFloatingOrbs.forEach(orb => {
        orb.x += orb.vx;
        orb.y += orb.vy;
        
        // Bounce off world boundaries
        const distance = Math.sqrt(orb.x * orb.x + orb.y * orb.y);
        if (distance > WORLD_RADIUS - 100) {
          const angle = Math.atan2(orb.y, orb.x);
          orb.vx = -Math.cos(angle) * Math.abs(orb.vx);
          orb.vy = -Math.sin(angle) * Math.abs(orb.vy);
        }
        
        // Update pulse animation
        orb.pulsePhase = (orb.pulsePhase + 0.1) % (Math.PI * 2);
      });
      
      // Update death orbs (fade over time)
      const currentTime = Date.now();
      newDeathOrbs = newDeathOrbs.filter(orb => {
        if (currentTime > orb.birthTime + orb.lifespan) {
          return false; // Remove expired orbs
        }
        
        // Apply fade effect
        if (currentTime > orb.fadeStartTime) {
          const fadeProgress = (currentTime - orb.fadeStartTime) / (orb.lifespan - orb.fadeStartTime + orb.birthTime);
          orb.opacity = Math.max(0.1, 1 - fadeProgress);
        }
        
        return true;
      });
      
      // Update each snake with mass-based physics
      Object.keys(newPlayers).forEach(playerId => {
        const snake = newPlayers[playerId];
        if (!snake.alive) return;
        
        // Initialize snake properties
        if (!snake.targetAngle) snake.targetAngle = 0;
        if (!snake.currentAngle) snake.currentAngle = 0;
        if (!snake.mass) snake.mass = snake.segments?.length || 15;
        if (!snake.segments) snake.segments = initializeSnakeSegments(snake);
        
        // Calculate speed based on mass (larger snakes are slower)
        const isBoosting = snake.boosting || false;
        snake.speed = calculateSpeed(snake.mass, isBoosting);
        
        // Smooth angle interpolation (authentic slither.io turning speed)
        const angleDiff = snake.targetAngle - snake.currentAngle;
        let smoothAngle = angleDiff;
        if (smoothAngle > Math.PI) smoothAngle -= 2 * Math.PI;
        if (smoothAngle < -Math.PI) smoothAngle += 2 * Math.PI;
        snake.currentAngle += smoothAngle * 0.12; // Faster turning like original slither.io
        
        // Move snake head with mass-based speed
        const newHead = {
          x: snake.segments[0].x + Math.cos(snake.currentAngle) * snake.speed,
          y: snake.segments[0].y + Math.sin(snake.currentAngle) * snake.speed
        };
        
        // CHECK WORLD BOUNDARIES - Kill snake if it hits the red barrier
        if (!isWithinWorldBounds(newHead.x, newHead.y)) {
          snake.alive = false;
          handlePlayerDeath(playerId, "Hit world boundary");
          
          // Generate death orbs
          const deathOrbs = generateDeathOrbs(snake.segments, snake.score);
          newDeathOrbs.push(...deathOrbs);
          
          if (playerId === playerName) {
            setMessage(`💀 Hit the red barrier! Length: ${snake.segments.length}`);
          }
          return;
        }
        
        // Update snake segments with proper following
        const newSegments = [newHead];
        const segmentDistance = 12;
        
        for (let i = 1; i < snake.segments.length; i++) {
          const prevSegment = newSegments[i - 1];
          const currentSegment = snake.segments[i];
          
          const dx = prevSegment.x - currentSegment.x;
          const dy = prevSegment.y - currentSegment.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > segmentDistance) {
            const angle = Math.atan2(dy, dx);
            newSegments.push({
              x: prevSegment.x - Math.cos(angle) * segmentDistance,
              y: prevSegment.y - Math.sin(angle) * segmentDistance
            });
          } else {
            newSegments.push({ ...currentSegment });
          }
        }
        
        snake.segments = newSegments;
        
        // Enhanced orb collision detection for all orb types
        let ateOrb = false;
        let orbValue = 0;
        
        // Check normal food collision
        newFood = newFood.filter(orb => {
          const distance = Math.sqrt(
            Math.pow(newHead.x - orb.x, 2) + Math.pow(newHead.y - orb.y, 2)
          );
          
          const collisionRadius = (orb.size || 6) + 15;
          if (distance < collisionRadius) {
            ateOrb = true;
            orbValue += orb.value || 1;
            
            if (playerId === playerName) {
              // Create eating particles
              const particles = [];
              for (let i = 0; i < (orb.value || 1) * 3; i++) {
                particles.push({
                  x: orb.x,
                  y: orb.y,
                  vx: (Math.random() - 0.5) * 8,
                  vy: (Math.random() - 0.5) * 8,
                  color: orb.color,
                  life: 25,
                  maxLife: 25,
                  size: 4
                });
              }
              setParticles(prev => [...prev, ...particles]);
            }
            
            return false; // Remove orb
          }
          return true;
        });
        
        // Check floating orb collision
        newFloatingOrbs = newFloatingOrbs.filter(orb => {
          const distance = Math.sqrt(
            Math.pow(newHead.x - orb.x, 2) + Math.pow(newHead.y - orb.y, 2)
          );
          
          if (distance < orb.size + 15) {
            ateOrb = true;
            orbValue += orb.value;
            
            if (playerId === playerName) {
              setMessage(`⭐ Special orb consumed! +${orb.value} mass!`);
              
              // Special particles for floating orbs
              const particles = [];
              for (let i = 0; i < 12; i++) {
                particles.push({
                  x: orb.x,
                  y: orb.y,
                  vx: (Math.random() - 0.5) * 12,
                  vy: (Math.random() - 0.5) * 12,
                  color: orb.color,
                  life: 35,
                  maxLife: 35,
                  size: 6
                });
              }
              setParticles(prev => [...prev, ...particles]);
            }
            
            return false;
          }
          return true;
        });
        
        // Check death orb collision
        newDeathOrbs = newDeathOrbs.filter(orb => {
          const distance = Math.sqrt(
            Math.pow(newHead.x - orb.x, 2) + Math.pow(newHead.y - orb.y, 2)
          );
          
          if (distance < orb.size + 12) {
            ateOrb = true;
            orbValue += orb.value;
            return false;
          }
          return true;
        });
        
        // Grow snake when orbs are eaten
        if (ateOrb) {
          // Add segments based on orb value
          for (let i = 0; i < orbValue * 2; i++) {
            const tailSegment = snake.segments[snake.segments.length - 1];
            const secondToLast = snake.segments[snake.segments.length - 2] || tailSegment;
            
            const dx = tailSegment.x - secondToLast.x;
            const dy = tailSegment.y - secondToLast.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 12;
            
            if (distance > 0) {
              const normalizedDx = dx / distance;
              const normalizedDy = dy / distance;
              
              snake.segments.push({
                x: tailSegment.x + normalizedDx * 12,
                y: tailSegment.y + normalizedDy * 12
              });
            }
          }
          
          snake.score = (snake.score || 15) + orbValue * 5;
          snake.mass = snake.segments.length;
        }
        
        // Snake-to-snake collision detection with enhanced death orbs
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
              
              // Generate death orbs from crashed snake
              const deathOrbs = generateDeathOrbs(snake.segments, snake.score);
              newDeathOrbs.push(...deathOrbs);
              
              if (playerId === playerName) {
                setMessage(`💀 Crashed into ${otherPlayerId}! Length: ${snake.segments.length}`);
              }
            }
          });
        });
        
        // AI behavior for demo bots (enhanced with orb targeting)
        if (playerId !== playerName && snake.alive && Math.random() < 0.01) {
          let nearestOrb = null;
          let nearestDistance = Infinity;
          
          // Check for nearby floating orbs first (high value)
          newFloatingOrbs.forEach(orb => {
            const distance = Math.sqrt(
              Math.pow(newHead.x - orb.x, 2) + Math.pow(newHead.y - orb.y, 2)
            );
            if (distance < nearestDistance && distance < 300) {
              nearestDistance = distance;
              nearestOrb = orb;
            }
          });
          
          // If no floating orbs nearby, look for death orbs
          if (!nearestOrb) {
            newDeathOrbs.forEach(orb => {
              const distance = Math.sqrt(
                Math.pow(newHead.x - orb.x, 2) + Math.pow(newHead.y - orb.y, 2)
              );
              if (distance < nearestDistance && distance < 200) {
                nearestDistance = distance;
                nearestOrb = orb;
              }
            });
          }
          
          // Finally check regular food
          if (!nearestOrb) {
            newFood.forEach(orb => {
              const distance = Math.sqrt(
                Math.pow(newHead.x - orb.x, 2) + Math.pow(newHead.y - orb.y, 2)
              );
              if (distance < nearestDistance && distance < 150) {
                nearestDistance = distance;
                nearestOrb = orb;
              }
            });
          }
          
          if (nearestOrb) {
            const targetAngle = Math.atan2(nearestOrb.y - newHead.y, nearestOrb.x - newHead.x);
            snake.targetAngle = targetAngle;
          } else {
            // Random direction change
            snake.targetAngle += (Math.random() - 0.5) * 0.5;
          }
        }
        
        newPlayers[playerId] = snake;
      });
      
      // Update camera to follow player or spectator target with authentic field of view scaling
      let targetSnake = null;
      
      if (spectatorMode && spectatorTarget) {
        // Spectator mode - follow the target snake
        targetSnake = newPlayers[spectatorTarget];
      } else {
        // Normal mode - follow player
        targetSnake = newPlayers[playerName];
      }
      
      if (targetSnake && targetSnake.alive && targetSnake.segments[0]) {
        // Calculate field of view based on snake length (authentic slither.io)
        const baseZoom = 1.0;
        const maxZoom = 0.3; // Larger snakes zoom out more (see more)
        const lengthFactor = Math.min(targetSnake.segments.length / 100, 1);
        const targetZoom = baseZoom - (lengthFactor * (baseZoom - maxZoom));
        
        setCamera(prevCamera => ({
          x: targetSnake.segments[0].x,
          y: targetSnake.segments[0].y,
          zoom: targetZoom, // Smooth field of view scaling like original
          following: spectatorMode ? spectatorTarget : playerName
        }));
      }
      
      // Maintain food supply with world-appropriate generation
      if (newFood.length < 500) { // Keep good food density
        const { food: newFoodBatch } = generateSlitherWorld();
        newFood.push(...newFoodBatch.slice(0, 50)); // Add in batches
      }
      
      // Respawn floating orbs if needed
      if (newFloatingOrbs.length < FLOATING_ORB_COUNT) {
        const angle = Math.random() * 2 * Math.PI;
        const radius = Math.random() * (WORLD_RADIUS - 200);
        
        newFloatingOrbs.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          id: `floating_respawn_${Date.now()}`,
          type: 'SPECIAL_FLOATING',
          ...ORB_TYPES.SPECIAL_FLOATING,
          color: ORB_TYPES.SPECIAL_FLOATING.color[Math.floor(Math.random() * ORB_TYPES.SPECIAL_FLOATING.color.length)],
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          pulsePhase: Math.random() * Math.PI * 2,
          birthTime: Date.now()
        });
      }
      
      // Update minimap data
      setMinimap(prevMinimap => ({
        ...prevMinimap,
        playerDots: Object.keys(newPlayers).reduce((dots, playerId) => {
          const player = newPlayers[playerId];
          if (player.alive && player.segments[0]) {
            dots[playerId] = {
              x: player.segments[0].x,
              y: player.segments[0].y,
              mass: player.mass || player.segments.length
            };
          }
          return dots;
        }, {}),
        hotspots: newDeathOrbs.map(orb => ({ x: orb.x, y: orb.y, intensity: orb.value }))
      }));
      
      return {
        ...prevState,
        players: newPlayers,
        food: newFood,
        floatingOrbs: newFloatingOrbs,
        deathOrbs: newDeathOrbs
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

  // AUTHENTIC SLITHER.IO KEY HANDLERS
  const handleKeyDown = useCallback((event) => {
    if (gameStatus !== 'playing') return;
    
    // BOOST SYSTEM - Spacebar
    if (event.code === 'Space') {
      event.preventDefault();
      if (!isSpacePressed) {
        setIsSpacePressed(true);
        setBoostConsumeCounter(0);
        
        // Set boost state immediately
        const playerId = currentUser?.username || 'Player';
        setGameState(prevState => {
          const player = prevState.players[playerId];
          if (player && player.alive && player.segments.length > 5) {
            return {
              ...prevState,
              players: {
                ...prevState.players,
                [playerId]: {
                  ...player,
                  boosting: true
                }
              }
            };
          }
          return prevState;
        });
      }
    }
    
    // MASS EJECTION SYSTEM - W key (authentic slither.io)
    if (event.code === 'KeyW') {
      event.preventDefault();
      ejectMass();
    }
  }, [gameStatus, isSpacePressed, currentUser]);

  const handleKeyUp = useCallback((event) => {
    if (event.code === 'Space') {
      event.preventDefault();
      setIsSpacePressed(false);
      
      // Stop boost immediately
      const playerId = currentUser?.username || 'Player';
      setGameState(prevState => {
        const player = prevState.players[playerId];
        if (player) {
          return {
            ...prevState,
            players: {
              ...prevState.players,
              [playerId]: {
                ...player,
                boosting: false
              }
            }
          };
        }
        return prevState;
      });
    }
  }, [currentUser]);

  // MASS EJECTION FUNCTION (authentic slither.io mechanic)
  const ejectMass = useCallback(() => {
    const playerId = currentUser?.username || 'Player';
    
    setGameState(prevState => {
      const player = prevState.players[playerId];
      if (!player || !player.alive || player.segments.length <= 10) {
        return prevState; // Need minimum length to eject
      }
      
      const head = player.segments[0];
      if (!head) return prevState;
      
      // Create ejected mass orb in direction snake is facing
      const ejectionAngle = player.currentAngle || 0;
      const ejectionDistance = 40;
      
      const ejectedOrb = {
        x: head.x + Math.cos(ejectionAngle) * ejectionDistance,
        y: head.y + Math.sin(ejectionAngle) * ejectionDistance,
        id: `ejected_${Date.now()}_${Math.random()}`,
        type: 'EJECTED_MASS',
        size: 12,
        value: 3,
        color: player.color || '#ffffff',
        glow: true,
        birthTime: Date.now(),
        ejectedBy: playerId
      };
      
      // Remove segments from player (cost of ejecting mass)
      const newSegments = player.segments.slice(0, -3); // Remove 3 segments
      
      return {
        ...prevState,
        players: {
          ...prevState.players,
          [playerId]: {
            ...player,
            segments: newSegments,
            mass: newSegments.length
          }
        },
        food: [...prevState.food, ejectedOrb]
      };
    });
    
    setMessage('⚡ Mass ejected!');
  }, [currentUser]);

  // RIGHT-CLICK MASS EJECTION
  const handleRightClick = useCallback((event) => {
    if (gameStatus === 'playing') {
      event.preventDefault();
      ejectMass();
    }
  }, [gameStatus, ejectMass]);

  const handleMouseMove = useCallback((event) => {
    if (gameStatus !== 'playing' || gameState.status !== 'active') return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Convert to screen coordinates first
    const screenX = (mouseX / rect.width) * canvasSize.width;
    const screenY = (mouseY / rect.height) * canvasSize.height;
    
    // Convert to world coordinates using camera transform
    const zoom = camera.zoom || 1;
    const worldX = (screenX - canvasSize.width / 2) / zoom + (camera.x || 0);
    const worldY = (screenY - canvasSize.height / 2) / zoom + (camera.y || 0);
    
    updatePlayerDirection(worldX, worldY);
  }, [gameStatus, gameState.status, canvasSize, camera]);

  // Update player direction based on world position (angle-based movement like slither.io)
  const updatePlayerDirection = (targetX, targetY) => {
    const playerId = currentUser?.username || 'Player';
    
    setGameState(prevState => {
      if (!prevState.players[playerId] || !prevState.players[playerId].segments[0]) {
        return prevState;
      }
      
      const player = prevState.players[playerId];
      const head = player.segments[0];
      
      // Calculate angle from head to target position in world coordinates
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

  // Event listeners for authentic slither.io controls
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('contextmenu', handleRightClick); // Right-click mass ejection
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('contextmenu', handleRightClick);
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, [handleKeyDown, handleKeyUp, handleMouseMove, handleRightClick, handleTouchStart, handleTouchMove]);

  // ENHANCED SLITHER.IO RENDERING SYSTEM
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate camera offset for world rendering
    const cameraOffsetX = canvas.width / 2 - (camera.x || 0);
    const cameraOffsetY = canvas.height / 2 - (camera.y || 0);
    const zoom = camera.zoom || 1;
    
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(cameraOffsetX / zoom, cameraOffsetY / zoom);
    
    // DRAW WORLD BACKGROUND (large scale like slither.io)
    const worldGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, WORLD_RADIUS);
    worldGradient.addColorStop(0, '#0a0a1a');
    worldGradient.addColorStop(0.3, '#1a0a2a');
    worldGradient.addColorStop(0.7, '#2a0a3a');
    worldGradient.addColorStop(1, '#0a0a0a');
    
    ctx.fillStyle = worldGradient;
    ctx.beginPath();
    ctx.arc(0, 0, WORLD_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    
    // DRAW WORLD BOUNDARY (red barrier like slither.io)
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 20;
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#ff0000';
    ctx.beginPath();
    ctx.arc(0, 0, WORLD_RADIUS - 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw subtle grid pattern in visible area
    ctx.strokeStyle = '#00ffff10';
    ctx.lineWidth = 1;
    const gridSpacing = 100;
    const visibleBounds = {
      left: (camera.x || 0) - canvas.width / 2 / zoom - 200,
      right: (camera.x || 0) + canvas.width / 2 / zoom + 200,
      top: (camera.y || 0) - canvas.height / 2 / zoom - 200,
      bottom: (camera.y || 0) + canvas.height / 2 / zoom + 200
    };
    
    for (let x = Math.floor(visibleBounds.left / gridSpacing) * gridSpacing; x <= visibleBounds.right; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, visibleBounds.top);
      ctx.lineTo(x, visibleBounds.bottom);
      ctx.stroke();
    }
    for (let y = Math.floor(visibleBounds.top / gridSpacing) * gridSpacing; y <= visibleBounds.bottom; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(visibleBounds.left, y);
      ctx.lineTo(visibleBounds.right, y);
      ctx.stroke();
    }
    
    // DRAW FLOATING ORBS (special large orbs that move around)
    (gameState.floatingOrbs || []).forEach(orb => {
      if (isOrbVisible(orb, visibleBounds)) {
        ctx.save();
        
        // Pulsing effect
        const pulseSize = orb.size + Math.sin(orb.pulsePhase || 0) * 3;
        const glowIntensity = 20 + Math.sin((orb.pulsePhase || 0) * 1.5) * 10;
        
        ctx.shadowBlur = glowIntensity;
        ctx.shadowColor = orb.color;
        ctx.fillStyle = orb.color;
        
        // Outer glow
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, pulseSize * 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Main orb
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, pulseSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner highlight
        ctx.shadowBlur = 5;
        ctx.fillStyle = '#ffffff80';
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, pulseSize * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    });
    
    // DRAW DEATH ORBS (from dead snakes)
    (gameState.deathOrbs || []).forEach(orb => {
      if (isOrbVisible(orb, visibleBounds)) {
        ctx.save();
        ctx.globalAlpha = orb.opacity || 1;
        ctx.shadowBlur = 10;
        ctx.shadowColor = orb.color;
        ctx.fillStyle = orb.color;
        
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Smaller inner highlight
        ctx.shadowBlur = 3;
        ctx.fillStyle = '#ffffff60';
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    });
    
    // DRAW NORMAL FOOD ORBS
    (gameState.food || []).forEach(orb => {
      if (isOrbVisible(orb, visibleBounds)) {
        ctx.save();
        
        const size = orb.size || 6;
        let effectiveSize = size;
        
        // Add pulsing for large orbs
        if (orb.type === 'LARGE' && orb.pulsePhase !== undefined) {
          effectiveSize = size + Math.sin(orb.pulsePhase) * 2;
        }
        
        ctx.shadowBlur = orb.glow ? 15 : 8;
        ctx.shadowColor = orb.color;
        ctx.fillStyle = orb.color;
        
        // Main orb
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, effectiveSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner highlight
        ctx.shadowBlur = 3;
        ctx.fillStyle = '#ffffff50';
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, effectiveSize * 0.4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    });
    
    // DRAW EATING PARTICLES
    particles.forEach(particle => {
      if (particle.life > 0 && isOrbVisible(particle, visibleBounds)) {
        ctx.save();
        ctx.globalAlpha = particle.life / particle.maxLife;
        ctx.fillStyle = particle.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = particle.color;
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
    
    // DRAW SNAKES with enhanced mass-based rendering
    Object.values(gameState.players || {}).forEach(player => {
      if (player.alive && player.segments && player.segments.length > 0) {
        const isPlayer = player.player_id === (currentUser?.username || 'Player');
        const mass = player.mass || player.segments.length;
        const growthFactor = Math.min(mass / 50, 3);
        
        // Enhanced snake body rendering
        player.segments.forEach((segment, index) => {
          ctx.save();
          
          // Size decreases from head to tail
          const segmentRatio = 1 - (index / player.segments.length) * 0.3;
          const segmentSize = (8 + growthFactor * 2) * segmentRatio;
          
          // Enhanced glow for larger snakes
          ctx.shadowBlur = 10 + growthFactor * 8;
          ctx.shadowColor = player.color;
          
          if (index === 0) {
            // Snake head - larger and more prominent
            ctx.fillStyle = player.color;
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, segmentSize + 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Eyes based on movement direction
            if (player.currentAngle !== undefined) {
              ctx.fillStyle = '#ffffff';
              ctx.shadowBlur = 3;
              
              const eyeDistance = segmentSize * 0.6;
              const eyeSize = 2 + growthFactor * 0.5;
              const angle1 = player.currentAngle + 0.5;
              const angle2 = player.currentAngle - 0.5;
              
              // Left eye
              ctx.beginPath();
              ctx.arc(
                segment.x + Math.cos(angle1) * eyeDistance,
                segment.y + Math.sin(angle1) * eyeDistance,
                eyeSize, 0, Math.PI * 2
              );
              ctx.fill();
              
              // Right eye
              ctx.beginPath();
              ctx.arc(
                segment.x + Math.cos(angle2) * eyeDistance,
                segment.y + Math.sin(angle2) * eyeDistance,
                eyeSize, 0, Math.PI * 2
              );
              ctx.fill();
            }
          } else {
            // Body segments
            ctx.fillStyle = player.color;
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, segmentSize, 0, Math.PI * 2);
            ctx.fill();
            
            // Segment borders for definition
            ctx.strokeStyle = '#ffffff20';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          
          ctx.restore();
        });
        
        // Player name and stats (with zoom-based scaling)
        if (player.segments[0]) {
          ctx.save();
          
          const fontSize = Math.max(10, (14 + growthFactor * 2) / zoom);
          ctx.font = `bold ${fontSize}px "Courier New", monospace`;
          ctx.textAlign = 'center';
          ctx.fillStyle = isPlayer ? '#ffff00' : '#00ffff';
          ctx.shadowBlur = 8 / zoom;
          ctx.shadowColor = ctx.fillStyle;
          
          const playerName = player.player_id.split('_')[0];
          const scoreText = `${playerName} [${player.segments.length}]`;
          const textY = player.segments[0].y - (25 + growthFactor * 5);
          
          // Text background
          const textWidth = ctx.measureText(scoreText).width;
          ctx.fillStyle = '#000000aa';
          ctx.fillRect(player.segments[0].x - textWidth/2 - 5, textY - 12, textWidth + 10, 16);
          
          // Main text
          ctx.fillStyle = isPlayer ? '#ffff00' : '#00ffff';
          ctx.fillText(scoreText, player.segments[0].x, textY);
          
          // Size milestone indicators
          if (mass > 50) {
            ctx.font = `bold ${Math.max(8, 12/zoom)}px Arial`;
            ctx.fillStyle = '#ff0080';
            ctx.fillText('👑 KING', player.segments[0].x, textY + 20);
          } else if (mass > 25) {
            ctx.font = `bold ${Math.max(8, 10/zoom)}px Arial`;
            ctx.fillStyle = '#ff4000';
            ctx.fillText('⚡ LARGE', player.segments[0].x, textY + 18);
          }
          
          ctx.restore();
        }
      }
    });
    
    ctx.restore();
    
    // DRAW MINIMAP (bottom-right corner)
    drawMinimap(ctx, canvas);
    
    // DRAW UI ELEMENTS
    drawGameUI(ctx, canvas);
    
  }, [gameState.players, gameState.food, gameState.floatingOrbs, gameState.deathOrbs, particles, trailParticles, deathEffects, selectedBetAmount, selectedSkin, selectedAccessory, selectedTrail, canvasSize, currentUser, camera, minimap]);

  // Helper functions for drawing
  const isOrbVisible = (orb, bounds) => {
    return orb.x >= bounds.left && orb.x <= bounds.right && 
           orb.y >= bounds.top && orb.y <= bounds.bottom;
  };

  const drawMinimap = (ctx, canvas) => {
    if (!minimap.visible) return;
    
    ctx.save();
    
    // Minimap position (bottom-right)
    const mmX = canvas.width - MINIMAP_SIZE - 20;
    const mmY = canvas.height - MINIMAP_SIZE - 20;
    
    // Minimap background (circular like slither.io)
    ctx.fillStyle = '#000000aa';
    ctx.beginPath();
    ctx.arc(mmX + MINIMAP_SIZE/2, mmY + MINIMAP_SIZE/2, MINIMAP_SIZE/2, 0, Math.PI * 2);
    ctx.fill();
    
    // World boundary on minimap
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mmX + MINIMAP_SIZE/2, mmY + MINIMAP_SIZE/2, MINIMAP_SIZE/2 - 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw player dots
    Object.entries(minimap.playerDots).forEach(([playerId, playerData]) => {
      const scale = (MINIMAP_SIZE/2 - 10) / WORLD_RADIUS;
      const dotX = mmX + MINIMAP_SIZE/2 + playerData.x * scale;
      const dotY = mmY + MINIMAP_SIZE/2 + playerData.y * scale;
      
      // Check if within minimap bounds
      const distFromCenter = Math.sqrt(
        Math.pow(dotX - (mmX + MINIMAP_SIZE/2), 2) + 
        Math.pow(dotY - (mmY + MINIMAP_SIZE/2), 2)
      );
      
      if (distFromCenter <= MINIMAP_SIZE/2 - 5) {
        ctx.fillStyle = playerId === (currentUser?.username || 'Player') ? '#ffff00' : '#00ffff';
        const dotSize = Math.max(2, Math.min(6, (playerData.mass || 15) / 10));
        
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    
    // Draw hotspots (areas with death orbs)
    minimap.hotspots.forEach(hotspot => {
      const scale = (MINIMAP_SIZE/2 - 10) / WORLD_RADIUS;
      const hotX = mmX + MINIMAP_SIZE/2 + hotspot.x * scale;
      const hotY = mmY + MINIMAP_SIZE/2 + hotspot.y * scale;
      
      ctx.fillStyle = '#ff8000aa';
      ctx.beginPath();
      ctx.arc(hotX, hotY, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    
    ctx.restore();
  };

  const drawGameUI = (ctx, canvas) => {
    // Game status and boost indicator
    if (gameStatus === 'playing') {
      ctx.save();
      ctx.fillStyle = '#00ffff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'left';
      
      // Current position indicator
      const playerSnake = gameState.players[currentUser?.username || 'Player'];
      if (playerSnake && playerSnake.segments[0]) {
        const pos = playerSnake.segments[0];
        const distance = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
        ctx.fillText(`Position: ${Math.round(distance)}/${WORLD_RADIUS}`, 20, 40);
        ctx.fillText(`Mass: ${playerSnake.mass || playerSnake.segments.length}`, 20, 60);
      }
      
      // Boost status indicator (authentic slither.io)
      if (isSpacePressed) {
        ctx.fillStyle = '#ffff00';
        ctx.fillText('Boost: ACTIVE', 20, 80);
      } else {
        ctx.fillStyle = '#00ff00';
        ctx.fillText('Boost: Hold SPACE', 20, 80);
      }
      
      ctx.restore();
    }
  };

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
                  <p>🖱️ Mouse to steer • <kbd>SPACE</kbd> to boost (hold to continue)</p>
                  {isSpacePressed && (
                    <div className="boost-active">
                      ⚡ BOOST ACTIVE - Consuming length!
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
