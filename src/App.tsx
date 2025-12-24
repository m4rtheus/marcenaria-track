// @ts-ignore
const firebaseConfig = JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG || '{}');
// @ts-ignore
const appId = process.env.REACT_APP_APP_ID || '';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously, 
  signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  query, 
  updateDoc, 
  onSnapshot, 
  writeBatch,
  deleteDoc,
  setDoc,
  getDoc,
  arrayUnion
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
  XCircle,
  LayoutDashboard,
  Clock,
  FolderTree 
} from 'lucide-react';

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

// --- COMPONENTES DE UI ---

const Card = ({ children, className = '' }: any) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-5 ${className}`}>{children}</div>
);

const Button = ({ onClick, children, variant = 'primary', className = '', disabled = false, type = 'button' }: any) => {
  const base = "px-4 py-2 rounded-lg font-bold transition-all focus:outline-none flex items-center justify-center shadow-sm text-sm";
  const variants: any = {
    primary: "bg-[#348e91] text-white hover:bg-[#2a7375] disabled:bg-gray-300 disabled:cursor-not-allowed",
    secondary: "bg-[#1c5052] text-white hover:bg-[#13393a] disabled:bg-gray-300 disabled:cursor-not-allowed",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
    outline: "border-2 border-[#348e91] text-[#348e91] hover:bg-[#f0f9fa]"
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Input = ({ label, ...props }: any) => (
  <div className="mb-3">
    {label && <label className="block text-xs font-bold text-[#213635] mb-1 uppercase tracking-wide">{label}</label>}
    <input {...props} className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:border-[#348e91] focus:ring-2 focus:ring-[#348e91] outline-none transition-all" />
  </div>
);

// --- ESTILO DE IMPRESSÃO COMPARTILHADO ---
const PRINT_CSS = `
  @page { size: A4; margin: 0; }
  body { margin: 0; padding: 0; font-family: sans-serif; }
  .sheet { 
    width: 210mm; 
    height: 297mm; 
    display: grid; 
    grid-template-columns: 105mm 105mm; 
    grid-template-rows: repeat(9, 33mm); 
    page-break-after: always;
  }
  .label { 
    width: 105mm; 
    height: 33mm; 
    padding: 3mm 5mm; 
    box-sizing: border-box; 
    border: 0.1mm solid #eee;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .label-header { font-size: 8pt; color: #555; border-bottom: 0.2mm solid #000; padding-bottom: 1mm; margin-bottom: 1mm; display: flex; justify-content: space-between; font-weight: bold; }
  .label-title { font-size: 14pt; font-weight: 900; text-align: center; flex-grow: 1; display: flex; align-items: center; justify-content: center; text-transform: uppercase; }
  .label-barcode { font-family: 'Libre Barcode 39 Text', cursive; font-size: 32pt; text-align: center; margin-top: -2mm; }
  .label-footer { font-size: 8pt; text-align: right; font-weight: bold; }
  @media print { .label { border: none; } }
`;

// --- TELAS ---

const Dashboard = ({ projects, pieces, warehouses }: any) => {
  const wsId = getWorkspaceId();
  const activeProjects = projects.filter((p: any) => p.status !== 'ARQUIVADO' && p.workspaceId === wsId);
  const piecesTodayCount = pieces.filter((p: any) => p.workspaceId === wsId && p.status === 'PRODUZIDA' && p.producedAt?.startsWith(new Date().toISOString().slice(0,10))).length;
  const freeWhCount = warehouses.filter((w: any) => w.workspaceId === wsId && w.status === 'LIVRE').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[#1c5052] flex items-center gap-2">
          <LayoutDashboard className="text-[#348e91]" /> Panorama Geral
        </h2>
        <div className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
          {new Date().toLocaleDateString('pt-BR')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-[#348e91] bg-gradient-to-br from-white to-[#f0f9fa]">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Projetos Ativos</p>
          <div className="flex items-end justify-between">
            <p className="text-4xl font-black text-[#213635]">{activeProjects.length}</p>
            <FolderTree className="text-[#348e91] opacity-20 w-10 h-10" />
          </div>
        </Card>
        <Card className="border-l-4 border-[#1c5052] bg-gradient-to-br from-white to-gray-50">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Peças Produzidas Hoje</p>
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
      </div>

      <Card>
        <h3 className="font-bold text-[#1c5052] mb-6 flex items-center gap-2">
          <Activity size={20} className="text-[#348e91]" /> Progresso da Produção
        </h3>
        <div className="space-y-6">
          {activeProjects.length > 0 ? (
            activeProjects.map((p: any) => {
              const projectPieces = pieces.filter((pc: any) => pc.workspaceId === wsId && pc.projeto === p.project_name);
              const total = projectPieces.length;
              const scanned = projectPieces.filter((pc: any) => pc.status === 'PRODUZIDA').length;
              const progress = total > 0 ? Math.round((scanned / total) * 100) : 0;

              return (
                <div key={p.id} className="group">
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <h4 className="font-bold text-[#213635] group-hover:text-[#348e91] transition-colors">{String(p.project_name)}</h4>
                      <p className="text-xs text-gray-500">{String(p.client_name)}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase mr-2 ${
                        p.status === 'PRODUCAO' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                      }`}>
                        {String(p.status)}
                      </span>
                      <span className="text-sm font-black text-[#1c5052]">{progress}%</span>
                    </div>
                  </div>
                  
                  <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden shadow-inner border border-gray-50">
                    <div 
                      className={`h-full transition-all duration-1000 ease-out ${
                        progress === 100 ? 'bg-green-500' : 'bg-[#348e91]'
                      }`}
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  
                  <div className="flex justify-between mt-1 px-1">
                    <div className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                      <Clock size={10} /> Criado em {new Date(p.created_at).toLocaleDateString('pt-BR')}
                    </div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                      {scanned} de {total} peças bipadas
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center">
              <Package size={48} className="mx-auto text-gray-200 mb-4" />
              <p className="text-gray-400 font-medium italic">Nenhum projeto ativo para monitorar no momento.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

