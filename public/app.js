import {facilitiesView,modelsView,modelReviewForm,studioView,modelInputFields,modelRunBasis,readModelRun,exportEnterprise} from './enterprise-ui.js';
import {GROUPS,METHODS,BUILTIN_TYPES} from './collateral-catalog.js';
import {universalAssetForm,readAssetForm,changeAssetType,findCollateralTypes,collateralDetail,eligibilityForm,universalAppraisalForm,valuationInputs,catalogView} from './collateral-ui.js';
import {escapeText, currency, riskLabels, statusText, actionText} from './helpers.js';
import {requestApi as api,validateMetadata} from './api-client.js';
const app=document.getElementById('app');
const state={user:null,needSetup:false,configError:'',view:'dashboard',dashboard:null,list:null,detail:null,settings:null,users:null,audit:null,catalog:null,integrations:null,category:'',search:'',status:'',edit:false,mobile:false,busy:false};

const esc=escapeText;
const money=currency;
const btn=(name,text,kind='')=>`<button type="button" class="btn ${kind}" data-action="${name}">${text}</button>`;
const badge=s=>`<span class="pill ${esc(s)}">${esc(statusText[s]||s)}</span>`;
const formatDate=x=>x?new Date(x.replace(' ','T')+'Z').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'—';
const empty=(title,subtitle)=>`<div class="empty"><span class="icon">▤</span><strong>${esc(title)}</strong><div>${esc(subtitle)}</div></div>`;
function notify(message,bad=false){document.querySelector('.toast')?.remove();const t=document.createElement('div');t.className=`toast ${bad?'bad':''}`;t.textContent=message;document.body.appendChild(t);setTimeout(()=>t.remove(),4200);}
async function init(){try{const meta=validateMetadata(await api('/api/meta'));state.needSetup=meta.needs_setup;state.user=meta.user;state.configError='';if(state.user)await loadView();else renderAuth();}catch(e){state.user=null;state.needSetup=false;state.configError=e.message;renderAuth();}}
function renderAuth(){
 const setup=state.needSetup&&!state.configError;
 app.innerHTML=`<div class="auth-screen"><div class="auth-hero"><div class="brand"><span class="brand-mark">C</span><span><strong>CollMan</strong><small>COLLATERAL MANAGEMENT</small></span></div><h1>Kelola agunan dengan keyakinan.</h1><p>Satu platform untuk pencatatan agunan, verifikasi legalitas, penilaian, review berjenjang, dan audit trail yang terstruktur.</p><div class="footer">Collateral intelligence. Controlled decisions. &copy; 2026 CollMan.</div></div>
 <div class="auth-right"><div class="auth-card"><div class="eyebrow">${setup?'SETUP ORGANISASI':'PORTAL PENGGUNA'}</div><h2>${setup?'Aktivasi administrator':'Selamat datang'}</h2><p>${setup?'Masukkan token aktivasi dari administrator sistem untuk membuat administrator pertama.':'Login menggunakan akun yang dibuat administrator institusi Anda.'}</p>
 ${state.configError?`<div class="bad-config" role="alert"><strong>Layanan login belum siap.</strong><p>${esc(state.configError)}</p><button type="button" class="btn" data-action="retry-connection">Coba lagi</button></div>`:''}
 ${!state.configError?`<form id="auth-form">
 ${setup?`<div class="form-group"><label>Nama institusi</label><input class="field" name="organization" required maxlength="150" placeholder="Nama bank / institusi"></div><div class="form-group"><label>Nama administrator</label><input class="field" name="display_name" required maxlength="150"></div>`:''}
 <div class="form-group"><label>Email</label><input type="email" class="field" name="email" autocomplete="username" required></div>
 <div class="form-group"><label>Password ${setup?'baru':'akun'}</label><input type="password" class="field" name="password" required autocomplete="${setup?'new-password':'current-password'}" minlength="${setup?'12':'1'}"></div>
 ${setup?`<div class="form-group"><label>Token aktivasi administrator</label><input class="field" type="password" name="setup_token" required autocomplete="off"></div>`:''}
 <button type="submit" class="btn primary">${setup?'Aktivasi Administrator':'Masuk ke CollMan'}</button></form>`:''}
 <div class="auth-powered">Akses terbatas • Sesi 12 jam • Segregation of duties</div></div></div></div>`;
}
const NAV=[['dashboard','◫','Dashboard'],['assets','▦','Register Agunan'],['catalog','▧','Kategori Agunan'],['facilities','▥','Fasilitas & Alokasi'],['models','◈','Model Registry'],['workflow','⇄','Workflow Persetujuan'],['report','▤','Laporan & Analitik'],['audit','◷','Audit Trail'],['settings','⚙','Parameter Risiko'],['users','♙','Manajemen Pengguna'],['integrations','◎','Kesiapan Integrasi']];

function renderShell(){
 const nav=NAV.filter(([key])=>(!['audit','settings','users'].includes(key)|| (key==='audit'?['ADMIN','AUDITOR'].includes(state.user.role):key==='settings'?true:state.user.role==='ADMIN')) && (key!=='integrations'||['ADMIN','AUDITOR'].includes(state.user.role)));
 const active=NAV.find(x=>x[0]===state.view)?.[2]||'CollMan';
 app.innerHTML=`<div class="shell"><div class="mobile-overlay" ${state.mobile?'':'hidden'} data-action="sidebar-close"></div><aside class="sidebar ${state.mobile?'open':''}"><div class="brand"><span class="brand-mark">C</span><span><strong>CollMan</strong><small>COLLATERAL MANAGEMENT</small></span></div><div><div class="nav-label">WORKSPACE</div><nav class="nav">${nav.map(([k,icon,label])=>`<button type="button" data-nav="${k}" class="${k===state.view?'active':''}"><span class="ico">${icon}</span><span>${label}</span></button>`).join('')}</nav></div><div class="side-footer"><strong>${esc(state.user.display_name)}</strong>${esc(state.user.role)} · ${esc(state.user.email)}<button type="button" data-action="password">Ganti Password</button><button type="button" data-action="logout">⇥ &nbsp; Keluar dari sistem</button></div></aside><div class="main"><header class="topbar"><div class="top-right"><button class="icon-btn mobile-menu" data-action="sidebar-toggle">☰</button><span class="breadcrumbs">Workspace / <strong>${esc(active)}</strong></span></div><div class="top-right"><span class="small muted">${esc(state.user.role)}</span><span class="top-avatar">${esc(state.user.display_name.slice(0,1).toUpperCase())}</span></div></header><div class="main-body" id="page"></div></div></div>`;
 renderContent();
}
function head(label,title,desc,buttons=''){return `<div class="pagehead"><div><div class="eyebrow">${esc(label)}</div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="actions">${buttons}</div></div>`;}
function renderContent(){const el=document.getElementById('page');if(!el)return;if(state.busy){el.innerHTML='<div class="card">Memuat data…</div>';return;}
 switch(state.view){case 'facilities':el.innerHTML=facilitiesView(state);break;case 'models':el.innerHTML=modelsView(state);break;case 'catalog':el.innerHTML=head('MASTER AGUNAN','Kategori & Kebijakan Agunan','Kelola jenis agunan lintas aset sesuai kebijakan institusi.')+catalogView(state.catalog,state.user);break;case 'dashboard':el.innerHTML=dashboard();break;case 'assets':el.innerHTML=assets();break;case 'asset':el.innerHTML=assetDetail();break;case 'assetform':el.innerHTML=assetForm();break;case 'workflow':el.innerHTML=workflow();break;case 'report':el.innerHTML=report();break;case 'settings':el.innerHTML=settings();break;case 'users':el.innerHTML=users();break;case 'audit':el.innerHTML=audit();break;case 'integrations':el.innerHTML=integrationsView();break;case 'password':el.innerHTML=passwordForm();break;default:el.innerHTML=empty('Tidak ditemukan','Pilih menu di samping.');}}

