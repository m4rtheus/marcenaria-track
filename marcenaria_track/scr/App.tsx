/*
FIREBASE SECURITY RULES RECOMENDADAS:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/public/data/{collection}/{document} {
      // Apenas usuários autenticados podem ler
      allow read: if request.auth != null;
      
      // Apenas MASTER users podem escrever em users e warehouses
      allow write: if (
        request.auth != null && 
        getUserRole() == 'MASTER' &&
        (collection in ['users', 'warehouses'])
      );
      
      // Qualquer usuário pode escrever em pieces (para scans)
      allow write: if request.auth != null && collection == 'pieces';
      
      // Apenas usuários do mesmo workspace podem acessar dados
      function isSameWorkspace() {
        return resource.data.workspaceId == request.resource.data.workspaceId;
      }
    }
  }
}
*/

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously, 
  signInWithCustomToken,
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
  X
} from 'lucide-react';
import { z } from 'zod';

// --- UTILS DE PERFORMANCE ---

// Hook personalizado para Debounce
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// --- UTILS DE SEGURANÇA ---

const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  
  return input
    // Remover tags HTML/XML
    .replace(/<[^>]*>?/gm, '')
    // Remover scripts e eventos
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    // Remover caracteres de controle
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Limitar tamanho
    .substring(0, 500)
    .trim();
};

const sanitizeBarcode = (barcode: string): string => {
  if (typeof barcode !== 'string') return '';
  return barcode
    .replace(/[^a-zA-Z0-9\-_]/g, '') // Apenas alfanuméricos, hífens e underscores
    .substring(0, 100)
    .trim()
    .toUpperCase();
};

const clearSensitiveData = () => {
  // Não remover workspaceId pois é necessário para a config do tenant
  localStorage.removeItem('mt_auto');
  localStorage.removeItem('mt_auto_carga');
  
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.includes('password') || key.includes('token') || key.includes('auth')) {
      localStorage.removeItem(key);
    }
  });
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
  scanHistory?: Array<{
    type: string;
    at: string;
    user: string;
  }>;
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

interface ClientGroup {
  [clientDisplayName: string]: Project[];
}

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

// --- INTERFACES DE UI ---

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  icon?: React.ReactNode;
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
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
        <div className="h-4 bg-gray-300 rounded w-1/4"></div>
    </div>
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="p-4 flex items-center gap-4">
          <div className="h-3 bg-gray-100 rounded w-1/3"></div>
          <div className="h-3 bg-gray-100 rounded w-1/4"></div>
          <div className="h-3 bg-gray-100 rounded w-1/6 ml-auto"></div>
        </div>
      ))}
    </div>
  </div>
);

interface SearchFilterBarProps {
  onSearch: (term: string) => void;
  placeholder?: string;
  className?: string;
}

