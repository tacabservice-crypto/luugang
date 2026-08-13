/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface UserProfile {
  earnings?: number;
  id: string;
  username: string;
  email?: string;
  phone?: string;
  location?: string;
  avatar: string;
  balance: number;
  winCount: number;
  lossCount: number;
  isOfflinePreference?: boolean;
  vip?: { tier: string; expires: number; };
  role?: string;
  password?: string; // In a real app, this should be securely hashed.
  linkedAgentId?: string;
  emailOtpVerifiedAt?: number;
  firebaseUid?: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdrawal' | 'bet_escrow_locked' | 'bet_escrow_refund' | 'win_payout' | 'app_commission' | 'refund';
  amount: number;
  timestamp: number;
  matchId?: string;
  description: string;
  status?: 'pending' | 'approved' | 'rejected' | 'completed';
}

export interface ManualTransactionRequest {
  id: string;
  userId: string;
  username: string;
  agentId?: string;
  agentUsername?: string;
  managedBy?: 'admin' | 'agent';
  resolvedBy?: string;
  resolverUsername?: string;
  amount: number;
  phone: string; // For withdrawals, this is the destination phone number
  senderPhone?: string; // For deposits, this is the source phone number
  provider: string;
  transactionType: 'deposit' | 'withdraw';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export type ManualTransaction = ManualTransactionRequest;


export type PlayerColor = 'red' | 'green' | 'yellow' | 'blue';

export interface LudoPlayer {
  userId: string;
  username: string;
  avatar: string;
  color: PlayerColor;
  isHost: boolean;
  isReady: boolean;
  status: 'online' | 'offline' | 'left';
  winCount?: number;
  lossCount?: number;
  balance?: number;
  inactivityTimer?: number;
}

export interface LudoToken {
  id: string; // "token_red_0", "token_red_1", etc.
  ownerId: string;
  color: PlayerColor;
  position: number; // -1 = home base, 0 = start space, 51-55 = home stretch, 56 = finished goal
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isSpectator?: boolean;
}

export interface GameLog {
  id: string;
  timestamp: number;
  text: string;
}

export interface GameState {
  turn: number; // Index of the player whose turn it is in the player list
  diceRoll: number | null;
  lastDiceRoll?: number | null;
  hasRolled: boolean;
  turnTimer: number; // Seconds remaining for current player to make a move
  tokens: LudoToken[];
  winnerId: string | null;
  completionReason?: 'forfeit' | 'inactivity' | 'all_tokens_home';
  endReasonText?: string;
  escrowBalance: number;
  logs: GameLog[];
  chat: ChatMessage[];
  lastActivity: number;
  consecutiveSixes?: number; // Track consecutive rolls of 6
}

export interface GameRoom {
  id: string; // Room code (e.g., "AB82D")
  status: 'waiting' | 'playing' | 'completed' | 'cancelled';
  betAmount: number; // $0, $1, $5, $10, $25, $50
  players: LudoPlayer[];
  spectators?: Partial<UserProfile>[]; // User profiles of spectators
  gameState: GameState;
  createdAt: number;
  capacity?: number; // 2, 3, 4 players
  gameMode?: 'solo' | 'team'; // 'solo' or 'team'
  pendingPlayers?: LudoPlayer[]; // Players waiting for host approval
  rejectionReason?: string; // Reason for join rejection, for client-side feedback
  tournamentDetails?: { tournamentId: string; matchId: string; };
}

// ==========================================
// AGENT SYSTEM TYPES
// ==========================================

export interface Agent {
  id: string;
  username: string;
  phone: string;
  password?: string; // Should be hashed
  promoCode?: string;
  location?: string;
  commissionRate: number;
  balance: number;
  floatBalance?: number;
  status?: 'Active' | 'Suspended';
  createdAt: number;
}

export interface AgentTransaction {
  id: string;
  agentId: string;
  type: 'FloatPurchase' | 'PlayerDeposit' | 'PlayerWithdrawal' | 'deposit' | 'withdrawal';
  amount: number;
  discountAmount?: number; // For FloatPurchase, records the profit made by the platform owner
  playerId?: string; // For PlayerDeposit, the user who received the funds
  playerName?: string;
  timestamp: number;
  description: string;
}

export interface AgentRequest {
  id: string;
  agentId: string;
  agentUsername: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string; // Admin user ID
  resolverUsername?: string;
}

export interface PlayerAgentRequest {
  id: string;
  playerId: string;
  playerUsername: string;
  playerAvatar: string;
  agentId: string;
  playerPhone: string; // for withdrawals
  senderPhone?: string; // for deposits
  provider: 'evc' | 'edahab' | 'sahal' | 'zaad' | 'premier' | string;
  type: 'deposit' | 'withdrawal' | 'withdraw';
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  resolvedAt?: number;
}

export interface VipSubscription {
  id: string;
  userId: string;
  tier: string; // e.g., 'gold'
  status: 'Active' | 'Expired' | 'Cancelled';
  startDate: number;
  endDate: number;
}

export interface Tournament {
  id: string;
  name: string;
  entryFee: number;
  prizePool: number;
  status: 'registration_open' | 'in_progress' | 'completed' | 'cancelled';
  players: { userId: string; username: string; avatar: string; }[];
  maxPlayers: number;
  startDate: number;
  endDate: number;
  winnerId: string | null;
  currentRound: number;
  matches: TournamentMatch[]; // References to TournamentMatch IDs or embedded matches
  createdAt: number;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  round: number;
  player1: { userId: string; username: string; avatar: string; } | null;
  player2: { userId: string; username: string; avatar: string; } | null;
  winnerId: string | null;
  roomId: string | null; // Reference to a GameRoom ID if played in a Ludo room
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}