async function loadView(){
 state.busy=true;renderShell();document.getElementById('page').innerHTML=`<div class="card">Memuat data…</div>`;
 try{
  if(!state.catalog||state.view==='catalog')state.catalog=await api('/api/collateral-catalog');
  if(state.view==='facilities'){state.facilities=await api('/api/facilities?q='+encodeURIComponent(state.facilityQuery||''));state.allocations=await api('/api/allocations');state.approvedAssets=await api('/api/assets?status=APPROVED');}
  if(state.view==='models'||state.view==='asset')state.models=await api('/api/models');
  if(state.view==='asset'&&state.detail?.asset?.id)state.modelRuns=await api('/api/assets/'+state.detail.asset.id+'/model-runs');
  if(state.view==='dashboard'||state.view==='report')state.dashboard=await api('/api/dashboard');
  if(state.view==='assets'||state.view==='workflow')state.list=await api('/api/assets'+(state.view==='assets'?`?q=${encodeURIComponent(state.search)}&status=${encodeURIComponent(state.status)}&category=${encodeURIComponent(state.category)}`:''));
  if(state.view==='asset'&&state.detail?.asset?.id)state.detail=await api(`/api/assets/${state.detail.asset.id}`);
  if(state.view==='settings')state.settings=await api('/api/settings');
  if(state.view==='users')state.users=await api('/api/users');
  if(state.view==='audit')state.audit=await api('/api/audit');
  if(state.view==='integrations')state.integrations=await api('/api/integrations');
  state.busy=false;renderShell();
 }catch(e){state.busy=false;renderShell();document.getElementById('page').innerHTML=`<div class="card bad-config">${esc(e.message)}</div>`;notify(e.message,true);}finally{state.busy=false;}}
function integrationsView(){
 const ready=state.integrations||{connectors:{}};
 const labels={atr_bpn:'ATR/BPN (legalitas)',ocr:'OCR dokumen',ai_appraisal:'AI appraisal',spatial_provider:'Peta spasial resmi'};
 const rows=Object.entries(labels).map(([key,label])=>{
  const v=ready.connectors[key]||{status:'NOT_CONFIGURED'};
  const msg=v.status==='NOT_CONFIGURED'?'Belum ada konektor/credential':
    'Konfigurasi ada, koneksi dan hasil belum diverifikasi';
  return '<tr><td><strong>'+esc(label)+'</strong></td><td>'+esc(v.status)+'</td><td>'+esc(msg)+'</td></tr>';
 });
 return head('ADMIN & AUDIT','Kesiapan Integrasi','Konfigurasi nonrahasia. Pemeriksaan ini tidak menghubungi penyedia dan tidak menjamin akses data pemerintah.')+
 '<section class="card"><div class="notice warn">'+esc(ready.notice||'Integrasi eksternal belum divalidasi.')+
 '</div>'+table(['Layanan','Status','Catatan'],rows)+
 '<p class="field-note">Integrasi resmi harus melewati perjanjian mitra, perizinan data, pemeriksaan keamanan, dan UAT sebelum digunakan untuk keputusan agunan.</p></section>';
}

