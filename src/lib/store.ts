import { create } from 'zustand';

export type ViewType = 'dashboard' | 'agents' | 'desktop' | 'store' | 'tickets' | 'terminal' | 'settings' | 'dashboards';

export interface AgentInfo {
  id: string;
  hostname: string;
  os: string;
  platform: string;
  ip: string;
  version: string;
  lastSeen: string;
  status: string;
}

export interface MetricData {
  cpu: number;
  memory: number;
  diskTotal: number;
  diskUsed: number;
  uptime: number;
  timestamp: string;
}

export interface StoreAppInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  installCmd: string;
  uninstallCmd: string;
  platform: string;
  version: string;
  featured: boolean;
  installCount: number;
}

export interface TicketInfo {
  id: string;
  agentId: string;
  agentHostname: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  replies: TicketReplyInfo[];
}

export interface TicketReplyInfo {
  id: string;
  isAdmin: boolean;
  authorName: string;
  message: string;
  createdAt: string;
}

export interface UserInfo {
  id: string;
  username: string;
  role: string;
  totpEnabled: boolean;
  createdAt: string;
}

interface AppState {
  // Auth
  isAuthenticated: boolean;
  is2FARequired: boolean;
  is2FAVerified: boolean;
  currentUser: UserInfo | null;
  pendingUserId: string | null;

  // Navigation
  currentView: ViewType;
  sidebarOpen: boolean;

  // Selected agent
  selectedAgentId: string | null;

  // Theme
  accentColor: string;

  // Actions
  login: (user: UserInfo, requires2FA: boolean) => void;
  verify2FA: () => void;
  logout: () => void;
  setView: (view: ViewType) => void;
  toggleSidebar: () => void;
  setSelectedAgent: (id: string | null) => void;
  setAccentColor: (color: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isAuthenticated: false,
  is2FARequired: false,
  is2FAVerified: false,
  currentUser: null,
  pendingUserId: null,
  currentView: 'dashboard',
  sidebarOpen: true,
  selectedAgentId: null,
  accentColor: '#6366f1',

  login: (user, requires2FA) =>
    set({
      pendingUserId: user.id,
      currentUser: user,
      is2FARequired: requires2FA,
      is2FAVerified: !requires2FA,
      isAuthenticated: !requires2FA,
    }),

  verify2FA: () =>
    set({ is2FAVerified: true, isAuthenticated: true, is2FARequired: false }),

  logout: () =>
    set({
      isAuthenticated: false,
      is2FARequired: false,
      is2FAVerified: false,
      currentUser: null,
      pendingUserId: null,
      currentView: 'dashboard',
      selectedAgentId: null,
    }),

  setView: (view) => set({ currentView: view }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSelectedAgent: (id) => set({ selectedAgentId: id }),
  setAccentColor: (color) => set({ accentColor: color }),
}));
