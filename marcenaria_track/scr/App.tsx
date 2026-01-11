import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously, 
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  updateDoc, 
  onSnapshot, 
  writeBatch,
  deleteDoc,
  setDoc,
  getDoc,
  arrayUnion,
  query as firebaseQuery,
  where,
  limit,
  orderBy
} from 'firebase/firestore';
import { 
  Activity, 
  Package, 
  Truck, 
  Upload, 
  CheckCircle, 
  AlertTriangle, 
  Trash2,
  Printer,
  QrCode, 
  FileText,
  Settings,
  History,
  LogOut,
  Zap,
  Users,
  Warehouse,
  CheckCircle2,
  LayoutDashboard,
  Clock,
  FolderTree,
  User as UserIcon,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  FileUp,
  Save,
  Info,
  AlertOctagon,
  Search,
  X,
  XCircle
} from 'lucide-react';
import { z } from 'zod';

// --- CONFIGURAÇÃO FIREBASE REAL (MATHEUS) ---
const firebaseConfig = {
  apiKey: "AIzaSyCDDKDd2d3SarctaPRohqEQQbDr0FUCNpE",
  authDomain: "marcenaria-track-5dfec.firebaseapp.com",
  projectId: "marcenaria-track-5dfec",
  storageBucket: "marcenaria-track-5dfec.firebasestorage.app",
  messagingSenderId: "811825518770",
  appId: "1:811825518770:web:daab8e43c13636b766d1ab"
};

// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "marcenaria-track-5dfec"; 

// --- UTILS DE PERFORMANCE ---

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// --- UTILS DE SEGURANÇA ---

const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input.replace(/<[^>]*>?/gm, '').replace(/javascript:/gi, '').replace(/on\w+=/gi, '').substring(0, 500).trim();
};

const sanitizeBarcode = (barcode: string): string => {
  if (typeof barcode !== 'string') return '';
  return barcode.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 100).trim().toUpperCase();
};

const clearSensitiveData = () => {
  localStorage.removeItem('mt_auto');
  localStorage.removeItem('mt_auto_carga');
};

// --- INTERFACES PRINCIPAIS ---

interface UserData {
  id: string;
  workspaceId: string;
  login_id: string;
  password?: string;
  role: 'MASTER' | 'SECONDARY' | string;
  auth_password_override?: string;
}

interface Project {
  id: string;
  workspaceId: string;
  project_name: string;
  client_name: string;
  client_code?: string;
  status: string;
  created_at: string;
  module_dimensions?: Record<string, string>;
  warehouse_id?: string;
  archivedAt?: string;
}

interface Piece {
  id: string;
  workspaceId: string;
  nome: string;
  modulo: string;
  projeto: string;
  cliente: string;
  medidas: string;
  material?: string;
  cor?: string;
  status: 'PENDENTE' | 'PRODUZIDA';
  producedAt?: string;
  producedBy?: string;
  scanHistory?: Array<{ type: string; at: string; user: string; }>;
}

interface WarehouseData {
  id: string;
  workspaceId: string;
  name: string;
  status: 'LIVRE' | 'OCUPADO';
  current_project_id?: string;
}

interface Volume {
  id: string;
  workspaceId: string;
  projectId: string;
  index: number;
  total: number;
  loaded: boolean;
  barcode: string;
  loadedAt?: string;
  loadedBy?: string;
}

interface ClientGroup { [clientDisplayName: string]: Project[]; }

interface PromobItem {
  id: string;
  cliente: string;
  projeto: string;
  modulo: string;
  peca: string;
  obs: string;
  codItem: string;
  medidas: string;
  isValid: boolean;
  errors: string[];
}

// --- COMPONENTES UX ---

const SkeletonCard = () => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse">
    <div className="flex justify-between items-center mb-4">
      <div className="h-4 bg-gray-200 rounded w-1/4"></div>
      <div className="h-8 bg-gray-200 rounded w-1/6"></div>
    </div>
    <div className="space-y-3">
      <div className="h-3 bg-gray-200 rounded w-full"></div>
      <div className="h-3 bg-gray-200 rounded w-5/6"></div>
    </div>
  </div>
);