const SearchFilterBar = ({ 
  onSearch, 
  placeholder = "Buscar...",
  className = ""
}: SearchFilterBarProps) => {
  const [localTerm, setLocalTerm] = useState('');
  const debouncedTerm = useDebounce(localTerm, 300);

  useEffect(() => {
    onSearch(debouncedTerm);
  }, [debouncedTerm, onSearch]);

  return (
    <div className={`flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-[#348e91] focus-within:border-transparent transition-all ${className}`}>
      <Search size={18} className="text-gray-400 mr-2 flex-shrink-0" />
      <input
        type="text"
        value={localTerm}
        onChange={(e) => setLocalTerm(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent border-none outline-none text-sm w-full text-gray-700 placeholder-gray-400"
      />
      {localTerm && (
        <button onClick={() => { setLocalTerm(''); }} className="text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      )}
    </div>
  );
};

interface TooltipProps {
  children: React.ReactNode;
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const Tooltip = ({ children, text, position = 'top' }: TooltipProps) => {
  const [visible, setVisible] = useState(false);
  
  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2'
  };
  
  return (
    <div className="relative inline-flex items-center" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <div className={`absolute z-50 ${positionClasses[position]} px-3 py-1.5 bg-gray-800 text-white text-[10px] font-bold rounded shadow-lg whitespace-nowrap animate-in fade-in zoom-in-95 duration-200 pointer-events-none`}>
          {text}
          <div className={`absolute w-2 h-2 bg-gray-800 transform rotate-45 ${position === 'top' ? 'bottom-[-3px]' : 'top-[-3px]'} left-1/2 -translate-x-1/2`}></div>
        </div>
      )}
    </div>
  );
};

const SuccessToast = ({ message, onClose }: { message: string, onClose: () => void }) => (
  <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-right-10 fade-in duration-300">
    <div className="bg-white border-l-4 border-green-500 text-gray-800 px-4 py-3 rounded shadow-xl flex items-center gap-3 min-w-[300px]">
      <div className="bg-green-100 p-1.5 rounded-full text-green-600">
        <CheckCircle2 size={20} />
      </div>
      <div className="flex-1 font-medium text-sm">{message}</div>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
        <X size={16} />
      </button>
    </div>
  </div>
);

const EmptyState = ({ 
  icon: Icon = Package, 
  title, 
  description, 
  action 
}: { icon?: React.ElementType, title: string, description: string, action?: React.ReactNode }) => (
  <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
    <div className="inline-flex items-center justify-center w-16 h-16 bg-white border border-gray-200 rounded-full mb-4 shadow-sm text-gray-300">
      <Icon size={32} />
    </div>
    <h3 className="text-lg font-bold text-gray-700 mb-2">{title}</h3>
    <p className="text-gray-500 text-sm max-w-xs mx-auto mb-6">{description}</p>
    {action && <div>{action}</div>}
  </div>
);

const Breadcrumb = ({ items }: { items: { label: string, active?: boolean, href?: string }[] }) => (
  <nav className="flex items-center text-xs text-gray-500 mb-6 font-medium">
    {items.map((item, index) => (
      <React.Fragment key={index}>
        {index > 0 && <ChevronRight size={12} className="mx-2 text-gray-300" />}
        <span className={item.active ? 'text-[#348e91] font-bold' : 'text-gray-500'}>
          {item.label}
        </span>
      </React.Fragment>
    ))}
  </nav>
);

// --- COMPONENTES UI BÁSICOS ---

const Card = ({ children, className = '' }: CardProps) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-5 ${className}`}>{children}</div>
);

const Button = ({ onClick, children, variant = 'primary', className = '', disabled = false, type = 'button', icon }: ButtonProps) => {
  const base = "px-4 py-2 rounded-lg font-bold transition-all focus:outline-none flex items-center justify-center shadow-sm text-sm";
  const variants = {
    primary: "bg-[#348e91] text-white hover:bg-[#2a7375] disabled:bg-gray-300 disabled:cursor-not-allowed",
    secondary: "bg-[#1c5052] text-white hover:bg-[#13393a] disabled:bg-gray-300 disabled:cursor-not-allowed",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
    outline: "border-2 border-[#348e91] text-[#348e91] hover:bg-[#f0f9fa]"
  };
  
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {icon}
      {children}
    </button>
  );
};

const Input = ({ label, className = '', ...props }: InputProps) => (
  <div className="mb-3">
    {label && <label className="block text-xs font-bold text-[#213635] mb-1 uppercase tracking-wide">{label}</label>}
    <input 
      {...props} 
      className={`w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:border-[#348e91] focus:ring-2 focus:ring-[#348e91] outline-none transition-all ${className}`} 
    />
  </div>
);

// --- ENUMS E INTERFACES DE ERRO ---

enum ImportErrorType {
  CSV_PARSE_ERROR = 'CSV_PARSE_ERROR',
  MISSING_REQUIRED_COLUMN = 'MISSING_REQUIRED_COLUMN',
  INVALID_BARCODE_FORMAT = 'INVALID_BARCODE_FORMAT',
  DUPLICATE_BARCODE_IN_FILE = 'DUPLICATE_BARCODE_IN_FILE',
  INVALID_MEASUREMENTS = 'INVALID_MEASUREMENTS',
  PDF_CORRUPTED = 'PDF_CORRUPTED',
  PDF_PASSWORD_PROTECTED = 'PDF_PASSWORD_PROTECTED',
  PDF_LAYOUT_UNEXPECTED = 'PDF_LAYOUT_UNEXPECTED',
  MISSING_CLIENT_INFO = 'MISSING_CLIENT_INFO',
  MISSING_PROJECT_INFO = 'MISSING_PROJECT_INFO',
  GENERIC_SYSTEM_ERROR = 'GENERIC_SYSTEM_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}

enum ImportErrorSeverity {
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

interface ImportError {
  type: ImportErrorType;
  message: string;
  suggestion: string;
  lineNumber?: number;
  pageNumber?: number;
  field?: string;
  value?: any;
  severity: ImportErrorSeverity;
}

const ErrorDisplay = ({ errors }: { errors: ImportError[] }) => {
  const [expanded, setExpanded] = useState(false);

  if (!errors || errors.length === 0) return null;

  const criticalCount = errors.filter(e => e.severity === ImportErrorSeverity.CRITICAL).length;
  const errorCount = errors.filter(e => e.severity === ImportErrorSeverity.ERROR).length;
  const warningCount = errors.filter(e => e.severity === ImportErrorSeverity.WARNING).length;

  return (
    <div className="border border-red-200 rounded-lg bg-red-50 p-4 mb-6 animate-in slide-in-from-top-2">
      <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <AlertOctagon className="text-red-600" size={24} />
          <div>
            <h4 className="font-bold text-red-800 text-sm">
              Encontrados {errors.length} problema(s) na importação
            </h4>
            <div className="flex gap-2 text-[10px] uppercase font-bold mt-1">
              {criticalCount > 0 && <span className="text-red-700 bg-red-200 px-1.5 py-0.5 rounded">{criticalCount} Críticos</span>}
              {errorCount > 0 && <span className="text-orange-700 bg-orange-200 px-1.5 py-0.5 rounded">{errorCount} Erros</span>}
              {warningCount > 0 && <span className="text-yellow-700 bg-yellow-200 px-1.5 py-0.5 rounded">{warningCount} Avisos</span>}
            </div>
          </div>
        </div>
        <div className="text-red-500 hover:text-red-700">
           {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar border-t border-red-200 pt-3">
          {errors.map((error, index) => (
            <div key={index} className={`p-3 rounded border text-xs ${
              error.severity === ImportErrorSeverity.CRITICAL ? 'bg-red-100 border-red-300' : 
              error.severity === ImportErrorSeverity.ERROR ? 'bg-orange-50 border-orange-200' : 
              'bg-yellow-50 border-yellow-200'
            }`}>
              <div className="flex justify-between items-start">
                <span className="font-bold text-gray-800 flex-1">{error.message}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ml-2 uppercase font-black tracking-wider flex-shrink-0 ${
                  error.severity === ImportErrorSeverity.CRITICAL ? 'bg-red-200 text-red-800' : 
                  error.severity === ImportErrorSeverity.ERROR ? 'bg-orange-200 text-orange-800' : 
                  'bg-yellow-200 text-yellow-800'
                }`}>
                  {error.severity}
                </span>
              </div>
              <div className="mt-2 text-blue-700 bg-blue-50/50 p-1.5 rounded flex items-start gap-1.5">
                <Info size={12} className="mt-0.5 flex-shrink-0" />
                <span><strong>Sugestão:</strong> {error.suggestion}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- ZOD SCHEMAS ---

const BarcodeSchema = z.string()
  .min(1, "Código de barras é obrigatório")
  .transform(str => str.trim())
  .refine(val => val.length >= 3, {
    message: "Código de barras deve ter pelo menos 3 caracteres"
  });

const DimensionValueSchema = z.string()
  .transform(val => val.trim().replace(',', '.'))
  .refine(val => val === '' || (!isNaN(Number(val)) && Number(val) >= 0), { message: "Deve ser um número positivo" })
  .or(z.string().length(0));

const MeasurementSchema = z.string().min(0);

const ClientNameSchema = z.string()
  .min(0)
  .max(100, "Nome do cliente muito longo")
  .transform(str => str.trim())
  .optional();

const CsvRowSchema = z.object({
  clientCode: z.string().min(1, "Código do cliente ausente"),
  clientName: z.string().min(1, "Nome do cliente ausente").transform(str => str.trim()),
  projectName: z.string().min(1, "Nome do projeto ausente"),
  barcode: BarcodeSchema,
  pieceModule: z.string().optional(),
  pieceName: z.string().optional(),
  comprimento: DimensionValueSchema,
  largura: DimensionValueSchema,
  espessura: DimensionValueSchema,
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

const mapZodErrorToImportError = (issue: z.ZodIssue, rowIndex: number, context: 'CSV' | 'PDF'): ImportError => {
  let type = ImportErrorType.VALIDATION_ERROR;
  let severity = ImportErrorSeverity.ERROR;

  if (issue.path.includes('barcode')) type = ImportErrorType.INVALID_BARCODE_FORMAT;
  if (issue.path.includes('comprimento') || issue.path.includes('largura')) {
    type = ImportErrorType.INVALID_MEASUREMENTS;
    severity = ImportErrorSeverity.WARNING;
  }
  if (issue.path.includes('clientName') || issue.path.includes('cliente')) type = ImportErrorType.MISSING_CLIENT_INFO;

  return {
    type,
    message: issue.message,
    suggestion: `Verifique o campo '${issue.path.join('.')}'`,
    severity,
    [context === 'CSV' ? 'lineNumber' : 'pageNumber']: rowIndex,
    field: String(issue.path[0]),
    value: issue.code === 'invalid_type' ? 'Tipo Inválido' : 'Formato Inválido'
  };
};

// --- CONFIGURAÇÃO FIREBASE ---
// @ts-ignore
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// @ts-ignore
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- UTILS ---

const getWorkspaceId = () => {
  let ws = localStorage.getItem("workspaceId");
  if (!ws) {
    ws = "marcenaria_track_default"; 
    localStorage.setItem("workspaceId", ws);
  }
  return ws;
};

const playSound = (type: 'success' | 'error') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.2, now);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      gain.gain.setValueAtTime(0.2, now);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch(e) { console.error(e); }
};

const detectAndFixEncoding = (content: string): string => {
  const lines = content.split('\n');
  const fixedLines = lines.map(line => {
    return line.replace(/^\uFEFF/, '');
  });
  return fixedLines.join('\n');
};

const formatClientDisplay = (name: string, code?: string) => {
  if (code && code.trim() !== '') {
    return `${code} - ${name}`;
  }
  return name;
};

const loadPdfJs = async () => {
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      const pdfjs = (window as any).pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjs);
    };
    script.onerror = reject;
    document.body.appendChild(script);
  });
};

// --- TELAS ---

interface DashboardProps {
  projects: Project[];
  pieces: Piece[];
  warehouses: WarehouseData[];
  volumes: Volume[];
  loading: boolean;
}

const DashboardComponent = ({ projects, pieces, warehouses, volumes, loading }: DashboardProps) => {
  const wsId = getWorkspaceId();
  
  const { activeProjects, clientGroups, uniqueActiveClientsCount, piecesTodayCount, freeWhCount, clientsReadyForLoadingCount } = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'ARQUIVADO' && p.workspaceId === wsId);
    
    const today = new Date().toISOString().slice(0, 10);
    const piecesCount = pieces.filter((p) => 
      p.workspaceId === wsId && 
      p.status === 'PRODUZIDA' && 
      p.producedAt?.startsWith(today)
    ).length;

    const freeWh = warehouses.filter((w) => 
      w.workspaceId === wsId && 
      w.status === 'LIVRE'
    ).length;

    const groups: ClientGroup = {};
    active.forEach(p => {
      const rawName = p.client_name || "Sem Cliente";
      const displayName = formatClientDisplay(rawName, p.client_code);
      if (!groups[displayName]) groups[displayName] = [];
      groups[displayName].push(p);
    });

    const projectIdsWithVolumes = new Set<string>();
    volumes.forEach((v) => {
      if (v.workspaceId === wsId) {
        projectIdsWithVolumes.add(v.projectId);
      }
    });
    
    let readyCount = 0;
    Object.values(groups).forEach((clientProjects) => {
      if (clientProjects.length === 0) return;
      const allProjectsHaveVolumes = clientProjects.every(proj => 
        projectIdsWithVolumes.has(proj.id)
      );
      if (allProjectsHaveVolumes) readyCount++;
    });

    return {
      activeProjects: active,
      clientGroups: groups,
      uniqueActiveClientsCount: Object.keys(groups).length,
      piecesTodayCount: piecesCount,
      freeWhCount: freeWh,
      clientsReadyForLoadingCount: readyCount
    };
  }, [projects, pieces, warehouses, volumes, wsId]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  const toggleClient = useCallback((clientName: string) => {
    setCollapsed(prev => ({ ...prev, [clientName]: !prev[clientName] }));
  }, []);

  const toggleProject = useCallback((projectId: string) => {
    setExpandedProjects(prev => ({ ...prev, [projectId]: !prev[projectId] }));
  }, []);

  type ProjectDetail = Project & {
    total: number;
    scanned: number;
    progress: number;
    projectPieces: Piece[];
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Breadcrumb items={[{label: 'Início', active: true}]} />
      
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[#1c5052] flex items-center gap-2">
          <LayoutDashboard className="text-[#348e91]" /> Panorama Geral
        </h2>
        <div className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
          {new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <Card className="border-l-4 border-[#348e91] bg-gradient-to-br from-white to-[#f0f9fa]">
              <Tooltip text="Número de clientes com projetos em andamento">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1 cursor-help">
                  Clientes Ativos <Info size={10} />
                </p>
              </Tooltip>
              <div className="flex items-end justify-between">
                <p className="text-4xl font-black text-[#213635]">{uniqueActiveClientsCount}</p>
                <Users className="text-[#348e91] opacity-20 w-10 h-10" />
              </div>
            </Card>
            <Card className="border-l-4 border-indigo-600 bg-gradient-to-br from-white to-indigo-50">
              <Tooltip text="Clientes com todos os volumes gerados e prontos para expedição">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1 cursor-help">
                  Prontos p/ Carga <Info size={10} />
                </p>
              </Tooltip>
              <div className="flex items-end justify-between">
                <p className="text-4xl font-black text-[#213635]">{clientsReadyForLoadingCount}</p>
                <Truck className="text-indigo-600 opacity-20 w-10 h-10" />
              </div>
            </Card>
            <Card className="border-l-4 border-[#1c5052] bg-gradient-to-br from-white to-gray-50">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Peças Hoje</p>
              <div className="flex items-end justify-between">
                <p className="text-4xl font-black text-[#213635]">{piecesTodayCount}</p>
                <CheckCircle className="text-[#1c5052] opacity-20 w-10 h-10" />
              </div>
            </Card>
            <Card className="border-l-4 border-yellow-500 bg-gradient-to-br from-white to-yellow-50">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Armazéns Livres</p>
              <div className="flex items-end justify-between">
                <p className="text-4xl font-black text-[#213635]">{freeWhCount}</p>
                <Warehouse className="text-yellow-600 opacity-20 w-10 h-10" />
              </div>
            </Card>
          </>
        )}
      </div>

      <Card>
        <h3 className="font-bold text-[#1c5052] mb-6 flex items-center gap-2">
          <Activity size={20} className="text-[#348e91]" /> Progresso por Cliente
        </h3>
        <div className="space-y-12">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : Object.keys(clientGroups).length > 0 ? (
            Object.entries(clientGroups).map(([clientDisplayName, clientProjects]) => {
              let totalClientPieces = 0;
              let scannedClientPieces = 0;

              const projectDetails: ProjectDetail[] = clientProjects.map((p) => {
                const projectPieces = pieces.filter((pc) => 
                  pc.workspaceId === wsId && 
                  pc.projeto === p.project_name && 
                  pc.cliente === p.client_name
                );
                
                const total = projectPieces.length;
                const scanned = projectPieces.filter((pc) => pc.status === 'PRODUZIDA').length;
                const progress = total > 0 ? Math.round((scanned / total) * 100) : 0;
                
                totalClientPieces += total;
                scannedClientPieces += scanned;

                return { ...p, total, scanned, progress, projectPieces };
              });

              const clientProgress = totalClientPieces > 0 ? Math.round((scannedClientPieces / totalClientPieces) * 100) : 0;
              const isCollapsed = collapsed[clientDisplayName];
              const clientKey = `client_${clientDisplayName.replace(/\s+/g, '_')}_${clientProjects[0]?.id || 'no_id'}`;

              return (
                <div key={clientKey} className="p-4 rounded-xl border border-gray-100 bg-gray-50/30 transition-all hover:shadow-sm">
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <Tooltip text={isCollapsed ? "Expandir detalhes" : "Recolher detalhes"} position="right">
                          <button onClick={() => toggleClient(clientDisplayName)} className="text-gray-400 hover:text-[#348e91] transition-colors focus:outline-none p-1 rounded-full hover:bg-white">
                             {isCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                          </button>
                        </Tooltip>
                        <div className="p-2 bg-[#348e91] rounded-lg text-white shadow-sm"><UserIcon size={16} /></div>
                        <h4 className="font-black text-lg text-[#1c5052] uppercase tracking-tight">{clientDisplayName}</h4>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Total do Cliente</p>
                        <span className="text-xl font-black text-[#348e91]">{clientProgress}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 h-4 rounded-full overflow-hidden shadow-inner">
                      <div className={`h-full transition-all duration-1000 ease-out bg-[#348e91]`} style={{ width: `${clientProgress}%` }}></div>
                    </div>
                    <p className="text-[10px] text-gray-500 font-bold mt-1 text-right uppercase">
                        {scannedClientPieces} de {totalClientPieces} peças totais
                    </p>
                  </div>

                  <div 
                    className={`grid grid-cols-1 gap-4 ml-6 pl-6 border-l-2 border-dashed border-gray-200 transition-all duration-300 overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'}`}
                  >
                        {projectDetails.map((p) => (
                        <div key={`project_${p.id}_${p.project_name}`} className="group py-2">
                            <div className="flex justify-between items-end mb-1">
                                <div className="flex items-center gap-2">
                                    <button onClick={() => toggleProject(p.id)} className="text-gray-400 hover:text-[#348e91] transition-colors focus:outline-none">
                                        {expandedProjects[p.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    </button>
                                    <h5 className="font-bold text-sm text-[#213635]">{String(p.project_name)}</h5>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-black text-gray-600">{p.progress}%</span>
                                </div>
                            </div>
                            <div className="w-full bg-white h-2 rounded-full overflow-hidden border border-gray-100">
                                <div className={`h-full transition-all duration-700 ${p.progress === 100 ? 'bg-green-500' : 'bg-[#1c5052]'}`} style={{ width: `${p.progress}%` }}></div>
                            </div>
                            <div className="flex justify-between mt-1">
                                <div className="text-[9px] text-gray-400 font-medium">
                                    <Clock size={8} className="inline mr-1" /> {new Date(p.created_at).toLocaleDateString('pt-BR')}
                                </div>
                                <div className="text-[9px] text-gray-400 font-bold uppercase">{p.scanned}/{p.total}</div>
                            </div>
                            
                            {expandedProjects[p.id] && (
                                <div className="mt-3 ml-6 space-y-1 animate-in slide-in-from-top-1 border-t border-gray-100 pt-2">
                                    {p.projectPieces && p.projectPieces.length > 0 ? (
                                        p.projectPieces.slice(0, 50).map((pc) => (
                                            <div key={`piece_${pc.id}_${pc.nome}_${pc.modulo}`} className="flex justify-between items-center text-xs p-2 bg-white border border-gray-100 rounded shadow-sm">
                                                <span className="font-medium text-gray-600 truncate flex-1 mr-2">{pc.nome || 'Peça sem nome'}</span>
                                                <div className="flex-shrink-0">
                                                    {pc.status === 'PRODUZIDA' ? (
                                                        <span className="font-bold px-2 py-0.5 rounded text-[10px] bg-green-100 text-green-700">BIPADA</span>
                                                    ) : (
                                                        <span className="font-bold px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">PENDENTE</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-[10px] text-gray-400 italic pl-2">Nenhuma peça cadastrada para este projeto.</p>
                                    )}
                                    {p.projectPieces.length > 50 && (
                                        <p className="text-[10px] text-gray-400 italic pl-2 text-center">+ {p.projectPieces.length - 50} peças...</p>
                                    )}
                                </div>
                            )}
                        </div>
                        ))}
                    </div>
                </div>
              );
            })
          ) : (
            <EmptyState 
              title="Sem Projetos Ativos" 
              description="Nenhum projeto em andamento foi encontrado. Importe novas etiquetas para começar."
            />
          )}
        </div>
      </Card>
    </div>
  );
};

interface ProducaoProps {
  pieces: Piece[];
  currentUser: UserData;
  loading: boolean;
}

const ProducaoComponent = ({ pieces, currentUser, loading }: ProducaoProps) => {
    const [code, setCode] = useState('');
    const [autoScan, setAutoScan] = useState(() => localStorage.getItem('mt_auto') === 'true');
    const [lastMsg, setLastMsg] = useState<{type:'success'|'error', text:string, data?: any}|null>(null);
    const [historySearch, setHistorySearch] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    
    const inputRef = useRef<HTMLInputElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ws = getWorkspaceId();

    useEffect(() => { localStorage.setItem('mt_auto', String(autoScan)); inputRef.current?.focus(); }, [autoScan]);

    const history = useMemo(() => {
        let filtered = pieces.filter((p) => p.workspaceId === ws && p.status === 'PRODUZIDA' && p.producedAt);
        
        if (historySearch) {
          const lower = historySearch.toLowerCase();
          filtered = filtered.filter(p => 
            p.nome.toLowerCase().includes(lower) || 
            p.cliente.toLowerCase().includes(lower) ||
            p.projeto.toLowerCase().includes(lower) ||
            p.modulo.toLowerCase().includes(lower)
          );
        }

        return filtered.sort((a, b) => new Date(b.producedAt!).getTime() - new Date(a.producedAt!).getTime());
    }, [pieces, ws, historySearch]);

    const handleScan = useCallback(async (barcode: string) => {
        // SECURITY: Sanitize input first
        const sanitized = sanitizeBarcode(barcode);
        if (!sanitized || sanitized.length < 3) {
            playSound("error");
            setLastMsg({ type: 'error', text: 'Código inválido' });
            setTimeout(() => inputRef.current?.focus(), 10);
            return;
        }

        if (isScanning) return;
        setIsScanning(true);
        setCode('');
        
        try {
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'pieces', `${ws}_${sanitized}`);
            const snap = await getDoc(ref);

            if (!snap.exists()) {
                playSound("error");
                setLastMsg({ type: 'error', text: 'Peça não encontrada no sistema.' });
                setTimeout(() => inputRef.current?.focus(), 10);
                return;
            }

            const piece = snap.data() as Piece;
            if (piece.status === "PRODUZIDA") {
                playSound("error");
                setLastMsg({ type: 'error', text: 'Esta peça já foi bipada!', data: piece });
                setTimeout(() => inputRef.current?.focus(), 10);
                return;
            }

            await updateDoc(ref, {
                status: "PRODUZIDA",
                producedAt: new Date().toISOString(),
                producedBy: currentUser.login_id,
                scanHistory: arrayUnion({
                    type: "SCAN",
                    at: new Date().toISOString(),
                    user: currentUser.login_id,
                }),
            });

            playSound("success");
            setLastMsg({ type: 'success', text: `SUCESSO: ${piece.nome || 'Peça'} bipada!`, data: piece });
            
            setTimeout(() => setLastMsg(prev => prev?.type === 'success' ? null : prev), 4000);
            setTimeout(() => inputRef.current?.focus(), 10);

        } catch (e) {
            console.error(e);
            playSound("error");
            setLastMsg({ type: 'error', text: 'Erro ao processar bipagem.' });
            setTimeout(() => inputRef.current?.focus(), 10);
        } finally {
            setIsScanning(false);
        }

    }, [currentUser.login_id, ws, isScanning]);

    useEffect(() => {
        if(!autoScan || !code) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        
        timerRef.current = setTimeout(() => { 
          if(code.length > 5) handleScan(code); 
        }, 300);
        
        return () => {
          if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [code, autoScan, handleScan]);

    return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in">
        <Breadcrumb items={[{label: 'Início', href: '#'}, {label: 'Produção', active: true}]} />

        <Card className="border-l-4 border-[#348e91] w-full shadow-md">
            <div className="flex justify-between mb-4">
            <h2 className="font-bold text-xl text-[#1c5052] flex items-center gap-2">
              <QrCode size={24} /> Controle de Produção
            </h2>
            <Tooltip text={autoScan ? "Envio automático após digitar" : "Necessário apertar Enter"} position="left">
              <button onClick={()=>setAutoScan(!autoScan)} className="text-xs font-bold text-gray-500 flex items-center bg-gray-100 px-3 py-1 rounded-full hover:bg-gray-200 transition-colors">
                  {autoScan ? <Zap size={14} className="mr-1 fill-current text-yellow-500" /> : <Zap size={14} className="mr-1" />}
                  {autoScan ? 'AUTO ON' : 'AUTO OFF'}
              </button>
            </Tooltip>
            </div>
            <form onSubmit={(e)=>{e.preventDefault(); handleScan(code);}}>
            <div className="relative">
              <input 
                  ref={inputRef}
                  value={code}
                  onChange={(e)=>setCode(e.target.value)}
                  className="w-full p-4 pl-12 text-2xl text-center border-2 border-[#348e91] rounded-xl uppercase font-mono shadow-inner focus:ring-4 focus:ring-[#348e91]/20 outline-none transition-all disabled:opacity-50"
                  placeholder={isScanning ? "PROCESSANDO..." : (autoScan ? "AGUARDANDO BIP..." : "DIGITE E ENTER")}
                  autoFocus
                  disabled={isScanning}
              />
              <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-300">
                <QrCode size={32} />
              </div>
            </div>
            </form>
            
            {lastMsg && (
            <div className={`mt-4 p-4 rounded-lg text-center text-white font-bold animate-in zoom-in-95 duration-300 ${lastMsg.type === 'success' ? 'bg-green-600 shadow-lg shadow-green-200' : 'bg-red-600 shadow-lg shadow-red-200'}`}>
                <div className="text-xl mb-1 flex items-center justify-center gap-2">
                  {lastMsg.type === 'success' ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                  {lastMsg.text}
                </div>
                {lastMsg.data && <div className="text-xs font-normal opacity-90">{String(lastMsg.data.modulo)} • {String(lastMsg.data.medidas)}</div>}
            </div>
            )}
        </Card>

        <Card className="w-full h-[500px] flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4 flex-shrink-0">
              <h3 className="font-bold text-[#1c5052] flex items-center"><History size={18} className="mr-2 text-[#348e91]"/> Histórico Recente ({history.length})</h3>
              <SearchFilterBar 
                onSearch={setHistorySearch} 
                placeholder="Filtrar histórico..." 
                className="w-full md:w-64"
              />
            </div>
            
            {loading ? (
              <SkeletonTable rows={5} />
            ) : history.length > 0 ? (
                <div className="flex-1 w-full border border-gray-100 rounded-lg overflow-y-auto">
                    <div className="flex bg-gray-50 border-b border-gray-100 py-3 px-4 text-xs text-gray-500 font-bold uppercase tracking-wider sticky top-0 z-10">
                        <div className="w-1/4">Hora</div>
                        <div className="w-1/4">Peça</div>
                        <div className="w-1/4">Cliente</div>
                        <div className="w-1/4 text-right">Módulo / Projeto</div>
                    </div>
                    {history.map((p) => (
                      <div key={p.id} className="flex items-center px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <div className="w-1/4 text-gray-400 text-xs truncate">
                              {new Date(p.producedAt!).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                          </div>
                          <div className="w-1/4 font-bold text-gray-700 text-xs truncate" title={p.nome}>{p.nome}</div>
                          <div className="w-1/4 text-gray-600 text-xs truncate" title={p.cliente}>{p.cliente}</div>
                          <div className="w-1/4 text-right">
                              <div className="text-[#348e91] font-black text-xs truncate" title={p.modulo}>{p.modulo}</div>
                              <div className="inline-block mt-0.5 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-[9px] font-bold uppercase tracking-wide truncate max-w-full" title={p.projeto}>
                                  {p.projeto}
                              </div>
                          </div>
                      </div>
                    ))}
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center">
                    <EmptyState 
                        title="Sem Histórico" 
                        description={historySearch ? "Nenhum resultado para sua busca." : "Nenhuma peça produzida hoje."} 
                        icon={History}
                    />
                </div>
            )}
        </Card>
        </div>
    );
};

const ExpedicaoComponent = ({ projects, pieces, warehouses, volumes, users }: ExpedicaoProps) => {
    const [selClient, setSelClient] = useState('');
    const [totalVols, setTotalVols] = useState(0);
    const [selWh, setSelWh] = useState('');
    const ws = getWorkspaceId();

    const clientProjects = useMemo(() => {
        if (!selClient) return [];
        return projects.filter((p) => {
        const display = formatClientDisplay(p.client_name, p.client_code);
        return display === selClient && p.workspaceId === ws && p.status !== 'ARQUIVADO';
        });
    }, [projects, selClient, ws]);

    const clientPecas = useMemo(() => {
        if (!selClient || clientProjects.length === 0) return [];
        const projectNames = clientProjects.map((p) => p.project_name);
        return pieces.filter((p) => projectNames.includes(p.projeto) && p.workspaceId === ws);
    }, [pieces, clientProjects, ws]);

    const actualProdComplete = useMemo(() => {
        return clientPecas.length > 0 && clientPecas.every((p) => p.status === 'PRODUZIDA');
    }, [clientPecas]);

    const clientVols = useMemo(() => {
        const pIds = clientProjects.map((p) => p.id);
        return volumes.filter((v) => pIds.includes(v.projectId) && v.workspaceId === ws);
    }, [volumes, clientProjects, ws]);

    const uniqueClients = useMemo(() => {
        const activeProjs = projects.filter((p) => p.workspaceId === ws && p.status !== 'ARQUIVADO');
        const clients = new Set(activeProjs.map((p) => formatClientDisplay(p.client_name, p.client_code)).filter(Boolean));
        return Array.from(clients).sort();
    }, [projects, ws]);

    const handleGenerate = useCallback(async () => {
        if(!selWh) return alert("Selecione um Armazém!");
        if(totalVols <= 0) return alert("Informe a quantidade de volumes.");
        if(!actualProdComplete) return alert("A produção do cliente (todos os projetos) ainda não foi concluída.");
        if(clientProjects.length === 0) return alert("Erro: Nenhum projeto encontrado para este cliente.");

        const mainProjId = clientProjects[0].id;
        const clientNameForBarcode = clientProjects[0].client_name; 
        
        const wh = warehouses.find((w) => w.id === selWh);
        
        const isOccupiedByOther = wh?.status === 'OCUPADO' && !clientProjects.some((p) => p.id === wh.current_project_id);
        if(isOccupiedByOther) return alert("Este armazém está ocupado por outro cliente!");

        if(clientVols.length > 0) {
        const master = users.find((u)=>u.role==='MASTER');
        const pass = prompt("Este cliente já tem volumes gerados. Digite a Senha Master para excluir TUDO e refazer:");
        if(pass !== master?.auth_password_override) return alert("Senha de Autorização Incorreta.");
        
        const batchDel = writeBatch(db);
        clientVols.forEach((v)=>batchDel.delete(doc(db, 'artifacts', appId, 'public', 'data', 'volumes', v.id)));
        await batchDel.commit();
        }

        const batch = writeBatch(db);
        for(let i=1; i<=totalVols; i++) {
        const vid = `${ws}_${mainProjId}_VOL_${i}`;
        const barcodeValue = `${clientNameForBarcode.toUpperCase()}_V${i}`;
        
        batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'volumes', vid), {
            id: vid,
            workspaceId: ws,
            projectId: mainProjId, 
            index: i,
            total: totalVols,
            loaded: false,
            barcode: barcodeValue
        });
        }

        if(wh) batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', selWh), { status: 'OCUPADO', current_project_id: mainProjId });
        
        clientProjects.forEach((p) => {
            batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'projects', p.id), { status: 'CARREGANDO', warehouse_id: selWh });
        });
        
        await batch.commit();
        alert("Volumes gerados com sucesso para o Cliente (Lote Unificado)!");
    }, [selWh, totalVols, actualProdComplete, clientProjects, clientVols, warehouses, users, ws]);

    const printModuleLabels = useCallback(() => {
        const win = window.open('','','width=800,height=600');
        if(!win || !selClient) return;
        
        const uniqueModules: any[] = [];
        const seen = new Set();
        
        clientPecas.forEach((p) => {
        const key = `${p.projeto}|${p.modulo}`;
        if (!seen.has(key)) {
            uniqueModules.push({ modulo: p.modulo, projeto: p.projeto, cliente: p.cliente });
            seen.add(key);
        }
        });

        uniqueModules.sort((a, b) => {
            if (a.projeto === b.projeto) return a.modulo.localeCompare(b.modulo);
            return a.projeto.localeCompare(b.projeto);
        });
        
        const html = uniqueModules.map(m => `
            <div class="label">
                <div class="label-header">
                <span>CLIENTE: ${selClient.substring(0,20)}</span>
                <span>${m.projeto.substring(0,15)}</span>
                </div>
                
                <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; width: 100%;">
                    <div class="label-title" style="font-size: 28pt; margin: 0; line-height: 1; font-weight: 900; text-transform: uppercase;">
                    ${m.modulo}
                    </div>
                </div>
                
                <div class="label-footer">ETIQUETA DE MÓDULO</div>
            </div>
            `).join('');

        win.document.write(`
        <html>
            <head><style>${PRINT_CSS}</style></head>
            <body>${html}<script>window.print()</script></body>
        </html>
        `);
        win.document.close();
    }, [selClient, clientPecas]);

    const printVolumes = useCallback(() => {
        const win = window.open('','','width=800,height=600');
        if(!win || !selClient) return;
        
        const sorted = [...clientVols].sort((a:any,b:any)=>a.index - b.index);
        
        const html = sorted.map(v => `
            <div class="label">
                <div class="label-header">
                <span>CLIENTE: ${selClient.substring(0,25)}</span>
                <span>LOTE UNIFICADO</span>
                </div>
                <div style="font-size: 10pt; font-weight: bold; text-align: center;">VOLUME ${v.index} DE ${v.total}</div>
                <div class="label-barcode">*${v.barcode}*</div>
                <div class="label-footer">${v.barcode}</div>
            </div>
            `).join('');

        win.document.write(`
        <html>
            <head>
            <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&display=swap" rel="stylesheet">
            <style>${PRINT_CSS}</style>
            </head>
            <body>${html}<script>document.fonts.ready.then(()=>setTimeout(()=>window.print(), 500))</script></body>
        </html>
        `);
        win.document.close();
    }, [selClient, clientVols]);

    return (
        <Card>
        <Breadcrumb items={[{label: 'Início', href: '#'}, {label: 'Expedição', active: true}]} />
        
        <h2 className="text-xl font-bold text-[#1c5052] mb-4 flex items-center gap-2">
          <Printer size={24} /> Gestão de Expedição
        </h2>
        <div className="mb-6">
            <label className="block text-sm font-bold mb-1 text-gray-700">Selecione o Cliente</label>
            <select className="w-full border p-2 rounded-lg bg-gray-50 focus:ring-2 focus:ring-[#348e91] outline-none transition-all" value={selClient} onChange={(e)=>setSelClient(e.target.value)}>
            <option value="">Selecione...</option>
            {uniqueClients.map((c: string, index: number)=><option key={`client_option_${c}_${index}`} value={c}>{String(c)}</option>)}
            </select>
            {selClient && (
                <div className="mt-2 bg-blue-50 p-3 rounded-lg text-xs text-blue-800 font-bold border border-blue-100 flex items-start gap-2 animate-in fade-in">
                    <Info size={14} className="mt-0.5 flex-shrink-0" />
                    <span>PROJETOS INCLUÍDOS: {clientProjects.map((p) => p.project_name).join(', ')}</span>
                </div>
            )}
        </div>

        {selClient && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-2">
            
            {/* CARTÃO ETIQUETAS DE MÓDULO (SEMPRE LIBERADO) */}
            <div className="bg-white p-6 rounded-xl border border-green-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1 shadow-sm">
                    <Unlock size={10} /> LIBERADO
                </div>
                
                <div className="mb-4">
                    <h3 className="font-bold text-green-700 mb-2 flex items-center"><FileText size={18} className="mr-2"/> Etiquetas de Módulo</h3>
                    <p className="text-xs text-gray-500 italic">Folha A4 (2x9). Imprime módulos de TODOS os projetos do cliente.</p>
                </div>
                
                <Tooltip text="Gera PDF para impressão de etiquetas individuais">
                  <Button onClick={printModuleLabels} variant="outline" className="w-full border-green-500 text-green-700 hover:bg-green-50">
                  Imprimir Etiquetas Módulo
                  </Button>
                </Tooltip>
            </div>

            {/* CARTÃO ETIQUETAS DE VOLUME (CONDICIONAL) */}
            <div className={`p-6 rounded-xl border shadow-sm relative overflow-hidden transition-all ${actualProdComplete ? 'bg-white border-green-200' : 'bg-gray-50 border-gray-200 opacity-90'}`}>
                <div className={`absolute top-0 right-0 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1 shadow-sm ${actualProdComplete ? 'bg-green-500' : 'bg-gray-400'}`}>
                    {actualProdComplete ? <><Unlock size={10} /> LIBERADO</> : <><Lock size={10} /> BLOQUEADO</>}
                </div>

                <div className="mb-4">
                <h3 className={`font-bold mb-4 flex items-center ${actualProdComplete ? 'text-green-700' : 'text-gray-500'}`}>
                    <Package size={18} className="mr-2"/> Etiquetas de Volume
                </h3>
                
                <div className="mb-3">
                    <label className="block text-xs font-bold text-gray-500 uppercase">Armazém Destino</label>
                    <select className="w-full border p-2 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#348e91] outline-none" value={selWh} onChange={(e)=>setSelWh(e.target.value)} disabled={clientVols.length > 0 || !actualProdComplete}>
                        <option value="">Selecione...</option>
                        {warehouses.filter((w)=>w.workspaceId === ws).map((w)=><option key={w.id} value={w.id} disabled={w.status==='OCUPADO' && !clientProjects.some((p) => p.id === w.current_project_id)}>{String(w.name)} ({String(w.status)})</option>)}
                    </select>
                </div>
                
                <div className="flex gap-2">
                    <div className="flex-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase">Qtd. Volumes</label>
                        <input type="number" className="w-full border p-2 rounded-lg bg-white focus:ring-2 focus:ring-[#348e91] outline-none" value={totalVols} onChange={(e:any)=>setTotalVols(Number(e.target.value))} disabled={!actualProdComplete} />
                    </div>
                    <Button onClick={handleGenerate} className="mt-4" disabled={!actualProdComplete}>Gerar Lote</Button>
                </div>
                </div>
                
                {!actualProdComplete && (
                <div className="p-3 bg-gray-100 border border-gray-200 rounded-lg flex items-center gap-2 mb-4 animate-pulse">
                    <Lock size={14} className="text-gray-400" />
                    <p className="text-[10px] text-gray-500 font-bold uppercase">Produção pendente (bipar todas as peças).</p>
                </div>
                )}

                {clientVols.length > 0 && <Button onClick={printVolumes} className="w-full"><Printer size={16} className="mr-2"/> Imprimir {clientVols.length} Etiquetas</Button>}
            </div>
            </div>
        )}
        </Card>
    );
};

interface AdminScreenProps {
  users: UserData[];
  warehouses: WarehouseData[];
  projects: Project[];
  pieces: Piece[];
  volumes: Volume[];
  currentUser: UserData;
}

const AdminScreenComponent = ({ users, warehouses, projects, pieces, volumes, currentUser }: AdminScreenProps) => {
    const [tab, setTab] = useState<'users' | 'warehouses' | 'projects' | 'import' | 'import_pdf'>('users');
    const [login, setLogin] = useState('');
    const [pass, setPass] = useState('');
    const [whName, setWhName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showSuccessToast, setShowSuccessToast] = useState<string | null>(null);
    const [isProcessingImport, setIsProcessingImport] = useState(false); // Bloqueio Race Condition
    
    // --- NOVOS ESTADOS PARA O MODAL DE EXCLUSÃO (SANDBOX FIX) ---
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingAction, setPendingAction] = useState<{
      type: 'deleteUser' | 'deleteWarehouse' | null;
      id: string | null;
      name: string | null;
    }>({
      type: null,
      id: null,
      name: null
    });

    // --- NOVOS ESTADOS PARA O MODAL DE EXCLUSÃO ---
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [clientToDelete, setClientToDelete] = useState<{name: string, code: string, projectCount: number} | null>(null);
    const [confirmationInput, setConfirmationInput] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // --- ESTADOS DE IMPORTAÇÃO E ERROS ---
    const [pecasFile, setPecasFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [importStatus, setImportStatus] = useState<{type:'success'|'error'|null, message:string}>({type: null, message: ''});
    
    // Lista global de erros da importação
    const [importErrors, setImportErrors] = useState<ImportError[]>([]);

    const MAX_FILE_SIZE = 10 * 1024 * 1024; 
    const MIN_ROWS_REQUIRED = 2; 

    const [previewData, setPreviewData] = useState<any[] | null>(null);
    const [pendingData, setPendingData] = useState<{ tempPecas: Piece[], clientProjects: any[] } | null>(null);

    // --- ESTADOS PARA IMPORTAÇÃO DE PDF ---
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [promobItems, setPromobItems] = useState<PromobItem[]>([]);
    const [isProcessingPdf, setIsProcessingPdf] = useState(false);
    const [pdfStatus, setPdfStatus] = useState<{type:'success'|'error'|null, message:string}>({type: null, message: ''});
    const [pdfGlobalErrors, setPdfGlobalErrors] = useState<ImportError[]>([]); // Erros globais do PDF

    const ws = getWorkspaceId();

    // Helpers para Modal Customizado
    const openConfirmModal = (type: 'deleteUser' | 'deleteWarehouse', id: string, name: string) => {
      setPendingAction({ type, id, name });
      setShowConfirmModal(true);
    };

    const closeConfirmModal = () => {
      setShowConfirmModal(false);
      setPendingAction({ type: null, id: null, name: null });
    };

    // Filtros
    const filteredUsers = useMemo(() => 
      users.filter(u => u.workspaceId === ws && u.login_id.toLowerCase().includes(searchTerm.toLowerCase())),
    [users, searchTerm, ws]);

    const filteredWarehouses = useMemo(() => 
      warehouses.filter(w => w.workspaceId === ws && w.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [warehouses, searchTerm, ws]);

    const saveUser = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if(!login || !pass) return;
        
        // --- SEGURANÇA: SANITIZAÇÃO ---
        const sanitizedId = sanitizeInput(login);
        const sanitizedPass = sanitizeInput(pass);

        const uid = `u_${Date.now()}`;
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', `${ws}_${uid}`), {
            id: `${ws}_${uid}`, workspaceId: ws, login_id: sanitizedId, password: sanitizedPass, role: 'SECONDARY'
        });
        setLogin(''); setPass('');
        setShowSuccessToast("Usuário criado com sucesso!");
        setTimeout(() => setShowSuccessToast(null), 3000);
    }, [login, pass, ws]);

    const saveWh = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if(!whName) return;
        
        const sanitizedName = sanitizeInput(whName);
        
        const wid = `wh_${Date.now()}`;
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', `${ws}_${wid}`), {
            id: `${ws}_${wid}`, workspaceId: ws, name: sanitizedName, status: 'LIVRE'
        });
        setWhName('');
        setShowSuccessToast("Armazém criado com sucesso!");
        setTimeout(() => setShowSuccessToast(null), 3000);
    }, [whName, ws]);

    // --- SEGURANÇA: FUNÇÕES DE DELETE PROTEGIDAS E MODALIZADAS ---
    const deleteUser = useCallback(async (userId: string, userName?: string) => {
        if (currentUser.role !== 'MASTER') {
            setShowSuccessToast("Apenas administradores podem remover usuários");
            setTimeout(() => setShowSuccessToast(null), 3000);
            return;
        }

        // Se não passou o nome, abrir modal para confirmação
        if (!userName) {
            const userToDelete = users.find((u) => u.id === userId);
            openConfirmModal('deleteUser', userId, userToDelete?.login_id || 'Usuário');
            return;
        }

        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', userId));
            setShowSuccessToast("Usuário removido!");
            closeConfirmModal();
            setTimeout(() => setShowSuccessToast(null), 3000);
        } catch (error) {
             console.error("Erro ao excluir:", error);
        }
    }, [currentUser.role, users]);

    const deleteWarehouse = useCallback(async (warehouseId: string, warehouseName?: string) => {
        if (currentUser.role !== 'MASTER') {
            setShowSuccessToast("Apenas administradores podem remover armazéns");
            setTimeout(() => setShowSuccessToast(null), 3000);
            return;
        }

        if (!warehouseName) {
            const warehouseToDelete = warehouses.find((w) => w.id === warehouseId);
            openConfirmModal('deleteWarehouse', warehouseId, warehouseToDelete?.name || 'Armazém');
            return;
        }

        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', warehouseId));
            setShowSuccessToast("Armazém removido!");
            closeConfirmModal();
            setTimeout(() => setShowSuccessToast(null), 3000);
        } catch (error) {
            console.error("Erro ao excluir:", error);
        }
    }, [currentUser.role, warehouses]);


    const executeClientDeletion = useCallback(async () => {
      if (!clientToDelete || isDeleting) return;
      
      // --- SEGURANÇA: CHECAGEM DE ROLE ---
      if (currentUser.role !== 'MASTER') {
         alert("Permissão insuficiente para excluir clientes.");
         setShowDeleteModal(false);
         return;
      }
      
      setIsDeleting(true);
      
      try {
        const clientName = clientToDelete.name;
        const ws = getWorkspaceId();
        
        const clientProjects = projects.filter(p => 
          p.workspaceId === ws && p.client_name === clientName
        );
        
        if (clientProjects.length === 0) {
          alert("Nenhum projeto encontrado para este cliente.");
          setShowDeleteModal(false);
          setIsDeleting(false);
          return;
        }
        
        const batch = writeBatch(db);
        
        const clientPieces = pieces.filter(p => 
          p.workspaceId === ws && p.cliente === clientName
        );
        
        clientPieces.forEach(p => {
          batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'pieces', p.id));
        });
        
        const projectIds = clientProjects.map(p => p.id);
        const clientVolumes = volumes.filter(v => 
          v.workspaceId === ws && projectIds.includes(v.projectId)
        );
        
        clientVolumes.forEach(v => {
          batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'volumes', v.id));
        });
        
        clientProjects.forEach(p => {
          batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'projects', p.id));
        });
        
        await batch.commit();
        
        setTimeout(() => {
          setShowSuccessToast(`Cliente "${clientName}" excluído!`);
          setShowDeleteModal(false);
          setClientToDelete(null);
          setConfirmationInput('');
          setIsDeleting(false);
          setTimeout(() => setShowSuccessToast(null), 3000);
        }, 100);
        
      } catch (error: any) {
        console.error("Erro na exclusão:", error);
        alert(`❌ Erro ao excluir cliente: ${error.message}`);
        setIsDeleting(false);
      }
    }, [clientToDelete, isDeleting, projects, pieces, volumes, currentUser.role]);

    const readFileAsText = useCallback((file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }, []);

    // --- HANDLE ANALYZE (CSV) COM ZOD E BLOQUEIO DE RACE CONDITION ---
    const handleAnalyze = useCallback(async () => {
      if (isProcessingImport) return;

      setImportStatus({type: null, message: ''});
      setImportErrors([]); // Limpar erros anteriores
      setPreviewData(null);
      setPendingData(null);

      if (!pecasFile) { 
        setImportStatus({ type: 'error', message: 'Erro: Selecione a planilha de etiquetas (peças).' }); 
        playSound("error"); 
        return; 
      }
      
      if (pecasFile.size > MAX_FILE_SIZE) { 
        setImportStatus({ type: 'error', message: `Erro: Arquivo muito grande. Máximo 10MB.` }); 
        playSound("error"); 
        return; 
      }

      setIsProcessingImport(true);
      setLoading(true);
      const errorsList: ImportError[] = [];

      try {
        const labelContentRaw = await readFileAsText(pecasFile);
        const labelContent = detectAndFixEncoding(labelContentRaw);
        
        // --- SEGURANÇA: SANITIZAÇÃO DE CONTEÚDO ---
        // Embora o parser CSV seja robusto, sanitizar evita payloads maliciosos
        // const sanitizedContent = sanitizeInput(labelContent); // Pode ser agressivo demais para CSV, mantemos apenas encoding fix e validação Zod forte.
        
        const lines1 = labelContent.split('\n');
        
        if (lines1.length < MIN_ROWS_REQUIRED) { 
          const err = { type: ImportErrorType.CSV_PARSE_ERROR, message: 'Arquivo vazio ou com linhas insuficientes', suggestion: 'Verifique se o arquivo CSV contém dados', severity: ImportErrorSeverity.CRITICAL };
          setImportErrors([err]);
          setImportStatus({ type: 'error', message: 'Arquivo inválido.' }); 
          return; 
        }

        // Parse Header e Processamento...
        // Índices fixos baseados no layout Haixun
        const ordemIndex = 16;
        const moduloIndex = 8;
        const codeIndex = 11;
        const observacaoIndex = 13;
        const nomePecaIndex = 3;
        const nomeModuloIndex = 2;
        const comprimentoIndex = 4;
        const larguraIndex = 5;
        const espessuraIndex = 6;
        const materialIndex = 9;
        const corIndex = 10;

        const tempPecas: Piece[] = [];
        const clientMap = new Map();
        
        let linhasProcessadas = 0;
        
        for(let i = 1; i < lines1.length; i++) {
          const line = lines1[i].trim();
          if (!line) continue;
          
          let cols: string[];
          try {
            cols = line.split(',').map(col => col.trim().replace(/^"|"$/g, ''));
          } catch (error) {
            errorsList.push({
               type: ImportErrorType.CSV_PARSE_ERROR,
               message: 'Erro ao ler linha do CSV',
               suggestion: 'Verifique caracteres especiais ou formato',
               lineNumber: i + 1,
               severity: ImportErrorSeverity.ERROR
            });
            continue;
          }
          
          if (cols.length < 17) {
            errorsList.push({
               type: ImportErrorType.MISSING_REQUIRED_COLUMN,
               message: `Linha com colunas insuficientes (${cols.length})`,
               suggestion: 'A linha deve ter pelo menos 17 colunas',
               lineNumber: i + 1,
               severity: ImportErrorSeverity.WARNING,
               value: line.substring(0, 30) + '...'
            });
            continue;
          }

          // === VALIDAÇÃO COM ZOD ===
          const rawData = {
            clientCode: cols[ordemIndex],
            clientName: cols[observacaoIndex],
            projectName: cols[moduloIndex],
            barcode: cols[codeIndex],
            pieceModule: cols[nomeModuloIndex],
            pieceName: cols[nomePecaIndex],
            comprimento: cols[comprimentoIndex],
            largura: cols[larguraIndex],
            espessura: cols[espessuraIndex],
            material: cols[materialIndex],
            cor: cols[corIndex]
          };

          const validation = CsvRowSchema.safeParse(rawData);

          if (!validation.success) {
            validation.error.issues.forEach(issue => {
              errorsList.push(mapZodErrorToImportError(issue, i + 1, 'CSV'));
            });
            continue;
          }

          const validData = validation.data;
          
          if (!clientMap.has(validData.clientCode)) {
            clientMap.set(validData.clientCode, { 
              clientCode: validData.clientCode, 
              clientName: validData.clientName, 
              projects: new Set() 
            });
          }
          
          clientMap.get(validData.clientCode).projects.add(validData.projectName);
          
          tempPecas.push({
            id: `${ws}_${validData.barcode}`,
            workspaceId: ws,
            nome: validData.pieceName || `Peça ${validData.barcode}`,
            modulo: validData.pieceModule || '',
            projeto: validData.projectName,
            cliente: validData.clientName,
            medidas: `${validData.comprimento || '0'}x${validData.largura || '0'}x${validData.espessura || '0'}`,
            material: validData.material || '',
            cor: validData.cor || '',
            status: 'PENDENTE'
          } as Piece);
          
          linhasProcessadas++;
        }

        setImportErrors(errorsList);

        if (tempPecas.length === 0) { 
          setImportStatus({ type: 'error', message: `Erro: Nenhuma peça válida encontrada.` }); 
          playSound("error"); 
          return; 
        }

        const previewList = Array.from(clientMap.values()).map((clientInfo: any) => {
          const projectStats = new Map();
          tempPecas.filter(p => p.cliente === clientInfo.clientName).forEach(p => {
            if (!projectStats.has(p.projeto)) {
              projectStats.set(p.projeto, { pieceCount: 0, modules: new Set() });
            }
            const stats = projectStats.get(p.projeto);
            stats.pieceCount++;
            stats.modules.add(p.modulo);
          });
          
          const projectList = Array.from(projectStats.entries()).map(([projName, stats]: [string, any]) => ({
            name: projName,
            pieceCount: stats.pieceCount,
            moduleCount: stats.modules.size
          }));
          
          return {
            clientCode: clientInfo.clientCode,
            clientName: clientInfo.clientName,
            totalProjects: projectList.length,
            totalModules: projectList.reduce((sum: number, p: any) => sum + p.moduleCount, 0),
            totalPieces: projectList.reduce((sum: number, p: any) => sum + p.pieceCount, 0),
            projects: projectList,
            isValid: true
          };
        });

        setPreviewData(previewList);
        setPendingData({ tempPecas, clientProjects: Array.from(clientMap.values()) });

        const totalErrors = errorsList.filter(e => e.severity !== ImportErrorSeverity.WARNING).length;
        if(totalErrors > 0) {
            setImportStatus({ type: 'error', message: `Análise com ${totalErrors} erros e ${linhasProcessadas} linhas válidas.` });
        } else {
            setImportStatus({ type: 'success', message: `Análise concluída: ${tempPecas.length} peças.` });
        }

      } catch (error: any) {
        console.error('Erro:', error);
        setImportErrors([{
            type: ImportErrorType.GENERIC_SYSTEM_ERROR,
            message: error.message || 'Erro desconhecido ao processar arquivo',
            suggestion: 'Tente salvar o arquivo novamente como CSV UTF-8',
            severity: ImportErrorSeverity.CRITICAL
        }]);
        setImportStatus({ type: 'error', message: 'Erro crítico na importação.' });
        playSound("error");
      } finally {
        setLoading(false);
        setIsProcessingImport(false);
      }
    }, [pecasFile, readFileAsText, detectAndFixEncoding, ws, isProcessingImport]);

    const handleConfirm = useCallback(async () => {
      if (!pendingData || isProcessingImport) return;
      
      setIsProcessingImport(true);
      setLoading(true);

      try {
        const { tempPecas, clientProjects } = pendingData;
        const batch = writeBatch(db);
        const uniqueProjs = new Map();

        tempPecas.forEach((p) => {
          const key = `${p.cliente}_${p.projeto}`;
          if(!uniqueProjs.has(key)) {
            uniqueProjs.set(key, { 
              client: p.cliente, 
              project: p.projeto,
              clientCode: clientProjects.find((c:any) => c.clientName === p.cliente)?.clientCode || ''
            });
          }
        });

        uniqueProjs.forEach((val, key) => {
          const projId = key.replace(/\s+/g, '_').toUpperCase();
          batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'projects', projId), {
            id: projId,
            workspaceId: ws,
            project_name: val.project,
            client_name: val.client,
            client_code: val.clientCode,
            status: 'PRODUCAO',
            created_at: new Date().toISOString(),
            module_dimensions: {}
          });
        });

        tempPecas.forEach((p) => {
          batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'pieces', p.id), p);
        });
        
        await batch.commit();
        
        setImportStatus({type: 'success', message: 'Importação realizada com sucesso!'});
        playSound("success");
        setPreviewData(null);
        setPendingData(null);
        setPecasFile(null);
        setImportErrors([]);
        setTimeout(() => setImportStatus({type: null, message: ''}), 5000);

      } catch (error) {
        console.error(error);
        setImportStatus({type: 'error', message: 'Erro ao gravar dados.'});
        playSound("error");
      } finally {
        setLoading(false);
        setIsProcessingImport(false);
      }
    }, [pendingData, ws, isProcessingImport]);

    const handleCancel = useCallback(() => {
        setPreviewData(null);
        setPendingData(null);
        setPecasFile(null);
        setImportErrors([]);
        setImportStatus({type: null, message: ''});
    }, []);

    // --- PROCESS PDF FILE (PDF) COM ZOD ---
    const processPdfFile = useCallback(async () => {
      if (!pdfFile || isProcessingPdf) return;
      setIsProcessingPdf(true);
      setPdfStatus({ type: null, message: '' });
      setPdfGlobalErrors([]);
      setPromobItems([]);

      try {
        const pdfjs = await loadPdfJs();
        const arrayBuffer = await pdfFile.arrayBuffer();
        
        let pdf;
        try {
            pdf = await pdfjs.getDocument(arrayBuffer).promise;
        } catch (pdfError: any) {
            let userMsg = 'Erro ao abrir PDF.';
            let suggestion = 'Verifique se o arquivo é um PDF válido.';
            let type = ImportErrorType.PDF_CORRUPTED;
            
            if(pdfError.name === 'PasswordException') {
                userMsg = 'PDF protegido por senha.';
                suggestion = 'Remova a senha do arquivo antes de importar.';
                type = ImportErrorType.PDF_PASSWORD_PROTECTED;
            }

            setPdfGlobalErrors([{
                type,
                message: userMsg,
                suggestion,
                severity: ImportErrorSeverity.CRITICAL
            }]);
            throw new Error(userMsg);
        }

        const totalPages = pdf.numPages;
        console.log(`Processing PDF with ${totalPages} pages`);
        
        const extractedItems: PromobItem[] = [];
        const parsingErrors: ImportError[] = [];
        
        for (let i = 1; i <= totalPages; i++) {
          try {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });
            const { width, height } = viewport;
            
            const cols = 2;
            const rows = 9;
            const colWidth = width / cols;
            const rowHeight = height / rows;
            
            const cells: string[][] = Array(rows * cols).fill(null).map(() => []);
            
            textContent.items.forEach((item: any) => {
                const x = item.transform[4];
                const y = item.transform[5];
                const topY = height - y;
                const colIndex = Math.floor(x / colWidth);
                const rowIndex = Math.floor(topY / rowHeight);
                if (colIndex >= 0 && colIndex < cols && rowIndex >= 0 && rowIndex < rows) {
                const cellIndex = rowIndex * cols + colIndex;
                cells[cellIndex].push(item.str);
                }
            });
            
            cells.forEach((cellLines, cellIdx) => {
                if (cellLines.length === 0) return;
                const fullText = cellLines.join(' ');
                
                // Regex Melhorados
                const clienteMatch = fullText.match(/(?:Cliente|Client):\s*([^:]+?)(?=\s*(?:Projeto|Módulo|Peça|obs|Chapa|Cód|$))/i);
                const projetoMatch = fullText.match(/(?:Projeto|Project):\s*([^:]+?)(?=\s*(?:Módulo|Peça|obs|Chapa|Cód|$))/i);
                const moduloMatch = fullText.match(/(?:Módulo|Module):\s*([^:]+?)(?=\s*(?:Peça|obs|Chapa|Cód|$))/i);
                const pecaMatch = fullText.match(/(?:Peça|Piece):\s*([^:]+?)(?=\s*(?:obs|Chapa|Cód|$))/i);
                const obsMatch = fullText.match(/(?:obs|observation):\s*([^:]+?)(?=\s*(?:Chapa|Cód|$))/i);
                const codMatch = fullText.match(/(?:Cód\. Item|Code|Item):\s*([^:]+?)(?=\s*(?:Medidas|$))/i);
                const medidasMatch = fullText.match(/\d+(?:[.,]\d+)?\s*[xX]\s*\d+(?:[.,]\d+)?(?:\s*[xX]\s*\d+(?:[.,]\d+)?)?\s*mm/i);
                
                const rawCod = codMatch ? codMatch[1].trim() : '';
                
                // Ignorar células vazias que não parecem etiquetas
                if (!rawCod && !pecaMatch) return; 

                // === VALIDAÇÃO COM ZOD ===
                const rawItem = {
                  cliente: clienteMatch ? clienteMatch[1] : '',
                  projeto: projetoMatch ? projetoMatch[1] : '',
                  modulo: moduloMatch ? moduloMatch[1] : '',
                  peca: pecaMatch ? pecaMatch[1] : '',
                  obs: obsMatch ? obsMatch[1] : '',
                  codItem: rawCod,
                  medidas: medidasMatch ? medidasMatch[0] : ''
                };

                const validation = PdfItemSchema.safeParse(rawItem);
                
                const itemErrors: string[] = [];
                let isValid = true;

                if (!validation.success) {
                  isValid = false;
                  validation.error.issues.forEach(issue => {
                    itemErrors.push(issue.message);
                    // Adiciona também à lista global de erros de parsing
                    parsingErrors.push(mapZodErrorToImportError(issue, i, 'PDF'));
                  });
                }
                
                const validData = validation.success ? validation.data : rawItem;

                // Verificação de duplicidade (Regra de Negócio que Zod não cobre facilmente sem contexto externo)
                const isDuplicate = pieces.some((p:any) => p.id.endsWith(String(validData.codItem || '')));
                if (isDuplicate) {
                    isValid = false;
                    itemErrors.push('Código já existe no sistema');
                }

                const item: PromobItem = {
                    id: crypto.randomUUID(),
                    cliente: String(validData.cliente || '').trim(),
                    projeto: String(validData.projeto || '').trim(),
                    modulo: String(validData.modulo || '').trim(),
                    peca: String(validData.peca || '').trim(),
                    obs: String(validData.obs || '').trim(),
                    codItem: String(validData.codItem || '').trim(),
                    medidas: String(validData.medidas || '').trim(),
                    isValid: isValid,
                    errors: itemErrors
                };
                
                extractedItems.push(item);
            });
          } catch (pageErr) {
              console.error(`Error on page ${i}`, pageErr);
              parsingErrors.push({
                  type: ImportErrorType.PDF_LAYOUT_UNEXPECTED,
                  message: `Erro ao processar página ${i}`,
                  suggestion: 'Verifique se a página contém elementos inválidos',
                  pageNumber: i,
                  severity: ImportErrorSeverity.ERROR
              });
          }
        }
        
        setPromobItems(extractedItems);

        if(parsingErrors.length > 0) {
             setPdfGlobalErrors(parsingErrors);
             setPdfStatus({ type: 'error', message: `Extração concluída com ${parsingErrors.length} problemas.` });
        } else if (extractedItems.length === 0) {
             setPdfStatus({ type: 'error', message: 'Nenhuma etiqueta encontrada.' });
        } else {
             setPdfStatus({ type: 'success', message: `${extractedItems.length} etiquetas extraídas com sucesso.` });
        }
        
      } catch (error: any) {
        console.error("PDF Processing Error:", error);
        setPdfStatus({ type: 'error', message: `Erro fatal: ${error.message}` });
      } finally {
        setIsProcessingPdf(false);
      }
    }, [pdfFile, pieces, isProcessingPdf]);

    const updatePromobItem = useCallback((id: string, field: keyof PromobItem, value: string) => {
        setPromobItems(prev => prev.map(item => {
            if (item.id === id) {
                // Ao editar manualmente, rodar validação Zod novamente no campo específico
                let newErrors = [...item.errors]; // Copia erros atuais
                let newIsValid = item.isValid;

                // Remove erros antigos relacionados a validação básica
                newErrors = newErrors.filter(e => e !== 'Cliente muito curto' && e !== 'Nome do cliente muito curto'); 

                if (field === 'cliente') {
                  const res = ClientNameSchema.safeParse(value);
                  if(!res.success) {
                     newErrors.push(res.error.issues[0].message);
                  }
                }
                
                // Limpeza básica se erros zerarem
                if (newErrors.length === 0) newIsValid = true;
                else newIsValid = false;

                return { ...item, [field]: value, errors: newErrors, isValid: newIsValid };
            }
            return item;
        }));
    }, []);

    const savePromobData = useCallback(async () => {
        if(isProcessingPdf) return;
        setIsProcessingPdf(true);

        const updatedItems = promobItems.map(item => {
            // Re-validação final antes de salvar
            const validation = PdfItemSchema.safeParse(item);
            let errors: string[] = [];
            let isValid = true;

            if (!validation.success) {
              errors = validation.error.issues.map(i => i.message);
              isValid = false;
            }
            
            // Garantir que cliente não está vazio ao salvar
            if (!item.cliente || item.cliente.trim() === '') {
                errors.push("Nome do cliente é obrigatório");
                isValid = false;
            }
            
            return { ...item, isValid, errors };
        });

        setPromobItems(updatedItems);
        
        const invalidItems = updatedItems.filter(i => !i.isValid);
        const hasEmptyClients = updatedItems.some(i => !i.cliente || i.cliente.trim() === '');
        
        if (invalidItems.length > 0) {
            setIsProcessingPdf(false);
            if (hasEmptyClients) {
                alert('⚠️ Alguns itens não têm cliente definido. Você pode preencher manualmente na tabela.');
            } else {
                alert(`⚠️ Existem ${invalidItems.length} itens com erros. Corrija antes de importar.`);
            }
            return;
        }

        const validItems = updatedItems.filter(i => i.isValid);
        if (validItems.length === 0) {
            setIsProcessingPdf(false);
            return alert("Nenhum item válido para importar.");
        }

        const batch = writeBatch(db);
        const newProjects = new Set();

        validItems.forEach(item => {
            const barcode = item.codItem.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            if (!barcode) return;

            const pid = `${ws}_${barcode}`;
            const projName = item.projeto || item.modulo || 'Projeto Promob';
            const clientName = item.cliente || 'Cliente Promob';
            const projId = `${clientName}_${projName}`.replace(/\s+/g, '_').toUpperCase();

            const projectRef = doc(db, 'artifacts', appId, 'public', 'data', 'projects', projId);
            if (!newProjects.has(projId)) {
                batch.set(projectRef, {
                    id: projId,
                    workspaceId: ws,
                    project_name: projName,
                    client_name: clientName,
                    client_code: '', 
                    status: 'PRODUCAO',
                    created_at: new Date().toISOString(),
                    module_dimensions: {}
                }, { merge: true });
                newProjects.add(projId);
            }

            batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'pieces', pid), {
                id: pid,
                workspaceId: ws,
                nome: item.peca || `Peça ${barcode}`,
                modulo: item.modulo,
                projeto: projName,
                cliente: clientName,
                medidas: item.medidas,
                material: '', 
                cor: '', 
                status: 'PENDENTE'
            });
        });

        try {
            await batch.commit();
            setShowSuccessToast("Importação Promob concluída!");
            setPromobItems([]);
            setPdfFile(null);
            setPdfStatus({type: null, message: ''});
            setPdfGlobalErrors([]);
            setTimeout(() => setShowSuccessToast(null), 3000);
        } catch (e: any) {
            console.error(e);
            alert("Erro ao salvar dados: " + e.message);
        } finally {
            setIsProcessingPdf(false);
        }
    }, [promobItems, ws, isProcessingPdf]);

    // Modal de Confirmação Customizado
    const ConfirmModal = () => {
      if (!showConfirmModal) return null;
      
      const getModalTitle = () => {
        switch (pendingAction.type) {
          case 'deleteUser': return 'CONFIRMAR EXCLUSÃO DE USUÁRIO';
          case 'deleteWarehouse': return 'CONFIRMAR EXCLUSÃO DE ARMAZÉM';
          default: return 'CONFIRMAR AÇÃO';
        }
      };
      
      const getModalMessage = () => {
        switch (pendingAction.type) {
          case 'deleteUser': return `Tem certeza que deseja excluir o usuário "${pendingAction.name}"?`;
          case 'deleteWarehouse': return `Tem certeza que deseja excluir o armazém "${pendingAction.name}"?`;
          default: return 'Tem certeza que deseja prosseguir?';
        }
      };
      
      const handleConfirm = () => {
        if (!pendingAction.id || !pendingAction.type) return;
        
        switch (pendingAction.type) {
          case 'deleteUser':
            deleteUser(pendingAction.id, pendingAction.name || '');
            break;
          case 'deleteWarehouse':
            deleteWarehouse(pendingAction.id, pendingAction.name || '');
            break;
        }
      };
      
      return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95">
            <div className="bg-red-600 text-white p-6">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black">{getModalTitle()}</h3>
                  <p className="text-sm opacity-90">Esta ação não pode ser desfeita</p>
                </div>
              </div>
            </div>
            
            <div className="p-6">
              <p className="font-bold text-gray-700 mb-6 text-center">{getModalMessage()}</p>
              
              <div className="flex gap-3">
                <button
                  onClick={closeConfirmModal}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-lg font-bold hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
                
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />
                  Confirmar Exclusão
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            {showSuccessToast && <SuccessToast message={showSuccessToast} onClose={() => setShowSuccessToast(null)} />}
            
            {/* Modal de Confirmação Customizado */}
            <ConfirmModal />

            <Breadcrumb items={[{label: 'Início', href: '#'}, {label: 'Administração', active: true}]} />

            <div className="flex gap-2 border-b border-gray-300 pb-2 overflow-x-auto no-scrollbar">
                <button onClick={()=>setTab('users')} className={`px-4 py-2 font-bold whitespace-nowrap transition-all ${tab==='users'?'text-[#348e91] border-b-2 border-[#348e91]':'text-gray-400 hover:text-gray-600'}`}>Usuários</button>
                <button onClick={()=>setTab('warehouses')} className={`px-4 py-2 font-bold whitespace-nowrap transition-all ${tab==='warehouses'?'text-[#348e91] border-b-2 border-[#348e91]':'text-gray-400 hover:text-gray-600'}`}>Armazéns</button>
                <button onClick={()=>setTab('projects')} className={`px-4 py-2 font-bold whitespace-nowrap transition-all ${tab==='projects'?'text-[#348e91] border-b-2 border-[#348e91]':'text-gray-400 hover:text-gray-600'}`}>Gerir Projetos</button>
                <button onClick={()=>setTab('import')} className={`px-4 py-2 font-bold whitespace-nowrap transition-all ${tab==='import'?'text-[#348e91] border-b-2 border-[#348e91]':'text-gray-400 hover:text-gray-600'}`}>Importar Haixun</button>
                <button onClick={()=>setTab('import_pdf')} className={`px-4 py-2 font-bold whitespace-nowrap transition-all ${tab==='import_pdf'?'text-[#348e91] border-b-2 border-[#348e91]':'text-gray-400 hover:text-gray-600'}`}>Importar Promob</button>
            </div>

            {tab === 'users' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <h3 className="font-bold text-[#1c5052] mb-4">Novo Usuário</h3>
                        <form onSubmit={saveUser}>
                            <Input label="Login ID" value={login} onChange={(e:any)=>setLogin(e.target.value)} />
                            <Input label="Senha" type="password" value={pass} onChange={(e:any)=>setPass(e.target.value)} />
                            <Button type="submit" className="w-full mt-4">Cadastrar</Button>
                        </form>
                    </Card>
                    <Card>
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-[#1c5052]">Usuários Ativos</h3>
                          <SearchFilterBar onSearch={setSearchTerm} placeholder="Buscar usuário..." className="w-40" />
                        </div>
                        <div className="space-y-1">
                          {filteredUsers.length > 0 ? filteredUsers.filter((u)=>u.role!=='MASTER').map((u)=>(
                              <div key={`user_${u.id}_${u.login_id}`} className="flex justify-between items-center p-3 border-b hover:bg-gray-50 transition-colors">
                                  <span>{String(u.login_id)}</span>
                                  <Tooltip text="Remover usuário">
                                    <button onClick={() => deleteUser(u.id)} className="text-red-500 hover:bg-red-50 p-2 rounded transition-colors">
                                      <Trash2 size={16}/>
                                    </button>
                                  </Tooltip>
                              </div>
                          )) : <EmptyState title="" description="Nenhum usuário encontrado" />}
                        </div>
                    </Card>
                </div>
            )}

            {tab === 'warehouses' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <h3 className="font-bold text-[#1c5052] mb-4">Novo Armazém</h3>
                        <form onSubmit={saveWh}>
                            <Input label="Identificação" value={whName} onChange={(e:any)=>setWhName(e.target.value)} />
                            <Button type="submit" className="w-full mt-4">Adicionar</Button>
                        </form>
                    </Card>
                    <Card>
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-[#1c5052]">Lista de Armazéns</h3>
                          <SearchFilterBar onSearch={setSearchTerm} placeholder="Buscar armazém..." className="w-40" />
                        </div>
                        <div className="space-y-1">
                          {filteredWarehouses.length > 0 ? filteredWarehouses.map((w)=>(
                              <div key={`warehouse_${w.id}_${w.name}`} className="flex justify-between items-center p-3 border-b hover:bg-gray-50 transition-colors">
                                  <div>
                                      <span className="font-bold">{String(w.name)}</span>
                                      <span className={`ml-2 text-[10px] px-2 py-0.5 rounded ${w.status==='LIVRE'?'bg-green-100 text-green-800':'bg-red-100 text-red-800'}`}>{String(w.status)}</span>
                                  </div>
                                  <Tooltip text="Remover armazém">
                                    <button onClick={() => deleteWarehouse(w.id)} className="text-red-500 hover:bg-red-50 p-2 rounded transition-colors">
                                      <Trash2 size={16}/>
                                    </button>
                                  </Tooltip>
                              </div>
                          )) : <EmptyState title="" description="Nenhum armazém encontrado" />}
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB IMPORT CSV HAIXUN */}
            {tab === 'import' && !previewData && (
                <Card>
                    <h3 className="font-bold text-[#1c5052] mb-4">Importação Multi-Cliente</h3>
                    
                    {importStatus.type && (
                        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 border animate-in slide-in-from-top-2 ${
                            importStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                            {importStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5"/> : <XCircle className="w-5 h-5"/>}
                            <span className="font-bold">{importStatus.message}</span>
                        </div>
                    )}
                    
                    {/* NOVO COMPONENTE DE ERROS */}
                    <ErrorDisplay errors={importErrors} />

                    <div className="space-y-4">
                        <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded border border-blue-100">
                             <strong>Instruções de Importação:</strong> 
                            <ul className="mt-1 list-disc pl-4">
                                <li>Carregue a planilha de etiquetas (CSV)</li>
                                <li>O sistema extrairá automaticamente: Clientes, Projetos e Peças</li>
                                <li>Tamanho máximo: 10MB</li>
                                <li>Colunas necessárias: Ordem (código), Observação (cliente), Módulo (projeto), CODE (código de barras)</li>
                            </ul>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-bold mb-2">Planilha de Etiquetas</label>
                            <input 
                                type="file" 
                                accept=".csv" 
                                onChange={(e:any)=>setPecasFile(e.target.files[0])} 
                                className="block w-full text-xs text-gray-500 file:bg-[#348e91] file:text-white file:py-2 file:px-4 file:rounded-lg file:border-0" 
                            />
                            {pecasFile && (
                                <div className="mt-2 text-xs font-bold text-[#348e91]">
                                    ✅ Arquivo selecionado: {pecasFile.name}
                                </div>
                            )}
                        </div>
                        
                        <Button 
                            onClick={handleAnalyze} 
                            className="w-full mt-4" 
                            disabled={loading || !pecasFile || isProcessingImport}
                        >
                        {isProcessingImport ? (
                            <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Processando...
                            </>
                        ) : loading ? (
                            "Carregando..."
                        ) : (
                            `Analisar ${pecasFile ? '1' : '0'} arquivo de etiquetas`
                        )}
                        </Button>
                    </div>
                </Card>
            )}

            {/* TELA DE PREVIEW */}
            {tab === 'import' && previewData && (
                <div className="space-y-6 animate-in fade-in">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-xl text-[#1c5052]">Preview da Importação</h3>
                        <div className="text-xs font-bold bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full border border-yellow-200">
                            MODO VISUALIZAÇÃO - DADOS NÃO SALVOS
                        </div>
                    </div>
                    
                    {/* Exibir erros também no preview se houver avisos não impeditivos */}
                    <ErrorDisplay errors={importErrors} />

                    <div className="grid grid-cols-1 gap-4">
                        {previewData.map((client: any, index: number) => (
                            <Card key={`import_preview_${client.clientCode}_${index}`} className="border-l-4 border-green-500">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h4 className="text-lg font-black text-[#213635] uppercase">{client.clientName}</h4>
                                        <div className="flex gap-4 mt-2 text-xs font-bold text-gray-500 uppercase">
                                            <span><FolderTree size={12} className="inline mr-1"/> {client.totalProjects} Projetos</span>
                                            <span><Package size={12} className="inline mr-1"/> {client.totalModules} Módulos</span>
                                            <span><CheckCircle size={12} className="inline mr-1"/> {client.totalPieces} Peças</span>
                                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                              Código: {client.clientCode}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="px-3 py-1 rounded text-xs font-bold bg-green-100 text-green-800">
                                        PRONTO PARA IMPORTAR
                                    </div>
                                </div>
                                
                                <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    <h5 className="text-[10px] font-bold text-[#348e91] uppercase mb-2 border-b pb-1">Projetos deste Cliente</h5>
                                    <div className="space-y-2">
                                        {client.projects.map((p: any, idx: number) => (
                                            <div key={`project_${idx}`} className="flex justify-between items-center p-2 bg-white rounded border border-gray-200">
                                                <div>
                                                    <div className="font-bold text-sm text-gray-700">{p.name}</div>
                                                    <div className="text-[10px] text-gray-400">{p.moduleCount} módulo(s) único(s)</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="font-bold text-[#1c5052]">{p.pieceCount} peças</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-gray-200">
                        <Button onClick={handleCancel} variant="danger" className="flex-1">
                            Cancelar Importação
                        </Button>
                        <Button 
                            onClick={handleConfirm} 
                            className="flex-1" 
                            disabled={loading || isProcessingImport}
                        >
                            {isProcessingImport ? "Gravando..." : "Confirmar Importação"}
                        </Button>
                    </div>
                </div>
            )}

            {tab === 'import_pdf' && (
                <Card>
                    <h3 className="font-bold text-[#1c5052] mb-4 flex items-center">
                        <FileUp className="mr-2" size={24}/> Importar Etiquetas Promob (PDF)
                    </h3>
                    
                    {pdfStatus.type && (
                        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 border animate-in slide-in-from-top-2 ${
                            pdfStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                            {pdfStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5"/> : <XCircle className="w-5 h-5"/>}
                            <span className="font-bold">{pdfStatus.message}</span>
                        </div>
                    )}
                    
                    {/* EXIBIÇÃO DE ERROS GLOBAIS DO PDF */}
                    <ErrorDisplay errors={pdfGlobalErrors} />

                    <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center mb-8">
                        <div className="mb-4 flex justify-center">
                            <div className="bg-white p-4 rounded-full shadow-sm">
                                <FileText size={32} className="text-[#348e91]" />
                            </div>
                        </div>
                        <h4 className="font-bold text-gray-700 mb-1">Carregar arquivo PDF</h4>
                        <p className="text-xs text-gray-400 mb-6">Suporte para layout padrão Promob (18 etiquetas/pág)</p>
                        
                        <div className="flex justify-center">
                            <label className="cursor-pointer bg-[#348e91] hover:bg-[#2a7375] text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center">
                                <Upload size={18} className="mr-2" />
                                Selecionar PDF
                                <input 
                                    type="file" 
                                    accept=".pdf" 
                                    className="hidden" 
                                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)} 
                                />
                            </label>
                        </div>
                        {pdfFile && <div className="mt-4 text-sm font-bold text-[#213635]">Arquivo: {pdfFile.name}</div>}
                        
                        <div className="mt-4 flex justify-center">
                            <Button 
                                onClick={processPdfFile} 
                                disabled={!pdfFile || isProcessingPdf} 
                                className="w-48"
                            >
                                {isProcessingPdf ? "Processando..." : "Processar PDF"}
                            </Button>
                        </div>
                    </div>

                    {promobItems.length > 0 && (
                        <div className="animate-in fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="font-bold text-[#1c5052]">Dados Extraídos ({promobItems.length} itens)</h4>
                                <Button onClick={savePromobData} className="bg-green-600 hover:bg-green-700" disabled={isProcessingPdf}>
                                    <Save size={18} className="mr-2" /> 
                                    {isProcessingPdf ? "Importando..." : "Importar para o Sistema"}
                                </Button>
                            </div>
                            
                            <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase">
                                        <tr>
                                            <th className="p-3 w-4">Status</th>
                                            <th className="p-3">Cliente</th>
                                            <th className="p-3">Projeto</th>
                                            <th className="p-3">Módulo</th>
                                            <th className="p-3">Peça</th>
                                            <th className="p-3">Obs</th>
                                            <th className="p-3">Cód. Item</th>
                                            <th className="p-3">Medidas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {promobItems.map((item) => (
                                            <tr key={item.id} className={!item.isValid ? "bg-red-50" : "hover:bg-gray-50"}>
                                                <td className="p-3 text-center">
                                                    {item.isValid 
                                                        ? <CheckCircle2 size={16} className="text-green-500" />
                                                        : <div className="group relative">
                                                            <AlertTriangle size={16} className="text-red-500 cursor-help" />
                                                            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-black text-white text-[10px] rounded shadow-lg z-10 text-left">
                                                                <div className="font-bold border-b border-gray-600 pb-1 mb-1">Erros encontrados:</div>
                                                                <ul className="list-disc pl-3">
                                                                    {item.errors.map((e, idx) => <li key={idx}>{e}</li>)}
                                                                </ul>
                                                            </div>
                                                          </div>
                                                    }
                                                </td>
                                                <td className="p-1">
                                                    <input 
                                                        value={item.cliente} 
                                                        onChange={e=>updatePromobItem(item.id, 'cliente', e.target.value)} 
                                                        className={`w-full p-1 border rounded ${item.errors.includes('Nome do cliente é obrigatório') ? 'border-red-500 bg-red-100 placeholder-red-300' : ''}`}
                                                        placeholder={item.errors.includes('Nome do cliente é obrigatório') ? "Obrigatório" : ""}
                                                    />
                                                </td>
                                                <td className="p-1"><input value={item.projeto} onChange={e=>updatePromobItem(item.id, 'projeto', e.target.value)} className="w-full p-1 border rounded" /></td>
                                                <td className="p-1"><input value={item.modulo} onChange={e=>updatePromobItem(item.id, 'modulo', e.target.value)} className="w-full p-1 border rounded" /></td>
                                                <td className="p-1"><input value={item.peca} onChange={e=>updatePromobItem(item.id, 'peca', e.target.value)} className="w-full p-1 border rounded" /></td>
                                                <td className="p-1"><input value={item.obs} onChange={e=>updatePromobItem(item.id, 'obs', e.target.value)} className="w-full p-1 border rounded" /></td>
                                                <td className="p-1">
                                                    <input 
                                                        value={item.codItem} 
                                                        readOnly 
                                                        className="w-full p-1 border rounded font-mono bg-gray-100 text-gray-500 cursor-not-allowed" 
                                                    />
                                                </td>
                                                <td className="p-1"><input value={item.medidas} onChange={e=>updatePromobItem(item.id, 'medidas', e.target.value)} className="w-full p-1 border rounded" /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </Card>
            )}

            {tab === 'projects' && (
                <Card>
                    <h3 className="font-bold text-[#1c5052] mb-4">Gerenciar Projetos</h3>
                    <div className="space-y-6">
                        {Object.entries(
                            projects.filter((p:any) => p.workspaceId === ws)
                            .reduce((acc: any, proj: any) => {
                                const rawName = proj.client_name || 'Sem Cliente';
                                const displayName = formatClientDisplay(rawName, proj.client_code);
                                
                                if (!acc[displayName]) acc[displayName] = [];
                                acc[displayName].push(proj);
                                return acc;
                            }, {})
                        ).sort((a:any, b:any) => a[0].localeCompare(b[0])).map(([clientDisplayName, clientProjects]: [string, any], index: number) => (
                            <div key={`admin_client_${clientDisplayName}_${index}_${clientProjects[0]?.id || 'no_id'}`} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b border-gray-200">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-[#348e91] p-1.5 rounded text-white">
                                            <UserIcon size={16} />
                                        </div>
                                        <span className="font-black text-[#1c5052] uppercase text-sm tracking-wide">{clientDisplayName}</span>
                                        <span className="text-[10px] bg-white border px-2 py-0.5 rounded-full text-gray-500 font-bold ml-2">
                                            {clientProjects.length} PROJETOS
                                        </span>
                                    </div>
                                    <Tooltip text="Esta ação excluirá todos os projetos e peças deste cliente">
                                      <button 
                                          type="button" 
                                          style={{ pointerEvents: "auto", cursor: "pointer", zIndex: 9999 }}
                                          onClick={(e) => {
                                              const realClientName = clientProjects[0]?.client_name;
                                              const clientCode = clientProjects[0]?.client_code || '';
                                              if (!realClientName) {
                                                  alert("Erro: Não foi possível identificar o nome do cliente.");
                                                  return;
                                              }
                                              setClientToDelete({
                                                  name: realClientName,
                                                  code: clientCode,
                                                  projectCount: clientProjects.length
                                              });
                                              setConfirmationInput('');
                                              setShowDeleteModal(true);
                                          }} 
                                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-xs font-bold uppercase transition-colors flex items-center gap-2"
                                      >
                                          <Trash2 size={12} />
                                          EXCLUIR CLIENTE
                                      </button>
                                    </Tooltip>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {clientProjects.map((p: Project, idx: number) => (
                                        <div key={`admin_project_${p.id}_${idx}_${p.project_name}`} className="p-3 flex justify-between items-center hover:bg-gray-50 transition-all">
                                            <div className="pl-2 border-l-4 border-[#348e91] w-full">
                                                <div className="font-bold text-sm text-[#213635]">{p.project_name}</div>
                                                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                                    STATUS: <span className={p.status === 'ARQUIVADO' ? 'text-red-400' : 'text-green-600'}>{p.status}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {projects.filter((p:any) => p.workspaceId === ws).length === 0 && (
                            <EmptyState 
                              title="Sem Projetos" 
                              description="Nenhum projeto cadastrado no sistema." 
                              icon={FolderTree}
                            />
                        )}
                    </div>
                </Card>
            )}

            {/* MODAL DE EXCLUSÃO DE CLIENTE */}
            {showDeleteModal && clientToDelete && (
              <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95">
                  <div className="bg-red-600 text-white p-6">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/20 p-2 rounded-lg">
                        <Trash2 size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black">EXCLUSÃO PERMANENTE</h3>
                        <p className="text-sm opacity-90">Esta ação não pode ser desfeita</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    <div className="mb-6">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-xs text-gray-500 font-bold uppercase">Cliente</p>
                          <p className="font-black text-lg">{clientToDelete.name}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-xs text-gray-500 font-bold uppercase">Código</p>
                          <p className="font-black text-lg">{clientToDelete.code || 'N/A'}</p>
                        </div>
                      </div>
                      
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                        <div className="flex items-center gap-2 text-red-700 mb-2">
                          <AlertTriangle size={18} />
                          <span className="font-bold">Atenção: Esta ação irá excluir</span>
                        </div>
                        <ul className="text-sm text-red-700 space-y-1">
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                            <span><strong>{clientToDelete.projectCount} projeto(s)</strong> deste cliente</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                            <span><strong>Todas as peças</strong> associadas</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                            <span><strong>Todos os volumes</strong> gerados</span>
                          </li>
                        </ul>
                      </div>
                      
                      <div className="mb-6">
                        <label className="block text-sm font-bold text-gray-700 mb-2">
                          Para confirmar, digite o código do cliente:
                          <span className="ml-2 bg-gray-100 px-2 py-1 rounded text-xs font-mono">
                            {clientToDelete.code || clientToDelete.name}
                          </span>
                        </label>
                        <input
                          type="text"
                          value={confirmationInput}
                          onChange={(e) => setConfirmationInput(e.target.value)}
                          className="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none transition-all"
                          placeholder={`Digite "${clientToDelete.code || clientToDelete.name}"`}
                          autoFocus
                          disabled={isDeleting}
                        />
                      </div>
                    </div>
                    
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowDeleteModal(false);
                          setClientToDelete(null);
                          setConfirmationInput('');
                          setIsDeleting(false);
                        }}
                        disabled={isDeleting}
                        className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-lg font-bold hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancelar
                      </button>
                      
                      <button
                        onClick={executeClientDeletion}
                        disabled={confirmationInput !== (clientToDelete.code || clientToDelete.name) || isDeleting}
                        className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isDeleting ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Excluindo...
                          </>
                        ) : (
                          <>
                            <Trash2 size={16} />
                            Excluir Cliente
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
        </div>
    );
};
const AdminScreen = React.memo(AdminScreenComponent);

const SaidaComponent = ({ projects, pieces, warehouses, volumes, users }: SaidaProps) => {
  // ... existing logic ...
  const [selClient, setSelClient] = useState('');
  const [totalVols, setTotalVols] = useState(0);
  const [selWh, setSelWh] = useState('');
  const [scanCode, setScanCode] = useState('');
  const [lastScanMsg, setLastScanMsg] = useState<{type:'success'|'error', text:string, data?: any}|null>(null);
  const [autoScan, setAutoScan] = useState(() => localStorage.getItem('mt_auto_carga') === 'true');
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ws = getWorkspaceId();

  useEffect(() => {
    localStorage.setItem('mt_auto_carga', String(autoScan));
    inputRef.current?.focus();
  }, [autoScan]);

  const uniqueClients = useMemo(() => {
    const loadingProjects = projects.filter((p) => 
      p.workspaceId === ws && 
      (p.status === 'CARREGANDO' || p.status === 'PRODUCAO') 
    );
    const clients = new Set(loadingProjects.map((p) => formatClientDisplay(p.client_name, p.client_code)).filter(Boolean));
    return Array.from(clients).sort();
  }, [projects, ws]);

  const clientProjects = useMemo(() => {
    if (!selClient) return [];
    return projects.filter((p) => {
      const display = formatClientDisplay(p.client_name, p.client_code);
      return display === selClient && p.workspaceId === ws && (p.status === 'CARREGANDO' || p.status === 'PRODUCAO');
    });
  }, [projects, selClient, ws]);

  const clientVolumes = useMemo(() => {
    if (!selClient || clientProjects.length === 0) return [];
    const projectIds = clientProjects.map((p) => p.id);
    return volumes.filter((v) => projectIds.includes(v.projectId) && v.workspaceId === ws);
  }, [volumes, clientProjects, ws]);

  const loadedVolumes = useMemo(() => {
    return clientVolumes.filter((v) => v.loaded);
  }, [clientVolumes]);

  const pendingVolumes = useMemo(() => {
    return clientVolumes.filter((v) => !v.loaded);
  }, [clientVolumes]);

  const allPiecesProduced = useMemo(() => {
    if (!selClient || clientProjects.length === 0) return false;
    const projectNames = clientProjects.map((p) => p.project_name);
    const clientPieces = pieces.filter((p) => 
      projectNames.includes(p.projeto) && 
      p.workspaceId === ws
    );
    return clientPieces.length > 0 && clientPieces.every((p) => p.status === 'PRODUZIDA');
  }, [pieces, clientProjects, ws]);

  const handleScanVolume = useCallback(async (barcode: string) => {
    setScanCode('');
    const volume = clientVolumes.find((v) => v.barcode === barcode);
    
    if (!volume) {
      playSound("error");
      setLastScanMsg({ type: 'error', text: 'Volume não encontrado para este cliente!' });
      return;
    }

    if (volume.loaded) {
      playSound("error");
      setLastScanMsg({ type: 'error', text: 'Este volume já foi carregado!', data: volume });
      return;
    }

    const volumeRef = doc(db, 'artifacts', appId, 'public', 'data', 'volumes', volume.id);
    await updateDoc(volumeRef, {
      loaded: true,
      loadedAt: new Date().toISOString(),
      loadedBy: users.find((u)=>u.id === 'currentUser')?.login_id || 'SISTEMA'
    });

    playSound("success");
    setLastScanMsg({ type: 'success', text: `Volume ${volume.index}/${volume.total} carregado!`, data: volume });
    setTimeout(() => setLastScanMsg(null), 3000);
  }, [clientVolumes, users, ws]);

  useEffect(() => {
    if (!autoScan || !scanCode) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    
    timerRef.current = setTimeout(() => {
      if (scanCode.length > 5) handleScanVolume(scanCode);
    }, 300);
    
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [scanCode, autoScan, handleScanVolume]);

  const handleFinalizeLoad = useCallback(async () => {
    if (!selClient || clientProjects.length === 0) {
      alert("Selecione um cliente primeiro!");
      return;
    }

    if (pendingVolumes.length > 0) {
      alert(`Há ${pendingVolumes.length} volume(s) pendente(s) de carregamento!\n\nVolumes pendentes: ${pendingVolumes.map((v) => v.index).join(', ')}`);
      return;
    }

    if (!allPiecesProduced) {
      alert("Atenção: Nem todas as peças deste cliente foram produzidas!\nComplete a produção antes de finalizar a carga.");
      return;
    }

    setShowFinalizeModal(true);
  }, [selClient, clientProjects, pendingVolumes, allPiecesProduced]);

  const executeFinalizeLoad = useCallback(async () => {
    setShowFinalizeModal(false);

    try {
      const batch = writeBatch(db);
      const warehouseId = clientProjects[0]?.warehouse_id;
      
      clientProjects.forEach((p) => {
        const projectRef = doc(db, 'artifacts', appId, 'public', 'data', 'projects', p.id);
        batch.update(projectRef, { 
          status: 'ARQUIVADO',
          archivedAt: new Date().toISOString()
        });
      });

      if (warehouseId) {
        const warehouseRef = doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', warehouseId);
        batch.update(warehouseRef, { 
          status: 'LIVRE', 
          current_project_id: null 
        });
      }

      await batch.commit();
      
      setShowSuccessToast("Carga finalizada com sucesso!");
      
      setSelClient('');
      setScanCode('');
      setLastScanMsg(null);
      setTimeout(() => setShowSuccessToast(null), 3000);
      
    } catch (error) {
      console.error(error);
      alert("Erro ao finalizar carga: " + error);
    }
  }, [clientProjects, selClient]);

  const loadHistory = useMemo(() => {
    return clientVolumes
      .filter((v) => v.loaded)
      .sort((a, b) => new Date(b.loadedAt || 0).getTime() - new Date(a.loadedAt || 0).getTime())
      .slice(0, 10);
  }, [clientVolumes]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
      {showSuccessToast && <SuccessToast message={showSuccessToast} onClose={() => setShowSuccessToast(null)} />}
      
      <Card className="border-l-4 border-[#1c5052]">
        <div className="flex justify-between mb-4">
          <h2 className="font-bold text-xl text-[#1c5052] flex items-center gap-2">
            <Truck size={24} /> Controle de Carga
          </h2>
          <Tooltip text={autoScan ? "Envio automático" : "Manual (Enter)"}>
            <button onClick={() => setAutoScan(!autoScan)} className="text-xs font-bold text-gray-500 flex items-center bg-gray-100 px-3 py-1 rounded-full">
              {autoScan ? <Zap size={14} className="mr-1 fill-current text-yellow-500" /> : <Zap size={14} className="mr-1" />}
              {autoScan ? 'AUTO ON' : 'AUTO OFF'}
            </button>
          </Tooltip>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold mb-2 text-gray-700">Cliente para Carregamento</label>
          <select 
            className="w-full border p-2.5 rounded-lg bg-gray-50 focus:ring-2 focus:ring-[#348e91] outline-none transition-all"
            value={selClient}
            onChange={(e) => setSelClient(e.target.value)}
          >
            <option value="">Selecione um cliente...</option>
            {uniqueClients.map((c: string, index: number) => (
              <option key={`load_client_${c}_${index}`} value={c}>{String(c)}</option>
            ))}
          </select>
        </div>

        {selClient ? (
          <>
            <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 animate-in fade-in">
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className="text-center">
                  <div className="text-xs font-bold text-gray-500 uppercase">Projetos</div>
                  <div className="text-lg font-black text-[#1c5052]">{clientProjects.length}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-bold text-gray-500 uppercase">Volumes</div>
                  <div className="text-lg font-black text-[#1c5052]">{clientVolumes.length}</div>
                </div>
              </div>
              <div className="text-xs font-bold text-gray-500">
                Projetos: {clientProjects.map((p) => p.project_name).join(', ')}
              </div>
            </div>

            <div className="mb-6">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-bold text-gray-700">Progresso de Carga</span>
                <span className="text-sm font-bold text-[#1c5052]">
                  {loadedVolumes.length} / {clientVolumes.length} volumes
                </span>
              </div>
              <div className="w-full bg-gray-200 h-4 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{ width: `${clientVolumes.length > 0 ? (loadedVolumes.length / clientVolumes.length) * 100 : 0}%` }}
                ></div>
              </div>
              {clientVolumes.length === 0 && (
                <p className="text-xs text-gray-400 mt-1 italic">Nenhum volume gerado para este cliente</p>
              )}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleScanVolume(scanCode); }}>
              <input
                ref={inputRef}
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                className="w-full p-4 text-2xl text-center border-2 border-[#1c5052] rounded uppercase font-mono shadow-inner focus:ring-4 focus:ring-[#1c5052]/10 outline-none transition-all"
                placeholder={autoScan ? "AGUARDANDO BIP DO VOLUME..." : "DIGITE CÓDIGO DO VOLUME"}
                autoFocus
                disabled={clientVolumes.length === 0}
              />
            </form>

            {lastScanMsg && (
              <div className={`mt-4 p-4 rounded-lg text-center text-white font-bold animate-in zoom-in-95 ${
                lastScanMsg.type === 'success' ? 'bg-green-600 shadow-green-200' : 'bg-red-600 shadow-red-200'
              }`}>
                <div className="text-xl mb-1">{lastScanMsg.text}</div>
                {lastScanMsg.data && (
                  <div className="text-xs font-normal opacity-90">
                    Volume {lastScanMsg.data.index}/{lastScanMsg.data.total} • {lastScanMsg.data.barcode}
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={handleFinalizeLoad}
              className="w-full mt-6"
              disabled={pendingVolumes.length > 0 || clientVolumes.length === 0 || !allPiecesProduced}
            >
              {pendingVolumes.length > 0 ? (
                `FALTAM ${pendingVolumes.length} VOLUME(S)`
              ) : clientVolumes.length === 0 ? (
                'SEM VOLUMES PARA CARREGAR'
              ) : !allPiecesProduced ? (
                'PEÇAS PENDENTES DE PRODUÇÃO'
              ) : (
                <>
                  <CheckCircle2 size={18} className="mr-2" />
                  FINALIZAR CARGA E ARQUIVAR PROJETO(S)
                </>
              )}
            </Button>

            {!allPiecesProduced && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                <AlertTriangle size={16} className="text-yellow-600" />
                <p className="text-sm font-bold text-yellow-700">
                  Atenção: Produção de peças incompleta
                </p>
              </div>
            )}
          </>
        ) : (
          <EmptyState 
            title="Aguardando Seleção"
            description="Selecione um cliente para ver o progresso e iniciar a carga."
            icon={Truck}
          />
        )}
      </Card>

      <Card>
        <h3 className="font-bold text-[#1c5052] mb-4 flex items-center">
          <History size={18} className="mr-2 text-[#348e91]" />
          {selClient ? `Histórico de Carga - ${selClient}` : 'Histórico de Carga'}
        </h3>

        {selClient ? (
          <>
            <div className="mb-4">
              <h4 className="text-sm font-bold text-gray-700 mb-2">Volumes do Cliente</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {clientVolumes.length > 0 ? (
                  clientVolumes
                    .sort((a, b) => a.index - b.index)
                    .map((v) => (
                      <div 
                        key={`volume_${v.id}_${v.index}`}
                        className={`flex justify-between items-center p-3 rounded-lg border ${
                          v.loaded ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-gray-700">
                            Volume {v.index}/{v.total}
                          </div>
                          <div className="text-xs font-mono text-gray-500">{v.barcode}</div>
                        </div>
                        <div>
                          {v.loaded ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
                              CARREGADO
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs font-bold">
                              PENDENTE
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="text-gray-400 italic text-center py-4">Nenhum volume gerado para este cliente</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2">Carregamentos Recentes</h4>
              <div className="space-y-2">
                {loadHistory.length > 0 ? (
                  loadHistory.map((v) => (
                    <div key={`history_${v.id}_${v.loadedAt}`} className="flex items-center p-2 bg-gray-50 rounded border border-gray-100">
                      <div className="mr-3">
                        <div className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center">
                          <Truck size={14} />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-gray-700">Volume {v.index}/{v.total}</div>
                        <div className="text-xs text-gray-500">
                          {v.loadedAt ? new Date(v.loadedAt).toLocaleTimeString('pt-BR') : 'Horário não registrado'}
                        </div>
                      </div>
                      <div className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                        {v.barcode}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 italic text-center py-4">Nenhum volume carregado ainda</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <Truck size={48} className="mx-auto text-gray-200 mb-4 opacity-20" />
            <p className="text-gray-400 font-medium italic">Selecione um cliente para ver o histórico de carga</p>
          </div>
        )}
      </Card>

      {showFinalizeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95">
            <div className="bg-[#1c5052] text-white p-6">
              <h3 className="text-xl font-black flex items-center gap-2">
                <CheckCircle2 size={24} /> CONFIRMAR FINALIZAÇÃO
              </h3>
            </div>
            <div className="p-6">
              <p className="font-bold text-gray-700 mb-4">
                Deseja realmente finalizar a carga para <span className="text-[#348e91]">{selClient}</span>?
              </p>
              <ul className="text-sm text-gray-600 mb-6 space-y-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[#348e91] rounded-full"></div> {clientProjects.length} projeto(s) serão arquivados</li>
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[#348e91] rounded-full"></div> {clientVolumes.length} volume(s) processados</li>
                 <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[#348e91] rounded-full"></div> Armazém será liberado</li>
              </ul>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowFinalizeModal(false)} 
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-800 rounded-lg font-bold hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={executeFinalizeLoad} 
                  className="flex-1 px-4 py-3 bg-[#348e91] text-white rounded-lg font-bold hover:bg-[#2a7375] transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
const Saida = React.memo(SaidaComponent);

export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [view, setView] = useState<string>('login');
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const [users, setUsers] = useState<UserData[]>([]);
  const [projs, setProjs] = useState<Project[]>([]);
  const [wares, setWares] = useState<WarehouseData[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [vols, setVols] = useState<Volume[]>([]);

  // Adicionar listener de teclado global
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + F para focar na busca
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="text"][placeholder*="Buscar"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      // @ts-ignore
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
      else await signInAnonymously(auth);
    };
    initAuth();
    return onAuthStateChanged(auth, setFbUser);
  }, []);
  
  // --- SEGURANÇA: VERIFICAÇÃO DE SESSÃO ---
  useEffect(() => {
    if (user && users.length > 0) {
      // Verificar se o usuário ainda existe e se a role corresponde
      const dbUser = users.find(u => u.id === user.id);
      if (!dbUser) {
        setUser(null); // Desloga se o usuário foi removido
        alert("Sessão inválida: Usuário não encontrado.");
      } else if (dbUser.role !== user.role) {
        // Atualiza a role se mudou no banco (ex: downgrade de MASTER para SECONDARY)
        setUser(dbUser); 
      }
    }
  }, [user, users]);

  useEffect(() => {
    if(!fbUser) return;
    
    // Simular carregamento inicial para mostrar skeletons
    setLoadingData(true);
    const timer = setTimeout(() => setLoadingData(false), 1500);

    const ws = getWorkspaceId();

    const qUsers = firebaseQuery(
      collection(db, 'artifacts', appId, 'public', 'data', 'users'),
      where('workspaceId', '==', ws)
    );

    const qProjs = firebaseQuery(
      collection(db, 'artifacts', appId, 'public', 'data', 'projects'),
      where('workspaceId', '==', ws)
    );

    const qWares = firebaseQuery(
      collection(db, 'artifacts', appId, 'public', 'data', 'warehouses'),
      where('workspaceId', '==', ws)
    );

    const qPieces = firebaseQuery(
      collection(db, 'artifacts', appId, 'public', 'data', 'pieces'),
      where('workspaceId', '==', ws)
    );

    const qVols = firebaseQuery(
      collection(db, 'artifacts', appId, 'public', 'data', 'volumes'),
      where('workspaceId', '==', ws)
    );

    const u1 = onSnapshot(qUsers, s=>setUsers(s.docs.map(d=>d.data() as UserData)));
    const u2 = onSnapshot(qProjs, s=>setProjs(s.docs.map(d=>d.data() as Project)));
    const u3 = onSnapshot(qWares, s=>setWares(s.docs.map(d=>d.data() as WarehouseData)));
    const u4 = onSnapshot(qPieces, s=>setPieces(s.docs.map(d=>d.data() as Piece)));
    const u5 = onSnapshot(qVols, s=>setVols(s.docs.map(d=>d.data() as Volume)));
    
    return () => { clearTimeout(timer); u1(); u2(); u3(); u4(); u5(); };
  }, [fbUser]);

  const Login = () => {
    const [id, setId] = useState('');
    const [pass, setPass] = useState('');
    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      
      // --- SEGURANÇA: SANITIZAÇÃO DE INPUTS ---
      const sanitizedId = sanitizeInput(id);
      const sanitizedPass = sanitizeInput(pass);
      
      const ws = getWorkspaceId();
      if(users.length === 0) { 
        const m: UserData = { id:'master', workspaceId: ws, login_id: sanitizedId, password: sanitizedPass, role:'MASTER', auth_password_override:'1234' };
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', 'master'), m);
        alert("Conta MASTER criada!"); return;
      }
      const found: any = users.find((x) => x.login_id.toLowerCase() === sanitizedId.toLowerCase() && x.password === sanitizedPass);
      if(found) { setUser(found); setView('dashboard'); }
      else alert("Acesso Negado.");
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f2f2f2] p-4">
        <Card className="w-full max-w-sm shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-[#1c5052] tracking-tighter">MARCENARIA<br/><span className="text-[#348e91]">TRACK</span></h1>
            <p className="text-[10px] text-gray-400 font-bold mt-2 tracking-widest uppercase">Intelligent Workflow Management</p>
          </div>
          <form onSubmit={handleLogin}>
            <Input label="ID de Acesso" value={id} onChange={(e:any)=>setId(e.target.value)} autoFocus />
            <Input label="Senha" type="password" value={pass} onChange={(e:any)=>setPass(e.target.value)} />
            <Button type="submit" className="w-full mt-6 h-12">
              {users.length===0 ? "Configurar Primeiro Admin" : "Acessar Sistema"}
            </Button>
          </form>
        </Card>
      </div>
    );
  };

  if(!user) return <Login />;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#f2f2f2] font-sans text-[#213635]">
      <aside className="w-full md:w-64 bg-[#0a0c0d] text-white flex flex-col shadow-2xl z-20">
        <div className="p-6 border-b border-gray-800 text-center">
          <h1 className="text-xl font-black mb-1">MARCENARIA<br/><span className="text-[#348e91]">TRACK</span></h1>
          <div className="text-[10px] text-gray-500 uppercase font-bold flex items-center justify-center gap-1 mt-2">
             <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div> {user.login_id}
          </div>
        </div>
        <nav className="flex-1 py-6 overflow-y-auto">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'producao', label: 'Produção', icon: QrCode },
            { id: 'expedicao', label: 'Expedição', icon: Printer },
            { id: 'saida', label: 'Saída / Carga', icon: Truck },
            ...(user.role==='MASTER'?[{id:'admin',label:'Administração',icon:Settings}]:[])
          ].map(i => (
            <button key={i.id} onClick={()=>setView(i.id)} className={`w-full flex items-center px-6 py-4 border-l-4 transition-all duration-200 group ${view===i.id?'border-[#348e91] bg-[#1c5052] text-white':'border-transparent hover:bg-[#1c5052]/50 text-gray-400'}`}>
              <i.icon size={20} className={`mr-3 transition-transform group-hover:scale-110 ${view===i.id ? 'text-[#348e91]' : ''}`}/> {i.label}
            </button>
          ))}
        </nav>
        {/* --- SEGURANÇA: LOGOUT LIMPA DADOS SENSÍVEIS --- */}
        <button onClick={()=>{ clearSensitiveData(); setUser(null); }} className="p-6 flex items-center justify-center text-gray-500 hover:text-red-400 border-t border-gray-800 transition-colors"><LogOut size={18} className="mr-2"/> Sair</button>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-10">
        <div className="max-w-5xl mx-auto">
          {view === 'dashboard' && <DashboardComponent projects={projs} pieces={pieces} warehouses={wares} volumes={vols} loading={loadingData} />}
          
          {/* --- SEGURANÇA: PROTEÇÃO DE ROTA ADMIN --- */}
          {view === 'admin' && (
            user.role === 'MASTER' ? (
                <AdminScreen users={users} warehouses={wares} projects={projs} pieces={pieces} volumes={vols} currentUser={user} />
            ) : (
                <div className="text-center p-10 bg-white rounded-lg shadow-sm">
                    <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
                    <h2 className="text-xl font-bold text-red-600">Acesso Negado</h2>
                    <p className="text-gray-600 mb-6">Você não tem permissão para acessar esta área.</p>
                    <Button onClick={() => setView('dashboard')}>Voltar ao Dashboard</Button>
                </div>
            )
          )}
          
          {view === 'producao' && <ProducaoComponent pieces={pieces} currentUser={user} loading={loadingData} />}
          {view === 'expedicao' && <ExpedicaoComponent projects={projs} pieces={pieces} warehouses={wares} volumes={vols} users={users} />}
          {view === 'saida' && <SaidaComponent projects={projs} pieces={pieces} warehouses={wares} volumes={vols} users={users} />}
        </div>
      </main>
    </div>
  );
}