const table=(cols,rows)=>`<div class="tablewrap"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const assetRow=x=>`<tr><td class="strong"><button type="button" class="linkbtn" data-open="${esc(x.id)}">${esc(x.reference_no)}</button></td><td><strong>${esc(x.borrower)}</strong><div class="muted small">${esc(x.asset_type)}</div></td><td class="wrap">${esc(x.address||'—')}</td><td>${money(x.market_value)}</td><td>${badge(x.status)}</td><td>${formatDate(x.updated_at)}</td></tr>`;
function dashboard(){const s=state.dashboard||{assets:{total:0,approved_market:0,approved_liquidation:0},statuses:[],recent:[]};const statuses=Object.fromEntries(s.statuses.map(x=>[x.status,x.total]));const pending=['SUBMITTED','REVIEWED','RECOMMENDED'].reduce((n,x)=>n+(statuses[x]||0),0);
 return head('OVERVIEW','Dashboard Agunan','Ringkasan portofolio agunan dan posisi proses penilaian.',(state.user.role==='MAKER'||state.user.role==='ADMIN')?btn('new','+ &nbsp; Agunan Baru','primary'):'')+
 `<div class="metrics"><div class="metric"><div class="metric-label">Total agunan terdaftar</div><div class="metric-number">${s.assets.total}</div><div class="metric-note"><span class="metric-dot"></span>Data aktual institusi</div></div><div class="metric"><div class="metric-label">Sedang dalam persetujuan</div><div class="metric-number">${pending}</div><div class="metric-note">Checker / Reviewer / Approver</div></div><div class="metric"><div class="metric-label">Nilai pasar disetujui</div><div class="metric-number">${money(s.assets.approved_market)}</div><div class="metric-note">Agunan status Approved</div></div><div class="metric"><div class="metric-label">Indikasi nilai likuidasi disetujui</div><div class="metric-number">${money(s.assets.approved_liquidation)}</div><div class="metric-note">Berdasarkan parameter institusi</div></div></div>
 ${categoryReport(s)}<div class="split"><section class="card"><div class="card-head"><div><h2>Agunan Terbaru</h2><p>Perubahan data dan penilaian terbaru</p></div>${btn('goto-assets','Lihat seluruhnya','small')}</div>${s.recent.length?table(['Referensi','Debitur / Jenis','Status','Nilai Pasar',''],s.recent.map(a=>`<tr><td class="strong"><button class="linkbtn" data-open="${esc(a.id)}">${esc(a.reference_no)}</button></td><td>${esc(a.borrower)}<div class="muted small">${esc(a.asset_type)}</div></td><td>${badge(a.status)}</td><td>${money(a.market_value)}</td><td><button class="linkbtn" data-open="${esc(a.id)}">Buka</button></td></tr>`)):empty('Belum ada agunan','Mulai dengan mendaftarkan objek agunan pertama.')}</section>
 <section class="card"><div class="card-head"><div><h2>Distribusi Status</h2><p>Jumlah objek berdasarkan status proses</p></div></div>${Object.entries(statusText).map(([k,v])=>`<div class="progress-row"><label>${esc(v)}</label><div class="bar-track"><div class="bar-fill" style="width:${s.assets.total?Math.round((statuses[k]||0)/s.assets.total*100):0}%"></div></div><b>${statuses[k]||0}</b></div>`).join('')}<div class="notice warn" style="margin-top:20px">Quick Appraisal merupakan <b>screening awal</b>, bukan pengganti inspeksi fisik, KJPP, atau keputusan kredit akhir.</div></section></div>`;
}
function assets(){const data=state.list||{records:[],total:0};return head('DATA MASTER','Register Agunan',`${data.total} agunan sesuai filter yang dipilih.`,(state.user.role==='MAKER'||state.user.role==='ADMIN')?btn('new','+ &nbsp; Tambah Agunan','primary'):'')+
 `<div class="card"><div class="filters"><input id="search" placeholder="Cari nomor referensi, debitur, atau alamat…" value="${esc(state.search)}"><select id="status-filter" class="field" style="max-width:210px"><option value="">Semua status</option>${Object.entries(statusText).map(([k,v])=>`<option value="${k}" ${state.status===k?'selected':''}>${v}</option>`).join('')}</select><select id="category-filter" class="field"><option value="">Semua kategori</option>${GROUPS.map(g=>`<option value="${g.code}" ${state.category===g.code?'selected':''}>${esc(g.name)}</option>`).join('')}</select><button class="btn" data-action="filter">Cari</button><button class="btn" data-action="export-csv">↓ CSV halaman ini</button></div>${data.records.length?table(['Nomor Agunan','Debitur / Jenis','Lokasi','Nilai Pasar','Status','Diperbarui'],data.records.map(assetRow)):empty('Tidak ada data','Sesuaikan filter atau tambahkan agunan baru.')}
 <div class="small muted" style="margin-top:16px">Menampilkan maksimal 50 data terbaru. Total hasil: ${data.total}.</div></div>`;}
function assetForm(){const a=state.edit?state.detail?.asset:undefined;return head('REGISTER AGUNAN',a?'Perbarui Data Agunan':'Tambah Agunan Baru','Pilih kategori untuk menampilkan data, dokumen, dan pengikatan yang relevan.',btn('back-assets','← Kembali'))+universalAssetForm(a,state.catalog?.types);}
function assetDetail(){const d=state.detail;if(!d)return empty('Agunan belum dipilih','Buka register agunan.');const a=d.asset,v=d.appraisal;
 const canEdit=(state.user.role==='ADMIN'||state.user.role==='MAKER'&&a.created_by===state.user.id)&&['DRAFT','RETURNED'].includes(a.status);
 const labels=['Maker','Checker','Reviewer','Approver'];const current={'DRAFT':0,'RETURNED':0,'SUBMITTED':1,'REVIEWED':2,'RECOMMENDED':3,'APPROVED':4,'REJECTED':4}[a.status]??0;
 const stepper=`<div class="statusbar">${labels.map((l,i)=>`<span class="step ${i<current?'done':i===current?'now':''}">${i<current?'✓ ':''}${l}</span>`).join('<span class="muted">→</span>')}</div>`;
 let fields=[['Referensi',a.reference_no],['Debitur',a.borrower],['Jenis objek',a.asset_type],['Lokasi',a.address],['Jenis hak',a.certificate_type||'—'],['Nomor sertifikat',a.certificate_no||'—'],['NIB',a.nib||'—'],['Nama pemegang hak',a.ownership_name||'—'],['Luas tanah',`${a.land_area} m²`],['Luas bangunan',`${a.building_area} m²`],['Status legalitas',a.legal_status.replaceAll('_',' ')],['Maker',a.maker_name]];
 if(a.category_code&&a.category_code!=='PROPERTY')fields=fields.filter(([label])=>!['Jenis hak','Nomor sertifikat','NIB','Nama pemegang hak','Luas tanah','Luas bangunan'].includes(label));
 const canTransition=Object.keys(actionText).filter(action=>{const def=actions[action];return def.from.includes(a.status)&&def.roles.includes(state.user.role)&&!(a.created_by===state.user.id&&['CHECK','RECOMMEND','APPROVE'].includes(action));});
 return head('DETAIL AGUNAN',a.reference_no,`${a.borrower} • ${a.asset_type}`,
 btn('back-assets','← Daftar Agunan')+(canEdit?btn('edit-asset','✎ Perbarui Data','primary'):''))+
 `<section class="card"><div class="card-head"><div><h2>Identitas & Legalitas Agunan</h2><p>${esc(a.address)}</p></div>${badge(a.status)}</div><div class="info-grid">${fields.map(([k,val])=>`<div><div class="key">${esc(k)}</div><div class="value">${esc(String(val))}</div></div>`).join('')}</div>${a.notes?`<div class="divider"></div><div class="small muted">Catatan: ${esc(a.notes)}</div>`:''}</section>
 ${collateralDetail(a,state.catalog?.types)}${eligibilityForm(a,state.user)}${studioView(state)}
 <section class="card"><div class="card-head"><div><h2>Hasil Penilaian & Quick Appraisal</h2><p>${a.collateral_kind==='GUARANTEE'?'Nilai penjaminan dan nilai setelah haircut; terpisah dari agunan kebendaan':'Nilai penilaian, haircut dan indikasi nilai likuidasi'}</p></div>${canEdit?btn('edit-appraisal',v?'Ubah Penilaian':'+ Tambah Penilaian','small'):''}</div>
 ${v?`<div class="metrics" style="margin-bottom:0;grid-template-columns:repeat(3,minmax(0,1fr))"><div class="kpi-mini"><div class="small muted">Nilai penilaian</div><span class="val">${money(v.market_value)}</span></div><div class="kpi-mini"><div class="small muted">Total haircut</div><span class="val">${v.total_haircut_pct}%</span><div class="small muted">Dasar ${v.base_haircut_pct}% + risiko ${v.risk_haircut_pct}%</div></div><div class="kpi-mini"><div class="small muted">Indikasi likuidasi</div><span class="val">${money(v.liquidation_value)}</span></div></div><div class="section-label">Faktor risiko yang ditandai</div><div class="legend">${Object.entries(riskLabels).filter(([k])=>v.risk_flags[k]).map(([k,l])=>`<span class="pill RETURNED">! ${esc(l)}</span>`).join('')||'<span class="muted">Belum ada bendera risiko ditandai</span>'}</div><p class="field-note" style="margin:15px 0 0">Metode: ${esc(METHODS[v.valuation_method]||v.valuation_method||'Nilai pasar hasil penilai')}. Referensi: ${esc(v.valuation_reference||'Data historis')}. Tanggal penilaian: ${esc(v.valuation_date)}. ${esc(v.notes||'')} Nilai bersifat indikatif, menunggu validasi penilai berwenang.</p>`:empty('Penilaian belum tersedia','Isi nilai penilaian dan parameter haircut sebelum mengirim untuk review.')}</section>
 <section class="card"><div class="card-head"><div><h2>Register Bukti Agunan & Review</h2>
 <p>Metadata legalitas, inspeksi, OCR dan penilaian — tidak menyimpan dokumen mentah.</p></div>${canEdit?btn('new-evidence','+ Catat Bukti','small'):''}</div>
 <div class="notice warn">Review internal bukan verifikasi resmi ATR/BPN. Bukti bersifat append-only dan tidak dapat dihapus setelah direkam.</div>
 ${(d.evidence||[]).length?table(['Jenis / Referensi','Sumber / Pencatat','Status review','Tindakan'],(d.evidence||[]).map(e=>{
  const permitted=(e.review_status==='PENDING_REVIEW'&&e.recorded_by!==state.user.id&&a.created_by!==state.user.id &&
   (state.user.role==='CHECKER'&&a.status==='SUBMITTED'||state.user.role==='REVIEWER'&&a.status==='REVIEWED'));
  return '<tr><td><strong>'+esc(e.evidence_type)+'</strong><div class="muted small">'+esc(e.reference_no)+
  '</div></td><td>'+esc(e.source_name)+'<div class="muted small">'+esc(e.recorded_by_name||'')+
  '</div></td><td>'+esc(e.review_status)+(e.review_note?'<div class="muted small">'+esc(e.review_note)+'</div>':'')+
  '</td><td>'+(permitted?'<button class="btn small" data-review-evidence="'+esc(e.id)+'" data-decision="REVIEWED_INTERNAL">Review Internal</button> '+
   '<button class="btn small" data-review-evidence="'+esc(e.id)+'" data-decision="DISPUTED">Temuan</button>':'—')+'</td></tr>';
 })):empty('Belum ada bukti','Maker dapat mencatat metadata dokumen; Checker/Reviewer melakukan review terpisah.')}
 </section>
 <section class="card"><div class="card-head"><div><h2>Analisis Bukti & Skrining Spasial</h2><p>Bahan kajian yang belum terverifikasi — bukan hasil resmi ATR/BPN atau AI appraisal</p></div><button type="button" class="btn small" data-action="offer-analysis">Analisis Harga Pembanding</button></div>
 <div id="evidence-result" class="notice warn">Analisis penawaran dihitung dari input pembanding. OCR, ATR/BPN, AI, dan penyedia GIS resmi masih memerlukan konektor serta UAT.</div>
 <form id="spatial-form"><h3>Pemeriksaan jarak risiko (koordinat manual)</h3><div class="formgrid">
 <div class="form-group"><label>Latitude agunan</label><input class="field" type="number" name="latitude" step="any" min="-90" max="90" required></div>
 <div class="form-group"><label>Longitude agunan</label><input class="field" type="number" name="longitude" step="any" min="-180" max="180" required></div>
 <div class="form-group"><label>Jenis objek risiko</label><select class="field" name="hazard_type"><option value="banjir">Banjir</option><option value="sutet">SUTET</option><option value="tpu">TPU</option><option value="jalur_hijau">Jalur hijau</option><option value="akses_jalan">Akses jalan</option><option value="perubahan_ilegal">Perubahan ilegal</option></select></div>
 <div class="form-group"><label>Latitude objek risiko</label><input class="field" type="number" name="hazard_lat" step="any" min="-90" max="90" required></div>
 <div class="form-group"><label>Longitude objek risiko</label><input class="field" type="number" name="hazard_lon" step="any" min="-180" max="180" required></div>
 <div class="form-group"><label>Radius pemeriksaan (meter)</label><input class="field" type="number" name="radius_m" min="0" max="10000" value="100" required></div>
 <div class="form-group wide"><label>Sumber / referensi bukti</label><input class="field" name="source" maxlength="300" required placeholder="Contoh: hasil survei internal / dokumen sumber"></div></div>
 <p class="field-note">Jarak garis lurus saja; bukan analisis poligon banjir/zona peruntukan dan tidak menetapkan legalitas.</p>
 <button type="submit" class="btn small">Hitung jarak & tandai risiko</button></form></section>

 <div class="two-col"><section class="card"><div class="card-head"><div><h2>Data Pembanding</h2><p>Referensi harga dari sumber yang dicatat user</p></div>${canEdit?btn('new-comparable','+ Pembanding','small'):''}</div>${d.comparables.length?table(['Pembanding','Harga penawaran',''],d.comparables.map(c=>`<tr><td class="wrap"><strong>${esc(c.description)}</strong><div class="small muted">${esc(c.address||'')}</div>${c.source_url?`<a href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">Sumber ↗</a>`:''}</td><td>${money(c.offering_price)}</td><td>${canEdit?`<button class="linkbtn" data-delete-comparable="${esc(c.id)}">Hapus</button>`:''}</td></tr>`)):empty('Belum ada pembanding','Tambahkan sumber pembanding yang dapat diverifikasi.')}</section>
 <section class="card"><div class="card-head"><div><h2>Workflow & Keputusan</h2><p>Tahapan pemeriksaan berjenjang</p></div></div>${stepper}<div class="divider"></div>${canTransition.length?`<div class="form-group"><label>Catatan keputusan</label><textarea id="workflow-note" class="field" placeholder="Alasan pengembalian / penolakan wajib diisi."></textarea></div><div class="actions">${canTransition.map(action=>`<button class="btn ${action==='APPROVE'?'teal':action==='REJECT'?'danger':action==='RETURN'?'':'primary'}" data-transition="${action}">${actionText[action]}</button>`).join('')}</div>`:`<div class="notice warn">Tidak ada aksi workflow yang tersedia untuk peran atau status saat ini.</div>`}</section></div>
 <section class="card"><div class="card-head"><div><h2>Riwayat Persetujuan</h2><p>Jejak peristiwa workflow per agunan</p></div></div>${d.history.length?`<div class="timeline">${d.history.map(h=>`<div class="timeline-item"><strong>${esc(actionText[h.action]||h.action)}</strong> oleh ${esc(h.actor_name)} ${badge(h.to_status)}<small>${formatDate(h.created_at)} ${h.note?'• '+esc(h.note):''}</small></div>`).join('')}</div>`:empty('Belum ada tindakan workflow','Riwayat akan muncul setelah pengajuan pertama.')}</section>`;
}
const actions={SUBMIT:{from:['DRAFT','RETURNED'],roles:['MAKER','ADMIN']},CHECK:{from:['SUBMITTED'],roles:['CHECKER','ADMIN']},RECOMMEND:{from:['REVIEWED'],roles:['REVIEWER','ADMIN']},APPROVE:{from:['RECOMMENDED'],roles:['APPROVER','ADMIN']},REJECT:{from:['RECOMMENDED'],roles:['APPROVER','ADMIN']},RETURN:{from:['SUBMITTED','REVIEWED','RECOMMENDED'],roles:['CHECKER','REVIEWER','APPROVER','ADMIN']}};
function workflow(){const data=state.list||{records:[]};const pending=data.records.filter(a=>['SUBMITTED','REVIEWED','RECOMMENDED','RETURNED'].includes(a.status));return head('TASK MANAGEMENT','Workflow Persetujuan','Pantau tugas dan lakukan tindakan sesuai kewenangan masing-masing peran.')+
 `<section class="card"><div class="notice">Alur Maker → Checker → Reviewer → Approver. Sistem menolak persetujuan sendiri dan mencatat setiap perubahan status.</div>${pending.length?table(['Referensi','Debitur','Status','Aksi'],pending.map(a=>`<tr><td class="strong">${esc(a.reference_no)}</td><td>${esc(a.borrower)}</td><td>${badge(a.status)}</td><td><button class="btn small" data-open="${esc(a.id)}">Lihat tugas</button></td></tr>`)):empty('Tidak ada tugas berjalan','Tugas akan tampil saat pengajuan dikirim dari Maker.')}</section>`;}
function report(){const s=state.dashboard||{assets:{total:0,approved_market:0,approved_liquidation:0},statuses:[]};return head('PORTFOLIO INTELLIGENCE','Laporan & Analitik','Ringkasan yang dihasilkan dari database operasional, tanpa data dummy.',btn('print','⎙ Cetak halaman'))+
 `<div class="two-col"><div class="report-summary"><div class="eyebrow" style="color:#9de8da">PORTOFOLIO DISETUJUI</div><div class="report-num">${money(s.assets.approved_liquidation)}</div><p>Total indikasi likuidasi untuk objek berstatus Approved</p></div><div class="card"><div class="card-head"><h2>Ringkasan Portofolio</h2></div><div class="info-grid" style="grid-template-columns:repeat(2,1fr)"><div><div class="key">Total Agunan</div><div class="value">${s.assets.total}</div></div><div><div class="key">Nilai Pasar Disetujui</div><div class="value">${money(s.assets.approved_market)}</div></div></div><div class="divider"></div>${(s.statuses||[]).map(x=>`<div class="progress-row"><label>${esc(statusText[x.status]||x.status)}</label><div class="bar-track"><div class="bar-fill" style="width:${s.assets.total?100*x.total/s.assets.total:0}%"></div></div><b>${x.total}</b></div>`).join('')||'<p class="muted">Belum ada data.</p>'}</div></div>
 ${categoryReport(s)}<section class="card"><h2>Ketentuan Penggunaan</h2><p class="muted" style="line-height:1.8">Output ini merupakan data internal dan hasil perhitungan berdasarkan parameter yang ditetapkan institusi. Tidak membuktikan keabsahan sertifikat, kondisi fisik, status tata ruang, atau kewajaran transaksi. Penetapan nilai akhir dan keputusan kredit tetap mengikuti kewenangan serta prosedur internal bank.</p></section>`;}
function categoryReport(s){const rows=s.categories||[];return `<section class="card"><h2>Portofolio per Kategori</h2><p class="muted">Jaminan perorangan / perusahaan / bank dipisahkan. Seluruh nilai dalam rupiah.</p>${rows.length?table(['Kategori','Jumlah','Jenis perlindungan','Nilai disetujui setelah haircut'],rows.map(r=>`<tr><td>${esc(GROUPS.find(g=>g.code===r.category_code)?.name||r.category_code)}</td><td>${r.total}</td><td>${r.collateral_kind==='GUARANTEE'?'Penjaminan':'Agunan kebendaan'}</td><td>${money(r.approved_value)}</td></tr>`)):empty('Belum ada portofolio','Data aktual akan muncul sesuai kategori.')}</section>`;}
function settings(){const s=state.settings||{risk_weights:{},risk_flags:Object.keys(riskLabels)};return head('KONFIGURASI','Parameter Risiko Lokasi','Atur bobot haircut sesuai kebijakan institusi, tidak ditentukan otomatis oleh sistem.')+
 `<section class="card"><div class="notice warn"><strong>Kontrol kebijakan:</strong> Default seluruh bobot adalah 0%. Admin harus menetapkan bobot berdasarkan persetujuan internal. Perubahan tidak secara otomatis menghitung ulang appraisal lama; lakukan revisi appraisal untuk menerapkan parameter baru.</div><form id="settings-form"><div class="formgrid">${Object.entries(riskLabels).map(([key,label])=>`<div class="form-group"><label>${esc(label)} — haircut tambahan (%)</label><input class="field" type="number" min="0" max="100" step="0.01" name="${esc(key)}" value="${Number(s.risk_weights[key]||0)}" ${state.user.role==='ADMIN'?'':'disabled'}></div>`).join('')}</div>${state.user.role==='ADMIN'?`<div class="divider"></div><button class="btn primary" type="submit">Simpan Parameter</button>`:''}</form></section>`;}
function users(){const list=state.users?.records||[];return head('ADMINISTRASI','Manajemen Pengguna','Registrasi dan pembaruan peran dibatasi pada Administrator.')+
 `<div class="two-col"><section class="card"><h2>Tambah Pengguna</h2><p class="muted small">Password awal harus diganti melalui menu akun setelah login.</p><form id="user-form" class="formgrid" style="grid-template-columns:1fr"><div class="form-group"><label>Nama lengkap</label><input class="field" name="display_name" required maxlength="150"></div><div class="form-group"><label>Email</label><input class="field" type="email" name="email" required></div><div class="form-group"><label>Peran</label><select class="field" name="role">${['MAKER','CHECKER','REVIEWER','APPROVER','AUDITOR','ADMIN'].map(r=>`<option>${r}</option>`).join('')}</select></div><div class="form-group"><label>Password awal</label><input type="password" class="field" name="password" minlength="12" required></div><button class="btn primary" type="submit">Buat Pengguna</button></form></section><section class="card"><h2>Daftar Pengguna</h2>${list.length?table(['Nama & Email','Peran','Status',''],list.map(u=>`<tr><td class="wrap"><strong>${esc(u.display_name)}</strong><div class="small muted">${esc(u.email)}</div></td><td>${esc(u.role)}</td><td>${u.active?'Aktif':'Nonaktif'}</td><td>${u.id!==state.user.id?`<button class="linkbtn" data-toggle-user="${esc(u.id)}" data-active="${u.active}" data-role="${esc(u.role)}">${u.active?'Nonaktifkan':'Aktifkan'}</button>`:''}</td></tr>`)):empty('Belum ada pengguna','Buat pengguna dengan peran sesuai kebutuhan.')}</section></div>`;}
function audit(){const rows=state.audit?.records||[];return head('CONTROL & COMPLIANCE','Audit Trail','Jejak aktivitas penting untuk review dan investigasi.')+
 `<section class="card">${rows.length?table(['Waktu','Pengguna','Entitas','Aksi','Referensi'],rows.map(x=>`<tr><td>${formatDate(x.created_at)}</td><td>${esc(x.actor_name)}</td><td>${esc(x.entity_type)}</td><td><strong>${esc(x.action)}</strong></td><td class="small">${esc(x.entity_id.slice(0,13))}…</td></tr>`)):empty('Belum ada aktivitas','Aktivitas akan muncul setelah penggunaan.')}</section>`;}
function passwordForm(){return head('KEAMANAN AKUN','Ganti Password','Perubahan password akan mengakhiri seluruh sesi Anda.')+
  `<form id="password-form" class="card" style="max-width:560px"><div class="form-group"><label>Password saat ini</label><input class="field" type="password" name="old_password" required autocomplete="current-password"></div><div class="form-group"><label>Password baru</label><input class="field" type="password" name="new_password" minlength="12" required autocomplete="new-password"><div class="hint">Minimal 12 karakter, huruf besar, huruf kecil, dan angka.</div></div><button class="btn primary" type="submit">Simpan Password Baru</button></form>`;}
function evidenceForm(){
 return `<form id="evidence-form" class="card"><div class="card-head"><div><h2>Catat Bukti Agunan</h2>
 <p>Input metadata saja. Jangan memasukkan teks OCR, KTP, foto sertifikat atau rahasia ke kolom catatan.</p></div>${btn('detail-back','✕ Tutup','small')}</div>
 <div class="formgrid"><div class="form-group"><label>Jenis bukti</label><select class="field" name="evidence_type" required>
 ${[['LEGAL_DOCUMENT','Dokumen Legal'],['OWNERSHIP','Kepemilikan'],['VALUATION_SUPPORT','Data Penilaian'],['SITE_SURVEY','Hasil Survei'],['SPATIAL_SCREEN','Analisis Spasial'],['OCR_EXTRACTION','Ekstraksi OCR'],['KJPP_REPORT','Laporan KJPP']].map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')}</select></div>
 <div class="form-group"><label>Sumber / instansi *</label><input class="field" name="source_name" maxlength="200" required></div>
 <div class="form-group"><label>Nomor referensi bukti *</label><input class="field" name="reference_no" maxlength="200" required></div>
 <div class="form-group"><label>Digest SHA-256 (opsional)</label><input class="field" name="digest_sha256" pattern="[a-fA-F0-9]{64}" placeholder="64 digit hex (tanpa file)" maxlength="64"></div>
 <div class="form-group wide"><label>Catatan nonrahasia</label><textarea class="field" name="notes" maxlength="1000"></textarea></div></div>
 <p class="field-note">Tidak ada file upload pada formulir ini. Hasil review tetap internal dan tidak otomatis mengubah status legalitas.</p>
 <button type="submit" class="btn primary">Simpan Metadata Bukti</button></form>`;
}
function appraisalForm(){return universalAppraisalForm(state.detail,state.catalog?.types);}
function comparableForm(){return `<form id="comparable-form" class="card"><div class="card-head"><h2>Tambahkan Referensi Pembanding</h2>${btn('detail-back','✕ Tutup','small')}</div><div class="formgrid"><div class="form-group"><label>Deskripsi pembanding *</label><input class="field" name="description" required maxlength="250"></div><div class="form-group"><label>Harga penawaran (Rp) *</label><input type="number" class="field" name="offering_price" min="1" step="1" required></div><div class="form-group wide"><label>Alamat / lokasi</label><input class="field" name="address" maxlength="500"></div><div class="form-group wide"><label>Tautan sumber pembanding</label><input class="field" type="url" name="source_url" placeholder="https://…"></div>${state.detail.asset.category_code==='PROPERTY'?`<div class="form-group"><label>Luas tanah (m²)</label><input class="field" type="number" step="0.01" min="0" name="land_area" value="0"></div><div class="form-group"><label>Luas bangunan (m²)</label><input class="field" type="number" step="0.01" min="0" name="building_area" value="0"></div>`:''}</div><div class="divider"></div><button class="btn primary" type="submit">Simpan Pembanding</button></form>`;}

function formObj(form){return Object.fromEntries(new FormData(form).entries());}
async function onSubmit(event){const form=event.target;if(!form.id)return;event.preventDefault();const b=form.querySelector('[type="submit"]');if(b)b.disabled=true;
 try{
  if(['facility-form','allocation-form','model-form','model-run-form','model-review-form','facility-search'].includes(form.id)){
   let path,body=formObj(form);
   if(form.id==='facility-search'){state.facilityQuery=body.facility_query;await loadView();return;}
   if(form.id==='facility-form')path='/api/facilities';
   if(form.id==='allocation-form')path='/api/allocations';
   if(form.id==='model-form'){path='/api/models';body.parameters={max_source_age_days:body.max_source_age_days,min_comparables:body.min_comparables};}
   if(form.id==='model-run-form'){path='/api/assets/'+state.detail.asset.id+'/model-runs';body=readModelRun(form,state.models.records);}
   if(form.id==='model-review-form'){path='/api/models/'+form.dataset.id+'/review';const model=state.models.records.find(m=>m.id===form.dataset.id);body.observations=[0,1,2].map(i=>({category:model.category,region:model.region,predicted:body['predicted_'+i],actual:body['actual_'+i],realized_on:body['realized_on_'+i],realization_ref:body['realization_ref_'+i]}));}
   await api(path,{method:'POST',body});await loadView();notify('Data tersimpan.');return;
  }

  if(form.id==='auth-form'){
   const data=formObj(form);if(state.needSetup){await api('/api/auth/bootstrap',{method:'POST',body:data});state.needSetup=false;notify('Administrator berhasil dibuat. Silakan login.');renderAuth();}
   else{await api('/api/auth/login',{method:'POST',body:data});await init();}
  }else if(form.id==='asset-form'){
   form._types=state.catalog?.types;
   const body=readAssetForm(form),id=state.edit?state.detail.asset.id:null;
   const result=await api(id?`/api/assets/${id}`:'/api/assets',{method:id?'PUT':'POST',body});state.edit=false;
   state.detail={asset:{id:id||result.id}};state.view='asset';await loadView();notify('Data agunan berhasil disimpan.');
  }else if(form.id==='appraisal-form'){
   const body=formObj(form);body.valuation_inputs={};for(const [key,val] of Object.entries(body)){if(key.startsWith('val_')){body.valuation_inputs[key.slice(4)]=val;delete body[key];}}body.risk_flags=Object.fromEntries(Object.keys(riskLabels).map(k=>[k,!!form.elements[k]?.checked]));
   await api(`/api/assets/${state.detail.asset.id}/appraisal`,{method:'PUT',body});await loadView();notify('Penilaian berhasil disimpan.');
  }else if(form.id==='comparable-form'){
   await api(`/api/assets/${state.detail.asset.id}/comparables`,{method:'POST',body:formObj(form)});await loadView();notify('Data pembanding disimpan.');
  }else if(form.id==='eligibility-form'){
   await api(`/api/assets/${state.detail.asset.id}/eligibility`,{method:'PUT',body:formObj(form)});await loadView();notify('Kajian bank disimpan.');
  }else if(form.id==='catalog-policy-form'||form.id==='catalog-type-form'){
   const config=structuredClone(state.catalog.config),data=formObj(form);config.custom_types??=[];config.policies??={};
   if(form.id==='catalog-policy-form')config.policies[data.code]={enabled:form.elements.enabled.checked,policy:data.policy};
   else config.custom_types.push({code:'CUSTOM_'+(globalThis.crypto?.randomUUID?.()||(Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12))).replaceAll('-','').toUpperCase(),name:data['custom-name'],group:data.group});
   await api('/api/collateral-catalog',{method:'PUT',body:config});await loadView();notify('Katalog agunan diperbarui.');
  }else if(form.id==='spatial-form'){
   const v=formObj(form),id=state.detail.asset.id;
   const result=await api('/api/assets/'+encodeURIComponent(id)+'/spatial-screen',{method:'POST',body:{
     latitude:v.latitude,longitude:v.longitude,hazards:[{type:v.hazard_type,latitude:v.hazard_lat,
     longitude:v.hazard_lon,radius_m:v.radius_m,source:v.source}]}});
   const e=document.getElementById('evidence-result');
   if(e){e.replaceChildren();const p=document.createElement('p');
     p.textContent='Jarak: '+result.objects[0].distance_m+' m; dalam radius: '+(result.objects[0].within_radius?'YA':'TIDAK')+'. '+result.notice;
     e.appendChild(p);const a=document.createElement('a');
     a.href='https://www.openstreetmap.org/?mlat='+encodeURIComponent(result.latitude)+'&mlon='+encodeURIComponent(result.longitude)+'#map=16/'+encodeURIComponent(result.latitude)+'/'+encodeURIComponent(result.longitude);
     a.target='_blank';a.rel='noopener noreferrer';a.textContent='Lihat titik di peta umum OpenStreetMap (tanpa layer risiko resmi)';
     e.appendChild(a);}
  }else if(form.id==='evidence-form'){
   const id=state.detail.asset.id;
   await api('/api/assets/'+encodeURIComponent(id)+'/evidence',{method:'POST',body:formObj(form)});
   await loadView();notify('Metadata bukti tercatat, menunggu review.');

  }else if(form.id==='settings-form'){
   await api('/api/settings',{method:'PUT',body:{risk_weights:formObj(form)}});await loadView();notify('Parameter risiko berhasil diperbarui.');
  }else if(form.id==='user-form'){
   await api('/api/users',{method:'POST',body:formObj(form)});await loadView();notify('Pengguna berhasil dibuat.');
  }else if(form.id==='password-form'){
   await api('/api/auth/password',{method:'POST',body:formObj(form)});state.user=null;state.view='dashboard';await init();notify('Password telah diubah. Silakan login kembali.');
  }
 }catch(e){notify(e.message,true);}finally{if(b)b.disabled=false;}}
async function navigate(view){state.mobile=false;state.view=view;state.edit=false;if(view==='assetform'){renderShell();return;}await loadView();}
function renderCollateralSearch(input){
 const results=document.getElementById('asset-type-results');if(!results)return;
 const term=input.value.trim();if(term.length<2){results.hidden=true;results.innerHTML='';return;}
 const found=findCollateralTypes(state.catalog?.types||BUILTIN_TYPES,term);
 results.innerHTML=found.length?found.map(t=>'<button class="asset-search-option" type="button" data-search-type="'+esc(t.code)+'"><strong>'+esc(t.name)+'</strong><span>'+esc(GROUPS.find(g=>g.code===t.group)?.name||'')+'</span></button>').join(''):'<p class="small muted asset-search-empty">Tidak ada jenis agunan aktif yang cocok. Ubah kata kunci atau pilih kategori lain.</p>';
 results.hidden=false;
}
async function onClick(event){const nav=event.target.closest('[data-nav]');if(nav){await navigate(nav.dataset.nav);return;}
 const enterprise=event.target.closest('[data-enterprise]');
 if(enterprise){
  const action=enterprise.dataset.enterprise,id=enterprise.dataset.id;
  if(action==='export-facilities'){exportEnterprise('collman-facilities',state.facilities?.records||[]);return;}
  if(action==='export-models'){exportEnterprise('collman-model-registry',state.models?.records||[]);return;}
  if(action==='review-model'){document.getElementById('model-review-container').innerHTML=modelReviewForm(id);document.getElementById('model-review-container').scrollIntoView();return;}
  const message=action==='exposure'?'Exposure baru dalam IDR:':'Referensi keputusan / alasan tindakan:';
  const value=window.prompt(message);if(value===null)return;
  try{
   let path,method='POST',body={reason:value,reference:value};
   if(action==='exposure'){path='/api/facilities/'+id;method='PUT';body={exposure_idr:value};}
   if(action==='approve-model'||action==='suspend-model')path='/api/models/'+id+'/'+(action==='approve-model'?'approve':'suspend');
   if(action==='approve-allocation'||action==='reject-allocation')path='/api/allocations/'+id+'/'+(action==='approve-allocation'?'approve':'reject');
   if(action==='request-release'||action==='approve-release')path='/api/allocations/'+id+'/'+action;
   await api(path,{method,body});await loadView();notify('Keputusan tercatat.');
  }catch(e){notify(e.message,true);}return;
 }
 const open=event.target.closest('[data-open]');if(open){state.detail={asset:{id:open.dataset.open}};await navigate('asset');return;}
 const selectedType=event.target.closest('[data-search-type]');
 if(selectedType){
  const type=(state.catalog?.types||BUILTIN_TYPES).find(t=>t.code===selectedType.dataset.searchType&&t.enabled&&t.policy!=='BLOCKED');
  const form=document.getElementById('asset-form');if(!form||!type)return;
  document.getElementById('category-select').value=type.group;
  changeAssetType(form,state.catalog?.types||BUILTIN_TYPES,true);
  form.elements.asset_type.value=type.name;
  const search=document.getElementById('asset-type-search'),results=document.getElementById('asset-type-results');
  if(search)search.value='';if(results){results.hidden=true;results.innerHTML='';}
  form.elements.asset_type.focus();return;
 }
 const action=event.target.closest('[data-action]')?.dataset.action;
 if(action){
  if(action==='retry-connection'){const button=event.target.closest('button');if(button)button.disabled=true;await init();return;}
  if(action==='sidebar-toggle'||action==='sidebar-close'){state.mobile=action==='sidebar-toggle'?!state.mobile:false;renderShell();return;}
  if(action==='password'){state.view='password';renderShell();return;}
  if(action==='logout'){try{await api('/api/auth/logout',{method:'POST',body:{}});}catch{}state.user=null;state.catalog=null;state.view='dashboard';await init();return;}
  if(action==='new'){state.edit=false;await navigate('assetform');return;}
  if(action==='back-assets'||action==='goto-assets'){await navigate('assets');return;}
  if(action==='edit-asset'){state.edit=true;state.view='assetform';renderShell();return;}
  if(action==='detail-back'){await navigate('asset');return;}
  if(action==='edit-appraisal'){document.getElementById('page').innerHTML=appraisalForm();return;}
  if(action==='new-comparable'){document.getElementById('page').innerHTML=comparableForm();return;}
  if(action==='new-evidence'){document.getElementById('page').innerHTML=evidenceForm();return;}
  if(action==='filter'){state.search=document.getElementById('search').value;state.status=document.getElementById('status-filter').value;state.category=document.getElementById('category-filter').value;await loadView();return;}
  if(action==='offer-analysis'){
   try{const d=await api('/api/assets/'+encodeURIComponent(state.detail.asset.id)+'/offer-analysis');
     const e=document.getElementById('evidence-result');
     if(e)e.textContent=d.status==='INSUFFICIENT_EVIDENCE'?
       'Bukti belum cukup: '+d.count+' pembanding, minimum '+d.minimum_required+'. '+d.notice:
       'Harga penawaran manual (bukan nilai pasar): terendah '+money(d.lowest_offer)+
       ', median '+money(d.median_offer)+', tertinggi '+money(d.highest_offer)+
       ' dari '+d.count+' pembanding. '+d.notice;
   }catch(e){notify(e.message,true);}return;
  }

  if(action==='print'){window.print();return;}
  if(action==='export-csv'){const data=state.list?.records||[];const heads=['Referensi','Debitur','Kategori','Jenis','Kebendaan/Penjaminan','Kelayakan Bank','Lokasi/Kustodian','Status','Nilai Penilaian IDR','Nilai Setelah Haircut IDR'];const vals=data.map(a=>[a.reference_no,a.borrower,a.category_code,a.asset_type,a.collateral_kind,a.eligibility_status,a.address,a.status,a.market_value??'',a.liquidation_value??'']);
   const clean=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const csv=[heads,...vals].map(row=>row.map(clean).join(',')).join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='collman-agunan.csv';a.click();URL.revokeObjectURL(url);return;}
 }
 const rev=event.target.closest('[data-review-evidence]');
 if(rev){
  const note=window.prompt('Tuliskan hasil review minimal 10 karakter. Review tidak dapat dibatalkan.');
  if(note===null)return;
  try{
   await api('/api/assets/'+encodeURIComponent(state.detail.asset.id)+'/evidence/'+
    encodeURIComponent(rev.dataset.reviewEvidence)+'/review',{method:'POST',body:{decision:rev.dataset.decision,note}});
   await loadView();notify('Review bukti berhasil dicatat.');
  }catch(e){notify(e.message,true);}return;
 }
 const transition=event.target.closest('[data-transition]');if(transition){const action=transition.dataset.transition,note=document.getElementById('workflow-note')?.value||'';
  if(['APPROVE','REJECT'].includes(action) && !window.confirm(`Konfirmasi: ${actionText[action]}?`))return;
  try{await api(`/api/assets/${state.detail.asset.id}/transition`,{method:'POST',body:{action,note}});await loadView();notify('Workflow diperbarui.');}catch(e){notify(e.message,true);}return;}
 const del=event.target.closest('[data-delete-comparable]');if(del){if(!window.confirm('Hapus pembanding ini?'))return;try{await api(`/api/assets/${state.detail.asset.id}/comparables/${del.dataset.deleteComparable}`,{method:'DELETE',body:{}});await loadView();notify('Pembanding dihapus.');}catch(e){notify(e.message,true);}return;}
 const toggle=event.target.closest('[data-toggle-user]');if(toggle){const active=toggle.dataset.active!=='1';if(!window.confirm(active?'Aktifkan pengguna ini?':'Nonaktifkan pengguna ini?'))return;
  try{await api(`/api/users/${toggle.dataset.toggleUser}`,{method:'PUT',body:{active,role:toggle.dataset.role}});await loadView();notify('Status pengguna diperbarui.');}catch(e){notify(e.message,true);}return;}
}
document.addEventListener('change',event=>{
 const form=event.target.closest('form');
 if(form?.id==='model-run-form'&&event.target.name==='model_id'){const model=state.models.records.find(m=>m.id===event.target.value);document.getElementById('model-run-inputs').innerHTML=modelInputFields(model.method);document.getElementById('model-run-basis').innerHTML=modelRunBasis(model.method);}
 if(form?.id==='asset-form'&&['category-select','asset_type'].includes(event.target.id))changeAssetType(form,state.catalog.types,event.target.id==='category-select');
 if(form?.id==='appraisal-form'&&event.target.name==='valuation_method')document.getElementById('valuation-inputs').innerHTML=valuationInputs(event.target.value,{},state.detail.asset.currency_code||'IDR');
 if(form?.id==='catalog-policy-form'&&event.target.name==='code'){const type=state.catalog.types.find(t=>t.code===event.target.value);form.elements.policy.value=type.policy;form.elements.enabled.checked=type.enabled;}
});
document.addEventListener('input',event=>{if(event.target.id==='asset-type-search')renderCollateralSearch(event.target);});
document.addEventListener('submit',onSubmit);document.addEventListener('click',onClick);init();