const SkeletonTable = ({ rows = 5 }: { rows?: number }) => (
  <div className="border border-gray-200 rounded-lg overflow-hidden animate-pulse bg-white">
    <div className="bg-gray-100 p-4 border-b border-gray-200 flex gap-4">
        <div className="h-4 bg-gray-300 rounded w-1/4"></div>
        <div className="h-4 bg-gray-300 rounded w-1/4"></div>
    </div>
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-4">
          <div className="h-3 bg-gray-100 rounded w-1/3"></div>
          <div className="h-3 bg-gray-100 rounded w-1/4"></div>
        </div>
      ))}
    </div>
  </div>
);

const SearchFilterBar = ({ onSearch, placeholder = "Buscar...", className = "" }: { onSearch: (term: string) => void, placeholder?: string, className?: string }) => {
  const [localTerm, setLocalTerm] = useState('');
  const debouncedTerm = useDebounce(localTerm, 300);
  useEffect(() => { onSearch(debouncedTerm); }, [debouncedTerm, onSearch]);
  return (
    <div className={`flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-[#348e91] transition-all ${className}`}>
      <Search size={18} className="text-gray-400 mr-2" />
      <input type="text" value={localTerm} onChange={(e) => setLocalTerm(e.target.value)} placeholder={placeholder} className="bg-transparent border-none outline-none text-sm w-full" />
    </div>
  );
};

const SuccessToast = ({ message, onClose }: { message: string, onClose: () => void }) => (
  <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-right-10">
    <div className="bg-white border-l-4 border-green-500 px-4 py-3 rounded shadow-xl flex items-center gap-3 min-w-[300px]">
      <CheckCircle2 size={20} className="text-green-600" />
      <div className="flex-1 font-medium text-sm">{message}</div>
      <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
    </div>
  </div>
);

const EmptyState = ({ icon: Icon = Package, title, description, action }: { icon?: any, title: string, description: string, action?: any }) => (
  <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
    <Icon size={32} className="mx-auto text-gray-300 mb-4" />
    <h3 className="text-lg font-bold text-gray-700 mb-2">{title}</h3>
    <p className="text-gray-500 text-sm max-w-xs mx-auto mb-6">{description}</p>
    {action}
  </div>
);

const Breadcrumb = ({ items }: { items: any[] }) => (
  <nav className="flex items-center text-xs text-gray-500 mb-6 font-medium">
    {items.map((item, i) => (
      <React.Fragment key={i}>
        {i > 0 && <ChevronRight size={12} className="mx-2 text-gray-300" />}
        <span className={item.active ? 'text-[#348e91] font-bold' : ''}>{item.label}</span>
      </React.Fragment>
    ))}
  </nav>
);

