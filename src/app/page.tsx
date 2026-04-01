'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore, ViewType } from '@/lib/store';
import {
  LayoutDashboard, Monitor, Tv, Store, Ticket, Terminal,
  Settings, BarChart3, Users, Shield, LogOut, Menu, X,
  ChevronRight, ChevronLeft, Search, Bell, RefreshCw, Power, Eye, EyeOff,
  Check, AlertTriangle, Clock, Plus, Trash2, Edit, Download,
  Upload, Cpu, HardDrive, MemoryStick, Activity, Globe,
  Lock, Palette, Database, Wrench, Star, ArrowUp, ArrowDown,
  MoreVertical, Send, Reply, Filter, ChevronDown, Minus,
  Maximize2, MousePointer, Keyboard, Command, Package,
  CheckCircle2, XCircle, Info, TrendingUp, Server, UserPlus, File, Folder,
  Key, Smartphone, QrCode, Copy, ExternalLink, Play,
  Pause, Square, MousePointerClick
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

/* ─── Login View ────────────────────────────────────────── */
function LoginView() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [totpRequired, setTotpRequired] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const login = useAppStore((s) => s.login);
  const verify2FA = useAppStore((s) => s.verify2FA);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error('Неверные учетные данные'); setLoading(false); return; }
      if (data.requires2FA) {
        setTotpRequired(true);
        setPendingUser(data);
      } else {
        login({ id: data.userId, username: data.username, role: data.role, totpEnabled: data.totpEnabled, createdAt: '' }, false);
        toast.success('Добро пожаловать!');
      }
    } catch { toast.error('Ошибка соединения'); }
    setLoading(false);
  };

  const handleTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: pendingUser.userId, code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error('Неверный код TOTP'); setLoading(false); return; }
      verify2FA();
      toast.success('Аутентификация успешна!');
    } catch { toast.error('Ошибка'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-white">RemoteAdmin</h1>
          <p className="text-slate-400 mt-1">Панель управления v4.0</p>
        </div>
        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
          <CardContent className="pt-6">
            {!totpRequired ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Имя пользователя</Label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" className="bg-slate-900 border-slate-600 text-white" required />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Пароль</Label>
                  <div className="relative">
                    <Input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} placeholder="••••••••" className="bg-slate-900 border-slate-600 text-white pr-10" required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                  Войти
                </Button>
                <p className="text-center text-xs text-slate-500 mt-4">Демо: admin / admin123</p>
              </form>
            ) : (
              <form onSubmit={handleTotp} className="space-y-4">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/20 mb-2">
                    <Smartphone className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Двухфакторная аутентификация</h3>
                  <p className="text-sm text-slate-400">Введите код из приложения-аутентификатора</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">TOTP код</Label>
                  <Input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="000000" maxLength={6} className="bg-slate-900 border-slate-600 text-white text-center text-2xl tracking-[0.5em]" required />
                </div>
                <Button type="submit" className="w-full" disabled={loading || totpCode.length !== 6}>
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                  Подтвердить
                </Button>
                <button type="button" onClick={() => { setTotpRequired(false); setPendingUser(null); }} className="w-full text-sm text-slate-400 hover:text-white text-center">
                  Назад к входу
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─── Sidebar ────────────────────────────────────────────── */
const navItems: { icon: React.ReactNode; label: string; view: ViewType }[] = [
  { icon: <LayoutDashboard className="w-4 h-4" />, label: 'Обзор', view: 'dashboard' },
  { icon: <Monitor className="w-4 h-4" />, label: 'Агенты', view: 'agents' },
  { icon: <Tv className="w-4 h-4" />, label: 'Рабочий стол', view: 'desktop' },
  { icon: <Store className="w-4 h-4" />, label: 'App Store', view: 'store' },
  { icon: <Ticket className="w-4 h-4" />, label: 'Тикеты', view: 'tickets' },
  { icon: <Terminal className="w-4 h-4" />, label: 'Терминал', view: 'terminal' },
  { icon: <BarChart3 className="w-4 h-4" />, label: 'Дашборды', view: 'dashboards' },
  { icon: <Settings className="w-4 h-4" />, label: 'Настройки', view: 'settings' },
];

function Sidebar() {
  const { currentView, setView, currentUser, logout, sidebarOpen, toggleSidebar } = useAppStore();
  return (
    <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} h-screen bg-card border-r border-border flex flex-col transition-all duration-300 flex-shrink-0`}>
      <div className="p-4 flex items-center gap-3 border-b border-border">
        <Shield className="w-6 h-6 text-primary flex-shrink-0" />
        {sidebarOpen && <span className="font-bold text-lg truncate">RemoteAdmin</span>}
        <button onClick={toggleSidebar} className="ml-auto text-muted-foreground hover:text-foreground">
          {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${currentView === item.view ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
          >
            {item.icon}
            {sidebarOpen && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </nav>
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-primary" />
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{currentUser?.username}</p>
              <p className="text-xs text-muted-foreground truncate">{currentUser?.role}</p>
            </div>
          )}
        </div>
        <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {sidebarOpen && <span>Выход</span>}
        </button>
      </div>
    </aside>
  );
}

/* ─── Dashboard Overview ─────────────────────────────────── */
function DashboardView() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      setStats(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchStats(); }, [fetchStats]);

  if (loading || !stats) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const s = stats || {};
  const ag = s.agents || {};
  const tk = s.tickets || {};
  const st = s.store || {};
  const mt = s.metrics || {};

  const statCards = [
    { label: 'Всего агентов', value: ag.total || 0, sub: `${ag.online || 0} онлайн`, icon: <Monitor className="w-5 h-5" />, color: 'text-blue-500' },
    { label: 'Открытых тикетов', value: tk.open || 0, sub: `из ${tk.total || 0}`, icon: <Ticket className="w-5 h-5" />, color: 'text-amber-500' },
    { label: 'Приложений в Store', value: st.totalApps || 0, sub: `${st.totalInstallations || 0} установок`, icon: <Package className="w-5 h-5" />, color: 'text-green-500' },
    { label: 'Ср. загрузка CPU', value: `${Math.round(mt.avgCpu || 0)}%`, sub: `RAM: ${Math.round(mt.avgMemory || 0)}%`, icon: <Cpu className="w-5 h-5" />, color: 'text-purple-500' },
  ];

  const recentLogs = s.recentAuditLogs || [];
  const ticketStats = tk.byStatus || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Обзор системы</h2>
          <p className="text-muted-foreground">Текущее состояние RemoteAdmin v4</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats}><RefreshCw className="w-4 h-4 mr-2" />Обновить</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-3xl font-bold mt-1">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                </div>
                <div className={`${s.color} opacity-80`}>{s.icon}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Последние события</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {(stats.recentLogs || []).map((log: any, i: number) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${log.action === 'login' ? 'bg-green-500' : log.action.includes('delete') ? 'bg-red-500' : 'bg-blue-500'}`} />
                  <div className="min-w-0">
                    <p className="truncate">{log.detail}</p>
                    <p className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString('ru')}</p>
                  </div>
                </div>
              ))}
              {(!stats.recentLogs || stats.recentLogs.length === 0) && <p className="text-sm text-muted-foreground">Нет событий</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Тикеты по статусам</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.ticketStats || {}).map(([status, count]: [string, any]) => {
                const colors: Record<string, string> = { open: 'bg-red-500', in_progress: 'bg-amber-500', resolved: 'bg-green-500', closed: 'bg-slate-500' };
                const labels: Record<string, string> = { open: 'Открытые', in_progress: 'В работе', resolved: 'Решённые', closed: 'Закрытые' };
                return (
                  <div key={status} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${colors[status] || 'bg-slate-400'}`} />
                    <span className="text-sm flex-1">{labels[status] || status}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─── Agents View ────────────────────────────────────────── */
function AgentsView() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const { setSelectedAgent, setView } = useAppStore();

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(d => { setAgents(d); setLoading(false); });
  }, []);

  const openDesktop = (id: string) => { setSelectedAgent(id); setView('desktop'); };

  useEffect(() => {
    if (selectedId) {
      fetch(`/api/agents/${selectedId}`).then(r => r.json()).then(d => setSelected(d));
    }
  }, [selectedId]);

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Агенты</h2>
        <p className="text-muted-foreground">Управление подключенными устройствами</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <div className="space-y-2">
            {agents.map((a: any) => (
              <Card key={a.id} className={`cursor-pointer transition-colors hover:bg-accent/50 ${selectedId === a.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedId(a.id)}>
                <CardContent className="py-4 px-4 flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${a.status === 'online' ? 'bg-green-500' : 'bg-slate-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{a.hostname}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.os}</p>
                  </div>
                  {a.latestMetric && (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-medium">{a.latestMetric.cpu}%</p>
                      <p className="text-xs text-muted-foreground">CPU</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        <div className="lg:col-span-2">
          {selected ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{selected.hostname}</CardTitle>
                  <CardDescription>{selected.os} • {selected.ip} • v{selected.version}</CardDescription>
                </div>
                <Badge variant={selected.status === 'online' ? 'default' : 'secondary'}>
                  {selected.status === 'online' ? 'Онлайн' : 'Оффлайн'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {selected.latestMetric ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <Cpu className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                        <p className="text-lg font-bold">{selected.latestMetric.cpu}%</p>
                        <p className="text-xs text-muted-foreground">CPU</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <MemoryStick className="w-5 h-5 mx-auto mb-1 text-green-500" />
                        <p className="text-lg font-bold">{selected.latestMetric.memory}%</p>
                        <p className="text-xs text-muted-foreground">RAM</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <HardDrive className="w-5 h-5 mx-auto mb-1 text-amber-500" />
                        <p className="text-lg font-bold">{Math.round(selected.latestMetric.diskUsed / selected.latestMetric.diskTotal * 100)}%</p>
                        <p className="text-xs text-muted-foreground">Диск</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-muted/50">
                        <Clock className="w-5 h-5 mx-auto mb-1 text-purple-500" />
                        <p className="text-lg font-bold">{Math.floor(selected.latestMetric.uptime / 3600)}ч</p>
                        <p className="text-xs text-muted-foreground">Uptime</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Диск: {Math.round(selected.latestMetric.diskUsed)}ГБ / {Math.round(selected.latestMetric.diskTotal)}ГБ</p>
                      <Progress value={selected.latestMetric.diskUsed / selected.latestMetric.diskTotal * 100} />
                    </div>
                  </>
                ) : <p className="text-sm text-muted-foreground">Нет данных метрик</p>}

                {selected.metricsHistory && selected.metricsHistory.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Загрузка CPU (последние 24ч)</p>
                    <div className="flex items-end gap-1 h-20">
                      {selected.metricsHistory.slice(-24).map((m: any, i: number) => (
                        <div key={i} className="flex-1 bg-blue-500/80 rounded-t" style={{ height: `${m.cpu}%` }} title={`${m.cpu}%`} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openDesktop(selected.id)} disabled={selected.status !== 'online'}>
                    <Tv className="w-4 h-4 mr-2" />Рабочий стол
                  </Button>
                  <Button size="sm" variant="outline" disabled={selected.status !== 'online'}>
                    <Terminal className="w-4 h-4 mr-2" />Терминал
                  </Button>
                  <Button size="sm" variant="outline" disabled={selected.status !== 'online'}>
                    <Power className="w-4 h-4 mr-2" />Заставка
                  </Button>
                  <Button size="sm" variant="outline" disabled={selected.status !== 'online'}>
                    <Package className="w-4 h-4 mr-2" />Приложения
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Monitor className="w-12 h-12 mb-3 opacity-30" />
                <p>Выберите агент для просмотра деталей</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Remote Desktop View ────────────────────────────────── */
function DesktopView() {
  const { selectedAgentId, agents: _ } = useAppStore();
  const [connected, setConnected] = useState(false);
  const [streaming, setStreaming] = useState(false);

  // In a real app, this would connect via WebSocket to stream screenshots
  // For the demo, we show a simulated desktop view
  const fakeScreenshot = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect fill="#1a1a2e" width="960" height="540"/><rect fill="#16213e" x="0" y="0" width="960" height="40" rx="0"/><circle cx="20" cy="20" r="6" fill="#ff5f57"/><circle cx="40" cy="20" r="6" fill="#febc2e"/><circle cx="60" cy="20" r="6" fill="#28c840"/><text x="480" y="270" text-anchor="middle" fill="#ffffff" font-size="24" font-family="sans-serif" opacity="0.3">Рабочий стол ${selectedAgentId || ''}</text></svg>`)}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Удалённый рабочий стол</h2>
          <p className="text-muted-foreground">{selectedAgentId ? 'Агент выбран' : 'Агент не выбран'}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={streaming ? 'destructive' : 'default'} onClick={() => setStreaming(!streaming)}>
            {streaming ? <><Pause className="w-4 h-4 mr-2" />Стоп</> : <><Play className="w-4 h-4 mr-2" />Трансляция</>}
          </Button>
          <Button size="sm" variant="outline"><Maximize2 className="w-4 h-4 mr-2" />Полный экран</Button>
        </div>
      </div>
      <Card className="overflow-hidden">
        <div className="relative bg-black aspect-video flex items-center justify-center cursor-crosshair" onClick={() => {}}>
          {/* Simulated desktop - in real app this would be a streaming canvas */}
          <img src={fakeScreenshot} alt="Desktop" className="w-full h-full object-contain" />
          {/* Desktop control overlay */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 bg-black/60 backdrop-blur rounded-lg px-3 py-1.5">
            <button className="p-1.5 rounded hover:bg-white/20 text-white/80 transition"><MousePointerClick className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-white/20 text-white/80 transition"><Keyboard className="w-4 h-4" /></button>
            <button className="p-1.5 rounded hover:bg-white/20 text-white/80 transition"><MousePointer className="w-4 h-4" /></button>
            <Separator orientation="vertical" className="h-6 bg-white/20" />
            <button className="p-1.5 rounded hover:bg-white/20 text-white/80 transition text-xs font-bold">Ctrl</button>
            <button className="p-1.5 rounded hover:bg-white/20 text-white/80 transition text-xs font-bold">Alt</button>
            <button className="p-1.5 rounded hover:bg-white/20 text-white/80 transition text-xs font-bold">Del</button>
            <Separator orientation="vertical" className="h-6 bg-white/20" />
            <button className="p-1.5 rounded hover:bg-white/20 text-white/80 transition"><Power className="w-4 h-4" /></button>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Управление</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Заставка', icon: <Monitor className="w-4 h-4" />, desc: 'Экран «Обновление»' },
              { label: 'Ctrl+Alt+Del', icon: <Keyboard className="w-4 h-4" />, desc: 'Отправить комбинацию' },
              { label: 'Блокировка', icon: <Lock className="w-4 h-4" />, desc: 'Заблокировать ПК' },
              { label: 'Скриншот', icon: <Eye className="w-4 h-4" />, desc: 'Сделать снимок' },
            ].map(a => (
              <Button key={a.label} variant="outline" className="h-auto py-3 flex-col gap-1">
                {a.icon}
                <span className="text-xs font-medium">{a.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Store View ─────────────────────────────────────────── */
function StoreView() {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editApp, setEditApp] = useState<any>(null);
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [serverFiles, setServerFiles] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [installDialog, setInstallDialog] = useState(false);
  const [installAppId, setInstallAppId] = useState('');
  const [installTarget, setInstallTarget] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const emptyForm = { name: '', description: '', category: 'General', icon: '📦', installCmd: '', installArgs: '/S', uninstallCmd: '', platform: 'windows', version: '1.0.0', featured: false, fileName: '', fileSize: 0 };
  const [form, setForm] = useState(emptyForm);

  const fetchApps = useCallback(async () => {
    const res = await fetch('/api/store');
    setApps(await res.json());
    setLoading(false);
  }, []);

  const fetchFiles = useCallback(async () => {
    const res = await fetch('/api/files');
    const data = await res.json();
    setServerFiles(data.files || []);
  }, []);

  const fetchAgents = useCallback(async () => {
    const res = await fetch('/api/agents');
    setAgents(await res.json());
  }, []);

  useEffect(() => { void fetchApps(); void fetchFiles(); void fetchAgents(); }, [fetchApps, fetchFiles, fetchAgents]);

  const saveApp = async () => {
    const method = editApp ? 'PUT' : 'POST';
    const body = editApp ? { ...form, id: editApp.id } : form;
    await fetch('/api/store', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setDialogOpen(false); setEditApp(null); setForm(emptyForm);
    void fetchApps();
    toast.success(editApp ? 'Приложение обновлено' : 'Приложение создано');
  };

  const deleteApp = async (id: string) => {
    await fetch('/api/store', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    void fetchApps(); toast.success('Приложение удалено');
  };

  const edit = (app: any) => {
    setEditApp(app);
    setForm({ name: app.name, description: app.description, category: app.category, icon: app.icon, installCmd: app.installCmd, installArgs: app.installArgs || '/S', uninstallCmd: app.uninstallCmd || '', platform: app.platform, version: app.version, featured: app.featured, fileName: app.fileName || '', fileSize: app.fileSize || 0 });
    setDialogOpen(true);
  };

  const selectFile = (f: any) => {
    setForm(prev => ({ ...prev, installCmd: `/app-files/${f.path}`, fileName: f.name, fileSize: f.size }));
    setFileBrowserOpen(false);
    toast.success(`Выбран файл: ${f.path}`);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mkdir', folderName: newFolderName }) });
    setNewFolderName('');
    void fetchFiles();
    toast.success('Папка создана');
  };

  const remoteInstall = async () => {
    toast.success(`Установка отправлена на ${installTarget}`);
    setInstallDialog(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const filesOnly = serverFiles.filter(f => !f.isDir);
  const foldersOnly = serverFiles.filter(f => f.isDir);
  const formatSize = (b: number) => b > 1048576 ? `${(b / 1048576).toFixed(1)} МБ` : b > 1024 ? `${(b / 1024).toFixed(0)} КБ` : `${b} Б`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">App Store</h2>
          <p className="text-muted-foreground">Приложения устанавливаются из файлов на сервере</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { void fetchFiles(); setFileBrowserOpen(true); }}>
            <Folder className="w-4 h-4 mr-2" />Файлы на сервере
          </Button>
          <Button size="sm" onClick={() => { setEditApp(null); setForm(emptyForm); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />Добавить
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {apps.map((app: any) => (
          <Card key={app.id} className="relative group">
            {app.featured && <div className="absolute top-2 right-2"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /></div>}
            <CardContent className="pt-4">
              <div className="text-3xl mb-2">{app.icon}</div>
              <h3 className="font-semibold text-sm">{app.name}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{app.description}</p>
              {app.installCmd && (
                <p className="text-xs bg-muted rounded px-2 py-1 mt-2 font-mono truncate" title={app.installCmd}>{app.installCmd}</p>
              )}
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="outline" className="text-xs">{app.category}</Badge>
                <Badge variant="secondary" className="text-xs">{app.platform}</Badge>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground">установок</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setInstallAppId(app.id); setInstallDialog(true); }} className="p-1 rounded hover:bg-accent text-green-600" title="Установить"><Download className="w-3.5 h-3.5" /></button>
                  <button onClick={() => edit(app)} className="p-1 rounded hover:bg-accent text-blue-600" title="Редактировать"><Edit className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteApp(app.id)} className="p-1 rounded hover:bg-accent text-red-600" title="Удалить"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit App Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editApp ? 'Редактировать' : 'Новое приложение'}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Иконка</Label><Input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="📦" /></div>
              <div className="space-y-1"><Label className="text-xs">Категория</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Название</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Описание</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Путь к файлу установки на сервере</Label>
                <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={() => { void fetchFiles(); setFileBrowserOpen(true); }}>
                  <Folder className="w-3 h-3 mr-1" />Выбрать файл
                </Button>
              </div>
              <Input value={form.installCmd} onChange={e => setForm({ ...form, installCmd: e.target.value })} placeholder="/app-files/vscode/setup.exe" />
              <p className="text-xs text-muted-foreground">Укажите путь к файлу в папке app-files. Положите файлы в public/app-files/</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Аргументы установки</Label><Input value={form.installArgs} onChange={e => setForm({ ...form, installArgs: e.target.value })} placeholder="/S /quiet" /></div>
              <div className="space-y-1"><Label className="text-xs">Команда удаления</Label><Input value={form.uninstallCmd} onChange={e => setForm({ ...form, uninstallCmd: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label className="text-xs">Платформа</Label>
                <Select value={form.platform} onValueChange={v => setForm({ ...form, platform: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                    <SelectItem value="windows">Windows</SelectItem><SelectItem value="linux">Linux</SelectItem><SelectItem value="both">Обе</SelectItem>
                  </SelectContent></Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Версия</Label><Input value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} /></div>
              <div className="flex items-end pb-1"><div className="flex items-center gap-2"><Switch checked={form.featured} onCheckedChange={v => setForm({ ...form, featured: v })} /><Label className="text-xs">Рекоменд.</Label></div></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={saveApp} disabled={!form.name.trim()}>{editApp ? 'Сохранить' : 'Создать'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Browser Dialog */}
      <Dialog open={fileBrowserOpen} onOpenChange={setFileBrowserOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader><DialogTitle>Файлы на сервере (public/app-files/)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Новая папка..." onKeyDown={e => e.key === 'Enter' && createFolder()} />
              <Button variant="outline" size="sm" onClick={createFolder}><Folder className="w-4 h-4 mr-1" />Создать</Button>
            </div>
            <div className="border rounded-lg max-h-64 overflow-y-auto">
              {foldersOnly.length === 0 && filesOnly.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Folder className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Папка пуста. Создайте папку и положите файлы.</p>
                  <p className="text-xs mt-1">Путь: public/app-files/</p>
                </div>
              )}
              {foldersOnly.map(f => (
                <div key={f.path} className="flex items-center gap-3 px-3 py-2 text-sm border-b last:border-0">
                  <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="flex-1 font-medium">{f.name}</span>
                  <Badge variant="outline" className="text-xs">Папка</Badge>
                </div>
              ))}
              {filesOnly.map(f => (
                <div key={f.path} className="flex items-center gap-3 px-3 py-2 text-sm border-b last:border-0 hover:bg-accent/50 cursor-pointer transition-colors" onClick={() => selectFile(f)}>
                  <File className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="flex-1 truncate font-mono text-xs">{f.path}</span>
                  <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
                  <button className="p-1 rounded hover:bg-primary/10 text-primary"><Check className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Выберите файл — его путь автоматически заполнится в поле установки. Файлы хранятся в public/app-files/</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Install Dialog */}
      <Dialog open={installDialog} onOpenChange={setInstallDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Удалённая установка</DialogTitle><DialogDescription>Выберите агента для установки приложения</DialogDescription></DialogHeader>
          <div className="py-2">
            <Select value={installTarget} onValueChange={setInstallTarget}>
              <SelectTrigger><SelectValue placeholder="Выберите агента..." /></SelectTrigger>
              <SelectContent>
                {agents.filter((a: any) => a.status === 'online').map((a: any) => (
                  <SelectItem key={a.id} value={a.hostname}>{a.hostname} ({a.ip})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {agents.filter((a: any) => a.status === 'online').length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">Нет агентов онлайн</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallDialog(false)}>Отмена</Button>
            <Button onClick={remoteInstall} disabled={!installTarget}><Download className="w-4 h-4 mr-2" />Установить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Tickets View ───────────────────────────────────────── */
function TicketsView() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { currentUser } = useAppStore();

  const fetchTickets = useCallback(async () => {
    const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
    const res = await fetch(`/api/tickets${params}`);
    const data = await res.json();
    setTickets(data);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void fetchTickets(); }, [fetchTickets]);

  const selectTicket = async (id: string) => {
    const res = await fetch(`/api/tickets/${id}`);
    const data = await res.json();
    setSelectedTicket(data);
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: selectedTicket.id, message: replyText, isAdmin: true, authorId: currentUser?.id }),
    });
    setReplyText('');
    selectTicket(selectedTicket.id);
    fetchTickets();
  };

  const updateStatus = async (status: string) => {
    if (!selectedTicket) return;
    await fetch(`/api/tickets/${selectedTicket.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    selectTicket(selectedTicket.id);
    fetchTickets();
  };

  const priorityColors: Record<string, string> = { critical: 'destructive', high: 'destructive', normal: 'secondary', low: 'outline' };
  const statusColors: Record<string, string> = { open: 'destructive', in_progress: 'default', resolved: 'secondary', closed: 'outline' };
  const statusLabels: Record<string, string> = { open: 'Открыт', in_progress: 'В работе', resolved: 'Решён', closed: 'Закрыт' };
  const priorityLabels: Record<string, string> = { critical: 'Критический', high: 'Высокий', normal: 'Обычный', low: 'Низкий' };

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4 h-[calc(100vh-10rem)]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Тикеты</h2>
          <p className="text-muted-foreground">Запросы пользователей на ремонт и настройку</p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="open">Открытые</SelectItem>
              <SelectItem value="in_progress">В работе</SelectItem>
              <SelectItem value="resolved">Решённые</SelectItem>
              <SelectItem value="closed">Закрытые</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0">
        <div className="lg:col-span-2 space-y-1 overflow-y-auto max-h-[calc(100vh-16rem)]">
          {tickets.map((t: any) => (
            <Card key={t.id} className={`cursor-pointer transition-colors hover:bg-accent/50 ${selectedTicket?.id === t.id ? 'ring-2 ring-primary' : ''}`} onClick={() => selectTicket(t.id)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.agent?.hostname}</p>
                  </div>
                  <Badge variant={priorityColors[t.priority] as any} className="text-xs flex-shrink-0">{priorityLabels[t.priority]}</Badge>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={statusColors[t.status] as any} className="text-xs">{statusLabels[t.status]}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString('ru')}</span>
                  {t._count?.replies > 0 && <span className="text-xs text-muted-foreground ml-auto">{t._count.replies} 💬</span>}
                </div>
              </CardContent>
            </Card>
          ))}
          {tickets.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Нет тикетов</p>}
        </div>
        <div className="lg:col-span-3">
          {selectedTicket ? (
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{selectedTicket.subject}</CardTitle>
                    <CardDescription>от {selectedTicket.agent?.hostname} • {new Date(selectedTicket.createdAt).toLocaleString('ru')}</CardDescription>
                  </div>
                  <Select value={selectedTicket.status} onValueChange={updateStatus}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="flex-1 overflow-y-auto py-4">
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{selectedTicket.agent?.hostname}</span>
                      <Badge variant="outline" className="text-xs">{priorityLabels[selectedTicket.priority]}</Badge>
                    </div>
                    <p className="text-sm">{selectedTicket.message}</p>
                  </div>
                  {(selectedTicket.replies || []).map((r: any) => (
                    <div key={r.id} className={`rounded-lg p-3 ${r.isAdmin ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium">{r.isAdmin ? r.author?.username : selectedTicket.agent?.hostname}</span>
                        <Badge variant={r.isAdmin ? 'default' : 'outline'} className="text-xs">{r.isAdmin ? 'Админ' : 'Пользователь'}</Badge>
                        <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString('ru')}</span>
                      </div>
                      <p className="text-sm">{r.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
              <Separator />
              <div className="p-3 flex gap-2">
                <Input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Введите ответ..." onKeyDown={e => e.key === 'Enter' && sendReply()} />
                <Button onClick={sendReply} disabled={!replyText.trim()}><Send className="w-4 h-4" /></Button>
              </div>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-muted-foreground text-center">
                <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Выберите тикет</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Terminal View ──────────────────────────────────────── */
function TerminalView() {
  const [lines, setLines] = useState<string[]>(['$ RemoteAdmin Terminal v4.0', '$ Подключение к агенту...', '$ Готово. Ожидание команд.', '']);
  const [input, setInput] = useState('');
  const { selectedAgentId } = useAppStore();

  const execCommand = () => {
    if (!input.trim()) return;
    setLines(prev => [...prev, `$ ${input}`]);
    // Simulated responses
    const cmd = input.trim().toLowerCase();
    if (cmd === 'help') {
      setLines(prev => [...prev, 'Доступные команды: help, clear, sysinfo, ping, whoami, date, ls, top']);
    } else if (cmd === 'clear') {
      setLines([]);
    } else if (cmd === 'sysinfo') {
      setLines(prev => [...prev, `OS: ${selectedAgentId || 'N/A'} | Platform: Node.js | Uptime: ${Math.floor(process.uptime())}s`]);
    } else if (cmd === 'date') {
      setLines(prev => [...prev, new Date().toLocaleString('ru')]);
    } else if (cmd === 'whoami') {
      setLines(prev => [...prev, 'admin (superadmin)']);
    } else {
      setLines(prev => [...prev, `Команда выполнена: ${input}`, '']);
    }
    setInput('');
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Терминал</h2>
        <p className="text-muted-foreground">Удалённое выполнение команд на агенте</p>
      </div>
      <Card className="overflow-hidden">
        <div className="bg-slate-900 text-green-400 font-mono text-sm p-4 h-[500px] overflow-y-auto" onClick={() => document.getElementById('term-input')?.focus()}>
          {lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
          ))}
          <div className="flex items-center gap-2">
            <span>$</span>
            <input
              id="term-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') execCommand(); }}
              className="flex-1 bg-transparent outline-none text-green-400 font-mono caret-green-400"
              autoFocus
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ─── Dashboards View ────────────────────────────────────── */
function DashboardsView() {
  const [agents, setAgents] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [installations, setInstallations] = useState<any[]>([]);
  const [tab, setTab] = useState('system');

  useEffect(() => {
    Promise.all([
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/tickets').then(r => r.json()),
      fetch('/api/store').then(r => r.json()),
    ]).then(([a, t, s]) => {
      setAgents(a);
      setTickets(t);
      setInstallations(s.flatMap((app: any) => (app.installations || []).map((inst: any) => ({ ...inst, appName: app.name, appIcon: app.icon }))));
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Дашборды</h2>
        <p className="text-muted-foreground">Аналитика и мониторинг системы</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="system">Загрузка системы</TabsTrigger>
          <TabsTrigger value="tickets">Статистика тикетов</TabsTrigger>
          <TabsTrigger value="analytics">Аналитика Store</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.filter((a: any) => a.latestMetric).map((a: any) => (
              <Card key={a.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{a.hostname}</CardTitle>
                    <Badge variant={a.status === 'online' ? 'default' : 'secondary'} className="text-xs">{a.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span>CPU</span><span>{a.latestMetric.cpu}%</span></div>
                    <Progress value={a.latestMetric.cpu} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span>RAM</span><span>{a.latestMetric.memory}%</span></div>
                    <Progress value={a.latestMetric.memory} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1"><span>Диск</span><span>{Math.round(a.latestMetric.diskUsed / a.latestMetric.diskTotal * 100)}%</span></div>
                    <Progress value={a.latestMetric.diskUsed / a.latestMetric.diskTotal * 100} className="h-2" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Uptime: {Math.floor(a.latestMetric.uptime / 3600)}ч {Math.floor((a.latestMetric.uptime % 3600) / 60)}м • {a.os}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="tickets" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Всего', value: tickets.length, color: 'bg-blue-500' },
              { label: 'Открытые', value: tickets.filter((t: any) => t.status === 'open').length, color: 'bg-red-500' },
              { label: 'В работе', value: tickets.filter((t: any) => t.status === 'in_progress').length, color: 'bg-amber-500' },
              { label: 'Решённые', value: tickets.filter((t: any) => t.status === 'resolved').length, color: 'bg-green-500' },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold">{s.value}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Все тикеты</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Тема</TableHead><TableHead>Агент</TableHead><TableHead>Приоритет</TableHead><TableHead>Статус</TableHead><TableHead>Дата</TableHead></TableRow></TableHeader>
                <TableBody>
                  {tickets.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.subject}</TableCell>
                      <TableCell>{t.agent?.hostname}</TableCell>
                      <TableCell><Badge variant="outline">{t.priority}</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{t.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{new Date(t.createdAt).toLocaleDateString('ru')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Установки приложений</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Приложение</TableHead><TableHead>Агент</TableHead><TableHead>Статус</TableHead><TableHead>Кем</TableHead><TableHead>Дата</TableHead></TableRow></TableHeader>
                <TableBody>
                  {installations.length > 0 ? installations.map((inst: any) => (
                    <TableRow key={inst.id}>
                      <TableCell className="font-medium">{inst.appName}</TableCell>
                      <TableCell>{inst.agent?.hostname || '—'}</TableCell>
                      <TableCell><Badge variant={inst.status === 'installed' ? 'default' : 'destructive'}>{inst.status}</Badge></TableCell>
                      <TableCell>{inst.installedBy || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(inst.createdAt).toLocaleDateString('ru')}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Нет данных об установках</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Settings View ──────────────────────────────────────── */
function SettingsView() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const { currentUser } = useAppStore();

  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'viewer' });

  const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/users');
    const data = await res.json();
    setUsers(data);
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    const map: Record<string, string> = {};
    data.forEach((s: any) => { map[s.key] = s.value; });
    setSettings(map);
  }, []);

  const fetchAudit = useCallback(async () => {
    const res = await fetch('/api/audit?limit=50');
    const json = await res.json();
    setAuditLogs(json.data || json);
  }, []);

  useEffect(() => { void fetchUsers(); void fetchSettings(); void fetchAudit(); }, [fetchUsers, fetchSettings, fetchAudit]);

  const saveUser = async () => {
    const method = editUser ? 'PUT' : 'POST';
    const body = editUser ? { ...userForm, id: editUser.id } : userForm;
    await fetch('/api/users', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setShowUserDialog(false);
    setEditUser(null);
    setUserForm({ username: '', password: '', role: 'viewer' });
    fetchUsers();
    toast.success(editUser ? 'Пользователь обновлён' : 'Пользователь создан');
  };

  const deleteUser = async (id: string) => {
    await fetch('/api/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    fetchUsers();
    toast.success('Пользователь удалён');
  };

  const saveSetting = async (key: string, value: string) => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: [{ key, value }] }),
    });
    fetchSettings();
  };

  const roleLabels: Record<string, string> = { superadmin: 'Суперадмин', admin: 'Администратор', viewer: 'Просмотрщик' };
  const roleBadge: Record<string, string> = { superadmin: 'destructive', admin: 'default', viewer: 'secondary' };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Настройки</h2>
        <p className="text-muted-foreground">Конфигурация системы RemoteAdmin</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="users"><Users className="w-4 h-4 mr-1" />Пользователи</TabsTrigger>
          <TabsTrigger value="security"><Lock className="w-4 h-4 mr-1" />Безопасность</TabsTrigger>
          <TabsTrigger value="design"><Palette className="w-4 h-4 mr-1" />Дизайн</TabsTrigger>
          <TabsTrigger value="agent"><Server className="w-4 h-4 mr-1" />Агент</TabsTrigger>
          <TabsTrigger value="updates"><Download className="w-4 h-4 mr-1" />Обновления</TabsTrigger>
          <TabsTrigger value="audit"><Activity className="w-4 h-4 mr-1" />Аудит</TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditUser(null); setUserForm({ username: '', password: '', role: 'viewer' }); setShowUserDialog(true); }}>
              <UserPlus className="w-4 h-4 mr-2" />Добавить
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Пользователь</TableHead><TableHead>Роль</TableHead><TableHead>2FA</TableHead><TableHead>Создан</TableHead><TableHead className="text-right">Действия</TableHead></TableRow></TableHeader>
                <TableBody>
                  {users.map((u: any) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell><Badge variant={roleBadge[u.role] as any}>{roleLabels[u.role]}</Badge></TableCell>
                      <TableCell>{u.totpEnabled ? <Badge variant="default">Вкл</Badge> : <Badge variant="outline">Выкл</Badge>}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(u.createdAt).toLocaleDateString('ru')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditUser(u); setUserForm({ username: u.username, password: '', role: u.role }); setShowUserDialog(true); }}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteUser(u.id)} disabled={u.id === currentUser?.id}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
            <DialogContent>
              <DialogHeader><DialogTitle>{editUser ? 'Редактировать' : 'Новый пользователь'}</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="space-y-1"><Label>Имя пользователя</Label><Input value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} /></div>
                <div className="space-y-1"><Label>{editUser ? 'Новый пароль (пусто = не менять)' : 'Пароль'}</Label><Input type="password" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} /></div>
                <div className="space-y-1"><Label>Роль</Label>
                  <Select value={userForm.role} onValueChange={v => setUserForm({ ...userForm, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="superadmin">Суперадминистратор</SelectItem>
                      <SelectItem value="admin">Администратор</SelectItem>
                      <SelectItem value="viewer">Просмотрщик</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowUserDialog(false)}>Отмена</Button>
                <Button onClick={saveUser}>{editUser ? 'Сохранить' : 'Создать'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          <div className="grid gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Защита от перебора</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Макс. попыток входа</p><p className="text-xs text-muted-foreground">Перед блокировкой аккаунта</p></div>
                  <Input type="number" value={settings.bruteforce_max_attempts || '5'} onChange={e => saveSetting('bruteforce_max_attempts', e.target.value)} className="w-20 text-center" />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Время блокировки (мин)</p><p className="text-xs text-muted-foreground">Длительность блокировки</p></div>
                  <Input type="number" value={settings.bruteforce_lockout_minutes || '15'} onChange={e => saveSetting('bruteforce_lockout_minutes', e.target.value)} className="w-20 text-center" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Журналирование</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Лог аутентификации</p><p className="text-xs text-muted-foreground">Записывать входы/выходы</p></div>
                  <Switch checked={settings.log_auth === 'true'} onCheckedChange={v => saveSetting('log_auth', String(v))} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Лог API запросов</p><p className="text-xs text-muted-foreground">Записывать все API действия</p></div>
                  <Switch checked={settings.log_api === 'true'} onCheckedChange={v => saveSetting('log_api', String(v))} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Design Tab */}
        <TabsContent value="design" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Оформление</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Цвет акцента</p><p className="text-xs text-muted-foreground">Основной цвет интерфейса</p></div>
                <div className="flex items-center gap-2">
                  <Input value={settings.accent_color || '#6366f1'} onChange={e => saveSetting('accent_color', e.target.value)} className="w-28" />
                  <div className="w-8 h-8 rounded-lg border" style={{ backgroundColor: settings.accent_color || '#6366f1' }} />
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Ширина боковой панели</p><p className="text-xs text-muted-foreground">В пикселях</p></div>
                <Input type="number" value={settings.sidebar_width || '260'} onChange={e => saveSetting('sidebar_width', e.target.value)} className="w-20 text-center" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">Макет</p><p className="text-xs text-muted-foreground">Расположение элементов</p></div>
                <Select value={settings.layout || 'default'} onValueChange={v => saveSetting('layout', v)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">По умолчанию</SelectItem>
                    <SelectItem value="compact">Компактный</SelectItem>
                    <SelectItem value="wide">Широкий</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agent Tab */}
        <TabsContent value="agent" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Автозапуск агента</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Агент автоматически запускается при входе в систему. Команда для отключения:</p>
                <div className="bg-muted rounded-lg p-3 font-mono text-xs">agent.exe --uninstall-service</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Скрытый режим</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Агент работает в фоновом режиме без видимого окна. Параметры запуска:</p>
                <div className="bg-muted rounded-lg p-3 font-mono text-xs">agent.exe --silent --hide-window</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Локальный App Store</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Агент предоставляет локальный HTTP-сервер для пользователей:</p>
                <div className="bg-muted rounded-lg p-3 font-mono text-xs">http://localhost:8475/store</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Локальные тикеты</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">Пользователи могут создавать запросы через встроенную форму:</p>
                <div className="bg-muted rounded-lg p-3 font-mono text-xs">http://localhost:8475/tickets</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Updates Tab */}
        <TabsContent value="updates" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle className="text-base">Обновления агента</CardTitle><CardDescription>Загрузка и распространение обновлений</CardDescription></div>
              <Button><Upload className="w-4 h-4 mr-2" />Загрузить обновление</Button>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg divide-y">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-green-500/10 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-green-500" /></div>
                    <div><p className="text-sm font-medium">v4.0.0</p><p className="text-xs text-muted-foreground">Windows • 12.5 МБ • 15 янв 2025</p></div>
                  </div>
                  <Badge variant="default">Текущая</Badge>
                </div>
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center"><Download className="w-4 h-4 text-blue-500" /></div>
                    <div><p className="text-sm font-medium">v3.9.2</p><p className="text-xs text-muted-foreground">Windows • 11.8 МБ • 20 дек 2024</p></div>
                  </div>
                  <Button variant="outline" size="sm">Восстановить</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Журнал аудита</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Время</TableHead><TableHead>Пользователь</TableHead><TableHead>Действие</TableHead><TableHead>Детали</TableHead><TableHead>IP</TableHead></TableRow></TableHeader>
                <TableBody>
                  {auditLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString('ru')}</TableCell>
                      <TableCell className="font-medium">{log.user?.username}</TableCell>
                      <TableCell><Badge variant="outline">{log.action}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate">{log.detail}</TableCell>
                      <TableCell className="text-muted-foreground">{log.ip}</TableCell>
                    </TableRow>
                  ))}
                  {auditLogs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Нет записей</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */
export default function RemoteAdminPage() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const currentView = useAppStore((s) => s.currentView);

  if (!isAuthenticated) return <LoginView />;

  const views: Record<ViewType, React.ReactNode> = {
    dashboard: <DashboardView />,
    agents: <AgentsView />,
    desktop: <DesktopView />,
    store: <StoreView />,
    tickets: <TicketsView />,
    terminal: <TerminalView />,
    dashboards: <DashboardsView />,
    settings: <SettingsView />,
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {views[currentView]}
        </div>
      </main>
    </div>
  );
}