const Producao = ({ pieces, currentUser }: any) => {
  const [code, setCode] = useState('');
  const [autoScan, setAutoScan] = useState(() => localStorage.getItem('mt_auto') === 'true');
  const [lastMsg, setLastMsg] = useState<{type:'success'|'error', text:string, data?: any}|null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<any>(null);
  const ws = getWorkspaceId();

  useEffect(() => { localStorage.setItem('mt_auto', String(autoScan)); inputRef.current?.focus(); }, [autoScan]);

  const history = useMemo(() => {
    return pieces.filter((p: any) => p.workspaceId === ws && p.status === 'PRODUZIDA' && p.producedAt)
      .sort((a: any, b: any) => new Date(b.producedAt).getTime() - new Date(a.producedAt).getTime())
      .slice(0, 10);
  }, [pieces, ws]);

  const handleScan = async (barcode: string) => {
    setCode('');
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'pieces', `${ws}_${barcode}`);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      playSound("error");
      setLastMsg({ type: 'error', text: 'Peça não encontrada no sistema.' });
      return;
    }

    const piece = snap.data();
    if (piece.status === "PRODUZIDA") {
      playSound("error");
      setLastMsg({ type: 'error', text: 'Está peça já foi bipada!', data: piece });
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
  };

  useEffect(() => {
    if(!autoScan || !code) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { if(code.length > 5) handleScan(code); }, 300);
    return () => clearTimeout(timerRef.current);
  }, [code, autoScan]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
      <Card className="border-l-4 border-[#348e91]">
        <div className="flex justify-between mb-4">
          <h2 className="font-bold text-xl text-[#1c5052]">Controle de Produção</h2>
          <button onClick={()=>setAutoScan(!autoScan)} className="text-xs font-bold text-gray-500 flex items-center">
            {autoScan ? <Zap size={14} className="mr-1 fill-current text-yellow-500" /> : <Zap size={14} className="mr-1" />}
            {autoScan ? 'AUTO ON' : 'AUTO OFF'}
          </button>
        </div>
        <form onSubmit={(e)=>{e.preventDefault(); handleScan(code);}}>
          <input 
            ref={inputRef}
            value={code}
            onChange={(e)=>setCode(e.target.value)}
            className="w-full p-4 text-2xl text-center border-2 border-[#348e91] rounded uppercase font-mono shadow-inner focus:ring-4 focus:ring-[#348e91]/10 outline-none"
            placeholder={autoScan ? "AGUARDANDO BIP..." : "DIGITE E ENTER"}
            autoFocus
          />
        </form>
        {lastMsg && (
          <div className={`mt-4 p-4 rounded-lg text-center text-white font-bold animate-in zoom-in-95 ${lastMsg.type === 'success' ? 'bg-green-600 shadow-green-200 shadow-lg' : 'bg-red-600 shadow-red-200 shadow-lg'}`}>
            <div className="text-xl mb-1">{lastMsg.text}</div>
            {lastMsg.data && <div className="text-xs font-normal opacity-90">{String(lastMsg.data.modulo)} • {String(lastMsg.data.medidas)}</div>}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-bold text-[#1c5052] mb-3 flex items-center"><History size={18} className="mr-2 text-[#348e91]"/> Histórico Recente</h3>
        <div className="overflow-y-auto max-h-80 pr-2 custom-scrollbar">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="text-gray-400 border-b bg-gray-50/50 sticky top-0">
              <tr>
                <th className="py-2 px-2 uppercase tracking-tighter">Hora</th>
                <th className="py-2 px-2 uppercase tracking-tighter">Peça</th>
                <th className="py-2 px-2 uppercase tracking-tighter text-right">Módulo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((p:any) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-2 text-gray-400">{new Date(p.producedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
                  <td className="py-3 px-2 font-bold text-gray-700">{String(p.nome)}</td>
                  <td className="py-3 px-2 text-[#348e91] font-black text-right">{String(p.modulo)}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-gray-400 italic">Nenhuma peça produzida hoje.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const Expedicao = ({ projects, pieces, warehouses, volumes, users }: any) => {
  const [selProj, setSelProj] = useState('');
  const [totalVols, setTotalVols] = useState(0);
  const [selWh, setSelWh] = useState('');
  const ws = getWorkspaceId();

  const proj = useMemo(() => projects.find((p:any) => p.id === selProj), [projects, selProj]);
  const projPecas = useMemo(() => pieces.filter((p:any) => p.workspaceId === ws && p.projeto === (proj?.project_name || '')), [pieces, ws, proj]);
  const actualProdComplete = useMemo(() => projPecas.length > 0 && projPecas.every((p:any) => p.status === 'PRODUZIDA'), [projPecas]);
  const projVols = useMemo(() => volumes.filter((v:any) => v.workspaceId === ws && v.projectId === selProj), [volumes, ws, selProj]);

  const handleGenerate = async () => {
    if(!selWh) return alert("Selecione um Armazém!");
    if(totalVols <= 0) return alert("Informe a quantidade de volumes.");
    if(!actualProdComplete) return alert("A produção ainda não foi concluída para este projeto.");
    
    const wh = warehouses.find((w:any) => w.id === selWh);
    if(wh?.status === 'OCUPADO' && wh.current_project_id !== selProj) return alert("Este armazém está ocupado por outro projeto!");

    if(projVols.length > 0) {
      const master = users.find((u:any)=>u.role==='MASTER');
      const pass = prompt("Projeto já tem volumes gerados. Digite a Senha Master para excluir e refazer:");
      if(pass !== master?.auth_password_override) return alert("Senha de Autorização Incorreta.");
      
      const batchDel = writeBatch(db);
      projVols.forEach((v:any)=>batchDel.delete(doc(db, 'artifacts', appId, 'public', 'data', 'volumes', v.id)));
      await batchDel.commit();
    }

    const batch = writeBatch(db);
    for(let i=1; i<=totalVols; i++) {
      const vid = `${ws}_${selProj}_VOL_${i}`;
      // Padrão solicitado: Nome_do_Projeto_V{i}
      const barcodeValue = `${proj.id}_V${i}`;
      
      batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'volumes', vid), {
        id: vid,
        workspaceId: ws,
        projectId: selProj,
        index: i,
        total: totalVols,
        loaded: false,
        barcode: barcodeValue
      });
    }

    if(wh) batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', selWh), { status: 'OCUPADO', current_project_id: selProj });
    batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'projects', selProj), { status: 'CARREGANDO', warehouse_id: selWh });
    
    await batch.commit();
    alert("Volumes gerados com sucesso!");
  };

  const printModuleLabels = () => {
    const win = window.open('','','width=800,height=600');
    if(!win || !proj) return;
    
    const modules = Array.from(new Set(projPecas.map((p: any) => p.modulo))).sort();
    
    // Organizar em folhas de 18 etiquetas (2x9)
    const chunkSize = 18;
    const pages = [];
    for (let i = 0; i < modules.length; i += chunkSize) {
      pages.push(modules.slice(i, i + chunkSize));
    }

    const html = pages.map(page => `
      <div class="sheet">
        ${page.map(m => `
          <div class="label">
            <div class="label-header">
              <span>CLIENTE: ${proj.client_name.substring(0,25)}</span>
              <span>PROJETO: ${proj.project_name.substring(0,15)}</span>
            </div>
            <div class="label-title" style="font-size: 20pt;">${m}</div>
            <div class="label-footer">ETIQUETA DE MÓDULO</div>
          </div>
        `).join('')}
      </div>
    `).join('');

    win.document.write(`
      <html>
        <head><style>${PRINT_CSS}</style></head>
        <body>${html}<script>window.print()</script></body>
      </html>
    `);
    win.document.close();
  };

  const printVolumes = () => {
    const win = window.open('','','width=800,height=600');
    if(!win || !proj) return;
    const sorted = [...projVols].sort((a:any,b:any)=>a.index - b.index);
    
    const chunkSize = 18;
    const pages = [];
    for (let i = 0; i < sorted.length; i += chunkSize) {
      pages.push(sorted.slice(i, i + chunkSize));
    }

    const html = pages.map(page => `
      <div class="sheet">
        ${page.map(v => `
          <div class="label">
            <div class="label-header">
              <span>CLIENTE: ${proj.client_name.substring(0,25)}</span>
              <span>PROJETO: ${proj.project_name.substring(0,15)}</span>
            </div>
            <div style="font-size: 10pt; font-weight: bold; text-align: center;">VOLUME ${v.index} DE ${v.total}</div>
            <div class="label-barcode">*${v.barcode}*</div>
            <div class="label-footer">${v.barcode}</div>
          </div>
        `).join('')}
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
  };

  return (
    <Card>
      <h2 className="text-xl font-bold text-[#1c5052] mb-4">Gestão de Etiquetas e Volumes</h2>
      <div className="mb-6">
        <label className="block text-sm font-bold mb-1 text-gray-700">Selecione o Projeto</label>
        <select className="w-full border p-2 rounded-lg bg-gray-50 focus:ring-2 focus:ring-[#348e91] outline-none" value={selProj} onChange={(e)=>setSelProj(e.target.value)}>
          <option value="">Selecione...</option>
          {projects.filter((p:any)=>p.status!=='ARQUIVADO' && p.workspaceId === ws).map((p:any)=><option key={p.id} value={p.id}>{String(p.project_name)}</option>)}
        </select>
      </div>

      {selProj && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-2">
          <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-[#348e91] mb-2 flex items-center"><FileText size={18} className="mr-2"/> Etiquetas de Módulo</h3>
              <p className="text-xs mb-4 text-gray-500 italic">Folha A4 (2x9). Imprime após 100% bipado.</p>
              <div className="text-[10px] font-bold mb-2">
                Status Produção: {actualProdComplete ? <span className="text-green-600">CONCLUÍDO</span> : <span className="text-red-500">PENDENTE</span>}
              </div>
            </div>
            <Button onClick={printModuleLabels} variant="outline" className="w-full" disabled={!actualProdComplete}>Imprimir Etiquetas Módulo</Button>
          </div>
          <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
            <h3 className="font-bold text-[#348e91] mb-4 flex items-center"><Package size={18} className="mr-2"/> Etiquetas de Volume</h3>
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-500 uppercase">Armazém Destino</label>
              <select className="w-full border p-2 rounded-lg text-sm bg-white" value={selWh} onChange={(e)=>setSelWh(e.target.value)} disabled={projVols.length > 0 || !actualProdComplete}>
                <option value="">Selecione...</option>
                {warehouses.filter((w:any)=>w.workspaceId === ws).map((w:any)=><option key={w.id} value={w.id} disabled={w.status==='OCUPADO' && w.current_project_id !== selProj}>{String(w.name)} ({String(w.status)})</option>)}
              </select>
            </div>
            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 uppercase">Qtd. Volumes</label>
                <input type="number" className="w-full border p-2 rounded-lg bg-white" value={totalVols} onChange={(e:any)=>setTotalVols(Number(e.target.value))} disabled={!actualProdComplete} />
              </div>
              <Button onClick={handleGenerate} className="mt-4" disabled={!actualProdComplete}>Gerar</Button>
            </div>
            
            {!actualProdComplete && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 mb-4">
                <AlertTriangle size={14} className="text-red-500" />
                <p className="text-[10px] text-red-700 font-bold uppercase">Produção pendente para gerar volumes.</p>
              </div>
            )}

            {projVols.length > 0 && <Button onClick={printVolumes} className="w-full"><Printer size={16} className="mr-2"/> Imprimir {projVols.length} Etiquetas</Button>}
          </div>
        </div>
      )}
    </Card>
  );
};

const Saida = ({ projects, volumes }: any) => {
  const [selProj, setSelProj] = useState('');
  const [code, setCode] = useState('');
  const [autoScan, setAutoScan] = useState(() => localStorage.getItem('mt_auto_saida') === 'true');
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<any>(null);
  const ws = getWorkspaceId();

  const projVols = useMemo(() => volumes.filter((v:any) => v.projectId === selProj && v.workspaceId === ws), [volumes, selProj, ws]);
  const loadedCount = projVols.filter((v:any) => v.loaded).length;
  const progress = projVols.length > 0 ? Math.round((loadedCount / projVols.length) * 100) : 0;

  useEffect(() => { localStorage.setItem('mt_auto_saida', String(autoScan)); inputRef.current?.focus(); }, [autoScan, selProj]);

  const handleScan = async (barcode: string) => {
    const clean = barcode.replace(/\*/g, '');
    setCode('');
    
    const vol = projVols.find((v:any) => v.barcode === clean);
    if (!vol) {
      playSound("error");
      return alert("Este volume não pertence ao projeto selecionado!");
    }
    if (vol.loaded) {
      playSound("error");
      return alert("Volume já foi carregado anteriormente.");
    }

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'volumes', vol.id), {
      loaded: true,
      loadedAt: new Date().toISOString()
    });
    playSound("success");
  };

  useEffect(() => {
    if(!autoScan || !code) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { if(code.length > 5) handleScan(code); }, 300);
    return () => clearTimeout(timerRef.current);
  }, [code, autoScan]);

  const handleFinalize = async () => {
    if (loadedCount < projVols.length) {
      playSound("error");
      return alert(`Faltam ${projVols.length - loadedCount} volumes para carregar!`);
    }
    
    const batch = writeBatch(db);
    batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'projects', selProj), { status: 'ARQUIVADO' });
    
    const projData = projects.find((p:any)=>p.id === selProj);
    if(projData?.warehouse_id) {
        batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', projData.warehouse_id), { status: 'LIVRE', current_project_id: '' });
    }

    await batch.commit();
    alert("Projeto Finalizado e Arquivado!");
    setSelProj('');
  };

  return (
    <div className="space-y-6">
      <Card className="bg-[#1c5052] text-white shadow-xl">
        <h2 className="text-xl font-bold flex items-center mb-4 gap-2"><Truck className="text-[#348e91]"/> Expedição / Carregamento</h2>
        <label className="block text-[10px] font-black uppercase opacity-60 mb-1">Selecione o Projeto para Carga</label>
        <select className="w-full p-3 rounded-lg text-black font-bold shadow-sm" value={selProj} onChange={(e)=>setSelProj(e.target.value)}>
          <option value="">Aguardando seleção de projeto...</option>
          {projects.filter((p:any)=>p.status==='CARREGANDO' && p.workspaceId === ws).map((p:any)=><option key={p.id} value={p.id}>{String(p.project_name)}</option>)}
        </select>
      </Card>

      {selProj && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <Card className="border-2 border-[#348e91] bg-[#f0f9fa]">
            <div className="flex justify-between items-center mb-2">
              <span className="font-black text-[#1c5052] uppercase text-xs">Leitura de Código de Barras</span>
              <button onClick={()=>setAutoScan(!autoScan)} className="text-xs font-bold text-gray-500 flex items-center gap-1">
                {autoScan ? <Zap size={12} className="fill-current text-yellow-500" /> : <Zap size={12} />}
                {autoScan?'AUTO ON':'MANUAL'}
              </button>
            </div>
            <form onSubmit={(e)=>{e.preventDefault(); handleScan(code);}}>
              <input 
                ref={inputRef}
                value={code}
                onChange={(e)=>setCode(e.target.value)}
                className="w-full p-4 text-3xl text-center rounded-xl border-2 border-[#348e91] shadow-inner font-mono bg-white outline-none focus:ring-4 focus:ring-[#348e91]/20"
                placeholder="BIPE O VOLUME"
                autoFocus
              />
            </form>
          </Card>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <span className="font-black text-2xl text-[#213635]">{loadedCount} / {projVols.length}</span>
                <span className="text-gray-400 text-xs ml-2 uppercase font-bold tracking-tighter">Volumes Carregados</span>
              </div>
              <Button onClick={handleFinalize} variant={progress === 100 ? 'primary' : 'secondary'} className="px-8">Finalizar Projeto</Button>
            </div>
            <div className="w-full bg-gray-100 h-8 rounded-full overflow-hidden relative shadow-inner border border-gray-50">
              <div className="bg-[#348e91] h-full transition-all duration-700 ease-out" style={{width: `${progress}%`}}></div>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-white drop-shadow-sm">{progress}%</span>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {projVols.sort((a:any,b:any)=>a.index-b.index).map((v:any) => (
              <div key={v.id} className={`p-4 rounded-xl border-2 text-center transition-all ${v.loaded ? 'bg-green-50 border-green-500 text-green-700 scale-105 shadow-md' : 'bg-white border-gray-100 opacity-60 text-gray-400'}`}>
                <div className="text-[10px] font-black opacity-70">VOL</div>
                <div className="text-2xl font-black leading-none">{v.index}</div>
                <div className="text-[8px] mt-1 font-black uppercase tracking-tighter">{v.loaded ? 'CARREGADO' : 'PENDENTE'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AdminScreen = ({ users, warehouses, projects, pieces, currentUser }: any) => {
    const [tab, setTab] = useState<'users' | 'warehouses' | 'projects' | 'import'>('users');
    const [login, setLogin] = useState('');
    const [pass, setPass] = useState('');
    const [whName, setWhName] = useState('');
    
    const [pecasFile, setPecasFile] = useState<File | null>(null);
    const [matFile, setMatFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [importStatus, setImportStatus] = useState<{type:'success'|'error'|null, message:string}>({type: null, message: ''});

    const ws = getWorkspaceId();

    const saveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!login || !pass) return;
        const uid = `u_${Date.now()}`;
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', `${ws}_${uid}`), {
            id: `${ws}_${uid}`, workspaceId: ws, login_id: login, password: pass, role: 'SECONDARY'
        });
        setLogin(''); setPass('');
        alert("Usuário criado!");
    };

    const saveWh = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!whName) return;
        const wid = `wh_${Date.now()}`;
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', `${ws}_${wid}`), {
            id: `${ws}_${wid}`, workspaceId: ws, name: whName, status: 'LIVRE'
        });
        setWhName('');
        alert("Armazém criado!");
    };

    const deleteProject = async (projId: string) => {
        if (!window.confirm("ATENÇÃO: Isso excluirá o projeto permanentemente. Confirmar?")) return;
        const batch = writeBatch(db);
        pieces.filter((p:any)=>p.projeto === projId.replace(/_/g, ' ')).forEach((p:any)=>{
            batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'pieces', p.id));
        });
        batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'projects', projId));
        await batch.commit();
        alert("Projeto excluído.");
    };

    const processImport = () => {
        setImportStatus({type: null, message: ''});
        if(!pecasFile || !matFile) {
            setImportStatus({
                type: 'error', 
                message: 'Atenção: Você possui arquivos pendentes. Selecione ambos os arquivos.'
            });
            playSound("error");
            return;
        }
        setLoading(true);

        const reader1 = new FileReader();
        reader1.onload = (e1) => {
            const lines1 = (e1.target?.result as string).split('\n');
            const tempPecas: any[] = [];
            let projName = "";
            let clientName = "";

            for(let i=1; i<lines1.length; i++) {
                const cols = lines1[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                if(cols.length < 11) continue;
                const code = cols[11]?.replace(/"/g, '').trim();
                if(code) {
                    if(!projName) projName = cols[8]?.replace(/"/g, '').trim();
                    if(!clientName) clientName = cols[13]?.replace(/"/g, '').trim();
                    tempPecas.push({
                        id: `${ws}_${code}`,
                        workspaceId: ws,
                        nome: cols[3]?.replace(/"/g, '').trim(),
                        modulo: cols[2]?.replace(/"/g, '').trim(),
                        projeto: projName,
                        cliente: clientName,
                        medidas: `${cols[4]}x${cols[5]}x${cols[6]}`,
                        material: cols[9]?.replace(/"/g, '').trim(),
                        cor: cols[10]?.replace(/"/g, '').trim(),
                        status: 'PENDENTE'
                    });
                }
            }

            const reader2 = new FileReader();
            reader2.onload = async (e2) => {
                const lines2 = (e2.target?.result as string).split('\n');
                const dimMap: Record<string,string> = {};
                const regex = /^(.*?)\s*\(Size:([\d\.\*]+)/;
                for(let l of lines2) {
                    const cols = l.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                    for(let c of cols) {
                        const clean = c.replace(/"/g, '').trim();
                        const m = clean.match(regex);
                        if(m) dimMap[m[1].trim()] = m[2].trim();
                    }
                }

                const projId = projName.replace(/\s+/g, '_').toUpperCase();
                const batch = writeBatch(db);
                batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'projects', projId), {
                    id: projId, workspaceId: ws, project_name: projName, client_name: clientName, status: 'PRODUCAO', created_at: new Date().toISOString(), module_dimensions: dimMap
                });
                tempPecas.forEach(p => batch.set(doc(db, 'artifacts', appId, 'public', 'data', 'pieces', p.id), p));
                await batch.commit();
                
                setLoading(false);
                setImportStatus({type: 'success', message: 'Projeto importado com sucesso!'});
                playSound("success");
                setPecasFile(null); setMatFile(null);
                setTimeout(() => setImportStatus({type: null, message: ''}), 5000);
            };
            reader2.readAsText(matFile!);
        };
        reader1.readAsText(pecasFile!);
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-2 border-b border-gray-300 pb-2 overflow-x-auto no-scrollbar">
                <button onClick={()=>setTab('users')} className={`px-4 py-2 font-bold whitespace-nowrap ${tab==='users'?'text-[#348e91] border-b-2 border-[#348e91]':'text-gray-400'}`}>Usuários</button>
                <button onClick={()=>setTab('warehouses')} className={`px-4 py-2 font-bold whitespace-nowrap ${tab==='warehouses'?'text-[#348e91] border-b-2 border-[#348e91]':'text-gray-400'}`}>Armazéns</button>
                <button onClick={()=>setTab('projects')} className={`px-4 py-2 font-bold whitespace-nowrap ${tab==='projects'?'text-[#348e91] border-b-2 border-[#348e91]':'text-gray-400'}`}>Gerir Projetos</button>
                <button onClick={()=>setTab('import')} className={`px-4 py-2 font-bold whitespace-nowrap ${tab==='import'?'text-[#348e91] border-b-2 border-[#348e91]':'text-gray-400'}`}>Importar CSV</button>
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
                        <h3 className="font-bold text-[#1c5052] mb-4">Usuários Ativos</h3>
                        {users.filter((u:any)=>u.role!=='MASTER' && u.workspaceId === ws).map((u:any)=>(
                            <div key={u.id} className="flex justify-between items-center p-3 border-b">
                                <span>{String(u.login_id)}</span>
                                <button onClick={()=>deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id))} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={16}/></button>
                            </div>
                        ))}
                    </Card>
                </div>
            )}

            {tab === 'import' && (
                <Card>
                    <h3 className="font-bold text-[#1c5052] mb-4">Importação de Projeto</h3>
                    {importStatus.type && (
                        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 border animate-in slide-in-from-top-2 ${
                            importStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                        }`}>
                            {importStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5"/> : <XCircle className="w-5 h-5"/>}
                            <span className="font-bold">{importStatus.message}</span>
                        </div>
                    )}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold mb-2">1. Planilha de Etiquetas (Peças)</label>
                            <input type="file" accept=".csv" onChange={(e:any)=>setPecasFile(e.target.files[0])} className="block w-full text-xs text-gray-500 file:bg-[#348e91] file:text-white file:py-2 file:px-4 file:rounded-lg file:border-0" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-2">2. Lista de Medidas (Material)</label>
                            <input type="file" accept=".csv" onChange={(e:any)=>setMatFile(e.target.files[0])} className="block w-full text-xs text-gray-500 file:bg-[#1c5052] file:text-white file:py-2 file:px-4 file:rounded-lg file:border-0" />
                        </div>
                        <Button onClick={processImport} className="w-full mt-4" disabled={loading}>
                            {loading ? "Processando..." : "Confirmar Importação"}
                        </Button>
                    </div>
                </Card>
            )}

            {tab === 'projects' && (
                <Card>
                    <h3 className="font-bold text-[#1c5052] mb-4">Gerenciar Projetos</h3>
                    <div className="space-y-2">
                        {projects.filter((p:any)=>p.workspaceId === ws).map((p:any)=>(
                            <div key={p.id} className="flex justify-between items-center p-3 border rounded-lg bg-gray-50">
                                <div>
                                    <div className="font-bold">{String(p.project_name)}</div>
                                    <div className="text-xs text-gray-500 uppercase font-bold text-[#348e91]">{String(p.status)}</div>
                                </div>
                                <button onClick={()=>deleteProject(p.id)} className="p-2 text-red-600 hover:bg-red-50 rounded"><Trash2 size={18}/></button>
                            </div>
                        ))}
                    </div>
                </Card>
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
                        <h3 className="font-bold text-[#1c5052] mb-4">Lista de Armazéns</h3>
                        {warehouses.filter((w:any)=>w.workspaceId === ws).map((w:any)=>(
                            <div key={w.id} className="flex justify-between items-center p-3 border-b">
                                <div>
                                    <span className="font-bold">{String(w.name)}</span>
                                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded ${w.status==='LIVRE'?'bg-green-100 text-green-800':'bg-red-100 text-red-800'}`}>{String(w.status)}</span>
                                </div>
                                <button onClick={()=>deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'warehouses', w.id))} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 size={16}/></button>
                            </div>
                        ))}
                    </Card>
                </div>
            )}
        </div>
    );
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState('login');
  const [fbUser, setFbUser] = useState<any>(null);

  const [users, setUsers] = useState([]);
  const [projs, setProjs] = useState([]);
  const [wares, setWares] = useState([]);
  const [pieces, setPieces] = useState([]);
  const [vols, setVols] = useState([]);

  useEffect(() => {
    const initAuth = async () => {
      // @ts-ignore
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
      else await signInAnonymously(auth);
    };
    initAuth();
    return onAuthStateChanged(auth, setFbUser);
  }, []);

  useEffect(() => {
    if(!fbUser) return;
    const qUsers = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const qProjs = collection(db, 'artifacts', appId, 'public', 'data', 'projects');
    const qWares = collection(db, 'artifacts', appId, 'public', 'data', 'warehouses');
    const qPieces = collection(db, 'artifacts', appId, 'public', 'data', 'pieces');
    const qVols = collection(db, 'artifacts', appId, 'public', 'data', 'volumes');

    const u1 = onSnapshot(qUsers, s=>setUsers(s.docs.map(d=>d.data() as any)));
    const u2 = onSnapshot(qProjs, s=>setProjs(s.docs.map(d=>d.data() as any)));
    const u3 = onSnapshot(qWares, s=>setWares(s.docs.map(d=>d.data() as any)));
    const u4 = onSnapshot(qPieces, s=>setPieces(s.docs.map(d=>d.data() as any)));
    const u5 = onSnapshot(qVols, s=>setVols(s.docs.map(d=>d.data() as any)));
    
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [fbUser]);

  const Login = () => {
    const [id, setId] = useState('');
    const [pass, setPass] = useState('');
    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      const ws = getWorkspaceId();
      if(users.length === 0) { 
        const m = { id:'master', workspaceId: ws, login_id:id, password:pass, role:'MASTER', auth_password_override:'1234' };
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', 'master'), m);
        alert("Conta MASTER criada!"); return;
      }
      const found: any = users.find((x:any) => x.login_id.toLowerCase() === id.toLowerCase() && x.password === pass);
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
             <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> {user.login_id}
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
            <button key={i.id} onClick={()=>setView(i.id)} className={`w-full flex items-center px-6 py-4 border-l-4 transition-all duration-200 ${view===i.id?'border-[#348e91] bg-[#1c5052] text-white':'border-transparent hover:bg-[#1c5052]/50 text-gray-400'}`}>
              <i.icon size={20} className="mr-3"/> {i.label}
            </button>
          ))}
        </nav>
        <button onClick={()=>setUser(null)} className="p-6 flex items-center justify-center text-gray-500 hover:text-red-400 border-t border-gray-800 transition-colors"><LogOut size={18} className="mr-2"/> Sair</button>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-10">
        <div className="max-w-5xl mx-auto">
          {view === 'dashboard' && <Dashboard projects={projs} pieces={pieces} warehouses={wares} />}
          {view === 'admin' && <AdminScreen users={users} warehouses={wares} projects={projs} pieces={pieces} currentUser={user} />}
          {view === 'producao' && <Producao pieces={pieces} currentUser={user} />}
          {view === 'expedicao' && <Expedicao projects={projs} pieces={pieces} warehouses={wares} volumes={vols} users={users} />}
          {view === 'saida' && <Saida projects={projs} volumes={vols} />}
        </div>
      </main>
    </div>
  );
}