const Card = ({ children, className = '' }: { children: any, className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-5 ${className}`}>{children}</div>
);

const Button = ({ onClick, children, variant = 'primary', className = '', disabled = false, type = 'button', icon }: any) => {
  const variants: any = {
    primary: "bg-[#348e91] text-white hover:bg-[#2a7375]",
    secondary: "bg-[#1c5052] text-white hover:bg-[#13393a]",
    danger: "bg-red-600 text-white hover:bg-red-700",
    outline: "border-2 border-[#348e91] text-[#348e91] hover:bg-[#f0f9fa]"
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`px-4 py-2 rounded-lg font-bold flex items-center justify-center text-sm transition-all disabled:opacity-50 ${variants[variant]} ${className}`}>
      {icon} {children}
    </button>
  );
};

const Input = ({ label, className = '', ...props }: any) => (
  <div className="mb-3">
    {label && <label className="block text-xs font-bold text-[#213635] mb-1 uppercase">{label}</label>}
    <input {...props} className={`w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#348e91] outline-none ${className}`} />
  </div>
);

// --- ZOD SCHEMAS ---

const BarcodeSchema = z.string().min(1, "Obrigatório").transform(s => s.trim());
const ClientNameSchema = z.string().min(0).max(100).transform(s => s.trim()).optional();

const CsvRowSchema = z.object({
  clientCode: z.string().min(1),
  clientName: z.string().min(1),
  projectName: z.string().min(1),
  barcode: BarcodeSchema,
  pieceModule: z.string().optional(),
  pieceName: z.string().optional(),
  comprimento: z.string().optional(),
  largura: z.string().optional(),
  espessura: z.string().optional(),
  material: z.string().optional(),
  cor: z.string().optional()
});

const PdfItemSchema = z.object({
  cliente: ClientNameSchema,
  projeto: z.string().default(""),
  modulo: z.string().default(""),
  peca: z.string().default(""),
  codItem: BarcodeSchema,
  medidas: z.string().default(""),
  obs: z.string().default("")
});

// --- UTILS ---

const getWorkspaceId = () => {
  let ws = localStorage.getItem("workspaceId");
  if (!ws) { ws = "marcenaria_track_default"; localStorage.setItem("workspaceId", ws); }
  return ws;
};

const playSound = (type: 'success' | 'error') => {
  try {
    const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === 'success') { osc.frequency.setValueAtTime(1200, now); osc.start(now); osc.stop(now + 0.15); }
    else { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now); osc.start(now); osc.stop(now + 0.2); }
  } catch(e) {}
};

const formatClientDisplay = (name: string, code?: string) => code ? `${code} - ${name}` : name;

// --- TELAS ---

const DashboardComponent = ({ projects, pieces, warehouses, volumes, loading }: any) => {
  const wsId = getWorkspaceId();
  const stats = useMemo(() => {
    const active = projects.filter((p: any) => p.status !== 'ARQUIVADO' && p.workspaceId === wsId);
    const today = new Date().toISOString().slice(0, 10);
    const pToday = pieces.filter((p: any) => p.workspaceId === wsId && p.status === 'PRODUZIDA' && p.producedAt?.startsWith(today)).length;
    const fWh = warehouses.filter((w: any) => w.workspaceId === wsId && w.status === 'LIVRE').length;
    const groups: any = {};
    active.forEach((p: any) => {
      const name = formatClientDisplay(p.client_name, p.client_code);
      if (!groups[name]) groups[name] = [];
      groups[name].push(p);
    });
    return { activeClients: Object.keys(groups).length, pToday, fWh, clientGroups: groups };
  }, [projects, pieces, warehouses, wsId]);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{label: 'Início', active: true}]} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-[#348e91]">
          <p className="text-xs font-bold text-gray-500 uppercase">Clientes Ativos</p>
          <p className="text-3xl font-black">{stats.activeClients}</p>
        </Card>
        <Card className="border-l-4 border-indigo-600">
          <p className="text-xs font-bold text-gray-500 uppercase">Peças Hoje</p>
          <p className="text-3xl font-black">{stats.pToday}</p>
        </Card>
        <Card className="border-l-4 border-yellow-500">
          <p className="text-xs font-bold text-gray-500 uppercase">Armazéns Livres</p>
          <p className="text-3xl font-black">{stats.fWh}</p>
        </Card>
      </div>
      <Card>
        <h3 className="font-bold text-[#1c5052] mb-4">Progresso por Cliente</h3>
        {Object.entries(stats.clientGroups).map(([name, projs]: any) => (
          <div key={name} className="mb-4 p-4 border rounded-lg bg-gray-50">
            <h4 className="font-bold text-[#348e91]">{name}</h4>
            <p className="text-xs text-gray-500">{projs.length} projeto(s) em andamento</p>
          </div>
        ))}
      </Card>
    </div>
  );
};

const ProducaoComponent = ({ pieces, currentUser, loading }: any) => {
    const [code, setCode] = useState('');
    const [autoScan, setAutoScan] = useState(true);
    const [msg, setMsg] = useState<any>(null);
    const ws = getWorkspaceId();

    const handleScan = async (barcode: string) => {
        const sanitized = sanitizeBarcode(barcode);
        if (!sanitized) return;
        try {
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'pieces', `${ws}_${sanitized}`);
            const snap = await getDoc(ref);
            if (!snap.exists()) { playSound("error"); setMsg({ type: 'error', text: 'Não encontrada' }); return; }
            const piece = snap.data() as Piece;
            if (piece.status === "PRODUZIDA") { playSound("error"); setMsg({ type: 'error', text: 'Já bipada' }); return; }
            await updateDoc(ref, { status: "PRODUZIDA", producedAt: new Date().toISOString(), producedBy: currentUser.login_id });
            playSound("success"); setMsg({ type: 'success', text: `Sucesso: ${piece.nome}` });
            setCode('');
        } catch (e) { playSound("error"); }
    };

    return (
        <Card className="max-w-xl mx-auto">
            <h2 className="font-bold text-xl mb-4">Bipagem de Produção</h2>
            <Input value={code} onChange={(e: any) => setCode(e.target.value)} onKeyDown={(e: any) => e.key === 'Enter' && handleScan(code)} placeholder="Bipe o código..." autoFocus />
            {msg && <div className={`mt-4 p-3 rounded text-white font-bold ${msg.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{msg.text}</div>}
        </Card>
    );
};

const ExpedicaoComponent = ({ projects, pieces, warehouses, volumes, users }: any) => {
    const [selClient, setSelClient] = useState('');
    const ws = getWorkspaceId();
    const uniqueClients = useMemo(() => Array.from(new Set(projects.map((p: any) => formatClientDisplay(p.client_name, p.client_code)))).sort(), [projects]);

    return (
        <Card>
            <h2 className="font-bold text-xl mb-4">Expedição e Etiquetas</h2>
            <select className="w-full p-2 border rounded mb-4" value={selClient} onChange={(e) => setSelClient(e.target.value)}>
                <option value="">Selecione um cliente...</option>
                {uniqueClients.map((c: any) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-4">
                <Button variant="outline">Imprimir Módulos</Button>
                <Button variant="primary">Gerar Volumes</Button>
            </div>
        </Card>
    );
};

const SaidaComponent = ({ projects, pieces, warehouses, volumes }: any) => {
    return (
        <Card>
            <h2 className="font-bold text-xl mb-4">Saída / Carga</h2>
            <p className="text-gray-500 italic">Módulo de carregamento de caminhão em breve.</p>
        </Card>
    );
};

const AdminScreen = ({ users, warehouses, projects }: any) => {
    const [tab, setTab] = useState('users');
    const ws = getWorkspaceId();
    return (
        <div className="space-y-6">
            <div className="flex gap-4 border-b">
                <button onClick={() => setTab('users')} className={`pb-2 ${tab === 'users' ? 'border-b-2 border-[#348e91] font-bold' : ''}`}>Usuários</button>
                <button onClick={() => setTab('wh')} className={`pb-2 ${tab === 'wh' ? 'border-b-2 border-[#348e91] font-bold' : ''}`}>Armazéns</button>
            </div>
            {tab === 'users' ? (
                <Card>
                    <h3 className="font-bold mb-4">Gestão de Equipe</h3>
                    {users.map((u: any) => <div key={u.id} className="p-2 border-b">{u.login_id}</div>)}
                </Card>
            ) : (
                <Card>
                    <h3 className="font-bold mb-4">Armazéns</h3>
                    {warehouses.map((w: any) => <div key={w.id} className="p-2 border-b">{w.name} - {w.status}</div>)}
                </Card>
            )}
        </div>
    );
};

// --- APP PRINCIPAL ---

export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [view, setView] = useState('login');
  const [loadingData, setLoadingData] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [projs, setProjs] = useState<Project[]>([]);
  const [wares, setWares] = useState<WarehouseData[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [vols, setVols] = useState<Volume[]>([]);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const ws = getWorkspaceId();
    const qUsers = firebaseQuery(collection(db, 'artifacts', appId, 'public', 'data', 'users'), where('workspaceId', '==', ws));
    const qProjs = firebaseQuery(collection(db, 'artifacts', appId, 'public', 'data', 'projects'), where('workspaceId', '==', ws));
    const qWares = firebaseQuery(collection(db, 'artifacts', appId, 'public', 'data', 'warehouses'), where('workspaceId', '==', ws));
    const qPieces = firebaseQuery(collection(db, 'artifacts', appId, 'public', 'data', 'pieces'), where('workspaceId', '==', ws));
    const qVols = firebaseQuery(collection(db, 'artifacts', appId, 'public', 'data', 'volumes'), where('workspaceId', '==', ws));

    const unsub = [
        onSnapshot(qUsers, s => setUsers(s.docs.map(d => d.data() as UserData))),
        onSnapshot(qProjs, s => setProjs(s.docs.map(d => d.data() as Project))),
        onSnapshot(qWares, s => setWares(s.docs.map(d => d.data() as WarehouseData))),
        onSnapshot(qPieces, s => setPieces(s.docs.map(d => d.data() as Piece))),
        onSnapshot(qVols, s => setVols(s.docs.map(d => d.data() as Volume)))
    ];
    setLoadingData(false);
    return () => unsub.forEach(fn => fn());
  }, []);

  const handleLogin = (id: string, pass: string) => {
    if (users.length === 0) {
        const m: UserData = { id: 'master', workspaceId: getWorkspaceId(), login_id: id, password: pass, role: 'MASTER', auth_password_override: '1234' };
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', 'master'), m);
        alert("Master criado!"); return;
    }
    const found = users.find(u => u.login_id === id && u.password === pass);
    if (found) { setUser(found); setView('dashboard'); }
    else alert("Erro");
  };

  if (!user) return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
        <Card className="w-80">
            <h1 className="text-2xl font-black text-center mb-6 text-[#348e91]">TRACK LOGIN</h1>
            <form onSubmit={(e: any) => { e.preventDefault(); handleLogin(e.target.id.value, e.target.pw.value); }}>
                <Input id="id" label="ID" required />
                <Input id="pw" label="Senha" type="password" required />
                <Button type="submit" className="w-full mt-4">Entrar</Button>
            </form>
        </Card>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-black text-white p-6">
        <h1 className="text-xl font-bold mb-8 text-[#348e91]">MARCENARIA</h1>
        <nav className="space-y-4">
          <button onClick={() => setView('dashboard')} className="block w-full text-left hover:text-[#348e91]">Painel</button>
          <button onClick={() => setView('prod')} className="block w-full text-left hover:text-[#348e91]">Produção</button>
          <button onClick={() => setView('exp')} className="block w-full text-left hover:text-[#348e91]">Expedição</button>
          <button onClick={() => setView('out')} className="block w-full text-left hover:text-[#348e91]">Saída</button>
          {user.role === 'MASTER' && <button onClick={() => setView('adm')} className="block w-full text-left hover:text-[#348e91]">Admin</button>}
        </nav>
      </aside>
      <main className="flex-1 p-10 overflow-auto">
        {view === 'dashboard' && <DashboardComponent projects={projs} pieces={pieces} warehouses={wares} volumes={vols} />}
        {view === 'prod' && <ProducaoComponent pieces={pieces} currentUser={user} />}
        {view === 'exp' && <ExpedicaoComponent projects={projs} pieces={pieces} warehouses={wares} volumes={vols} users={users} />}
        {view === 'out' && <SaidaComponent projects={projs} pieces={pieces} warehouses={wares} volumes={vols} />}
        {view === 'adm' && <AdminScreen users={users} warehouses={wares} projects={projs} />}
      </main>
    </div>
  );
}
