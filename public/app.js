import {escapeText, currency, riskLabels, statusText, actionText} from './helpers.js';
import {collateralCategories,groupForType,typesInGroup,searchCollateralTypes} from './collateral-picker.js';
import {requestApi as api,validateMetadata} from './api-client.js';
const app=document.getElementById('app');
const state={user:null,needSetup:false,configError:'',view:'dashboard',dashboard:null,list:null,detail:null,settings:null,users:null,audit:null,search:'',status:'',edit:false,mobile:false,busy:false};
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
const NAV=[['dashboard','◫','Dashboard'],['assets','▦','Register Agunan'],['workflow','⇄','Workflow Persetujuan'],['report','▤','Laporan & Analitik'],['audit','◷','Audit Trail'],['settings','⚙','Parameter Risiko'],['users','♙','Manajemen Pengguna']];
function renderShell(){
 const nav=NAV.filter(([key])=>!['audit','settings','users'].includes(key)|| (key==='audit'?['ADMIN','AUDITOR'].includes(state.user.role):key==='settings'?true:state.user.role==='ADMIN'));
 const active=NAV.find(x=>x[0]===state.view)?.[2]||'CollMan';
 app.innerHTML=`<div class="shell"><div class="mobile-overlay" ${state.mobile?'':'hidden'} data-action="sidebar-close"></div><aside class="sidebar ${state.mobile?'open':''}"><div class="brand"><span class="brand-mark">C</span><span><strong>CollMan</strong><small>COLLATERAL MANAGEMENT</small></span></div><div><div class="nav-label">WORKSPACE</div><nav class="nav">${nav.map(([k,icon,label])=>`<button type="button" data-nav="${k}" class="${k===state.view?'active':''}"><span class="ico">${icon}</span><span>${label}</span></button>`).join('')}</nav></div><div class="side-footer"><strong>${esc(state.user.display_name)}</strong>${esc(state.user.role)} · ${esc(state.user.email)}<button type="button" data-action="password">Ganti Password</button><button type="button" data-action="logout">⇥ &nbsp; Keluar dari sistem</button></div></aside><div class="main"><header class="topbar"><div class="top-right"><button class="icon-btn mobile-menu" data-action="sidebar-toggle">☰</button><span class="breadcrumbs">Workspace / <strong>${esc(active)}</strong></span></div><div class="top-right"><span class="small muted">${esc(state.user.role)}</span><span class="top-avatar">${esc(state.user.display_name.slice(0,1).toUpperCase())}</span></div></header><div class="main-body" id="page"></div></div></div>`;
 renderContent();
}
function head(label,title,desc,buttons=''){return `<div class="pagehead"><div><div class="eyebrow">${esc(label)}</div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="actions">${buttons}</div></div>`;}
function renderContent(){const el=document.getElementById('page');if(!el)return;
 switch(state.view){case 'dashboard':el.innerHTML=dashboard();break;case 'assets':el.innerHTML=assets();break;case 'asset':el.innerHTML=assetDetail();break;case 'assetform':el.innerHTML=assetForm();break;case 'workflow':el.innerHTML=workflow();break;case 'report':el.innerHTML=report();break;case 'settings':el.innerHTML=settings();break;case 'users':el.innerHTML=users();break;case 'audit':el.innerHTML=audit();break;case 'password':el.innerHTML=passwordForm();break;default:el.innerHTML=empty('Tidak ditemukan','Pilih menu di samping.');}}
async function loadView(){
 state.busy=true;renderShell();document.getElementById('page').innerHTML=`<div class="card">Memuat data…</div>`;
 try{
  if(state.view==='dashboard'||state.view==='report')state.dashboard=await api('/api/dashboard');
  if(state.view==='assets'||state.view==='workflow')state.list=await api('/api/assets'+(state.view==='assets'?`?q=${encodeURIComponent(state.search)}&status=${encodeURIComponent(state.status)}`:''));
  if(state.view==='asset'&&state.detail?.asset?.id)state.detail=await api(`/api/assets/${state.detail.asset.id}`);
  if(state.view==='settings')state.settings=await api('/api/settings');
  if(state.view==='users')state.users=await api('/api/users');
  if(state.view==='audit')state.audit=await api('/api/audit');
  renderShell();
 }catch(e){renderShell();document.getElementById('page').innerHTML=`<div class="card bad-config">${esc(e.message)}</div>`;notify(e.message,true);}finally{state.busy=false;}}
const table=(cols,rows)=>`<div class="tablewrap"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const assetRow=x=>`<tr><td class="strong"><button type="button" class="linkbtn" data-open="${esc(x.id)}">${esc(x.reference_no)}</button></td><td><strong>${esc(x.borrower)}</strong><div class="muted small">${esc(x.asset_type)}</div></td><td class="wrap">${esc(x.address||'—')}</td><td>${money(x.market_value)}</td><td>${badge(x.status)}</td><td>${formatDate(x.updated_at)}</td></tr>`;
function dashboard(){const s=state.dashboard||{assets:{total:0,approved_market:0,approved_liquidation:0},statuses:[],recent:[]};const statuses=Object.fromEntries(s.statuses.map(x=>[x.status,x.total]));const pending=['SUBMITTED','REVIEWED','RECOMMENDED'].reduce((n,x)=>n+(statuses[x]||0),0);
 return head('OVERVIEW','Dashboard Agunan','Ringkasan portofolio agunan dan posisi proses penilaian.',(state.user.role==='MAKER'||state.user.role==='ADMIN')?btn('new','+ &nbsp; Agunan Baru','primary'):'')+
 `<div class="metrics"><div class="metric"><div class="metric-label">Total agunan terdaftar</div><div class="metric-number">${s.assets.total}</div><div class="metric-note"><span class="metric-dot"></span>Data aktual institusi</div></div><div class="metric"><div class="metric-label">Sedang dalam persetujuan</div><div class="metric-number">${pending}</div><div class="metric-note">Checker / Reviewer / Approver</div></div><div class="metric"><div class="metric-label">Nilai pasar disetujui</div><div class="metric-number">${money(s.assets.approved_market)}</div><div class="metric-note">Agunan status Approved</div></div><div class="metric"><div class="metric-label">Indikasi nilai likuidasi disetujui</div><div class="metric-number">${money(s.assets.approved_liquidation)}</div><div class="metric-note">Berdasarkan parameter institusi</div></div></div>
 <div class="split"><section class="card"><div class="card-head"><div><h2>Agunan Terbaru</h2><p>Perubahan data dan penilaian terbaru</p></div>${btn('goto-assets','Lihat seluruhnya','small')}</div>${s.recent.length?table(['Referensi','Debitur / Jenis','Status','Nilai Pasar',''],s.recent.map(a=>`<tr><td class="strong"><button class="linkbtn" data-open="${esc(a.id)}">${esc(a.reference_no)}</button></td><td>${esc(a.borrower)}<div class="muted small">${esc(a.asset_type)}</div></td><td>${badge(a.status)}</td><td>${money(a.market_value)}</td><td><button class="linkbtn" data-open="${esc(a.id)}">Buka</button></td></tr>`)):empty('Belum ada agunan','Mulai dengan mendaftarkan objek agunan pertama.')}</section>
 <section class="card"><div class="card-head"><div><h2>Distribusi Status</h2><p>Jumlah objek berdasarkan status proses</p></div></div>${Object.entries(statusText).map(([k,v])=>`<div class="progress-row"><label>${esc(v)}</label><div class="bar-track"><div class="bar-fill" style="width:${s.assets.total?Math.round((statuses[k]||0)/s.assets.total*100):0}%"></div></div><b>${statuses[k]||0}</b></div>`).join('')}<div class="notice warn" style="margin-top:20px">Quick Appraisal merupakan <b>screening awal</b>, bukan pengganti inspeksi fisik, KJPP, atau keputusan kredit akhir.</div></section></div>`;
}
function assets(){const data=state.list||{records:[],total:0};return head('DATA MASTER','Register Agunan',`${data.total} agunan sesuai filter yang dipilih.`,(state.user.role==='MAKER'||state.user.role==='ADMIN')?btn('new','+ &nbsp; Tambah Agunan','primary'):'')+
 `<div class="card"><div class="filters"><input id="search" placeholder="Cari nomor referensi, debitur, atau alamat…" value="${esc(state.search)}"><select id="status-filter" class="field" style="max-width:210px"><option value="">Semua status</option>${Object.entries(statusText).map(([k,v])=>`<option value="${k}" ${state.status===k?'selected':''}>${v}</option>`).join('')}</select><button class="btn" data-action="filter">Cari</button><button class="btn" data-action="export-csv">↓ CSV halaman ini</button></div>${data.records.length?table(['Nomor Agunan','Debitur / Jenis','Lokasi','Nilai Pasar','Status','Diperbarui'],data.records.map(assetRow)):empty('Tidak ada data','Sesuaikan filter atau tambahkan agunan baru.')}
 <div class="small muted" style="margin-top:16px">Menampilkan maksimal 50 data terbaru. Total hasil: ${data.total}.</div></div>`;}
function collateralOptionRows(category,selected=''){
 return typesInGroup(category).map(item=>'<option value="'+esc(item.name)+'" '+(item.name===selected?'selected':'')+'>'+esc(item.name)+'</option>').join('');
}
function collateralCategoryOptions(selected){
 return collateralCategories.map(g=>'<option value="'+esc(g.code)+'" '+(g.code===selected?'selected':'')+'>'+esc(g.name)+'</option>').join('');
}
function updateCollateralSearchResults(query){
 const container=document.getElementById('collateral-type-results'),input=document.getElementById('collateral-type-search');
 if(!container||!input)return;
 const hits=searchCollateralTypes(query);
 if(query.trim().length<2){container.hidden=true;container.innerHTML='';input.setAttribute('aria-expanded','false');return;}
 container.hidden=false;input.setAttribute('aria-expanded','true');
 container.innerHTML=hits.length?hits.map(t=>'<button type="button" class="collateral-result" data-choose-collateral="'+esc(t.name)+'">'+
  '<strong>'+esc(t.name)+'</strong><span>'+esc(collateralCategories.find(g=>g.code===t.group)?.name||t.group)+'</span></button>').join(''):
  '<p class="small muted" role="status">Tidak ada jenis cocok. Pilih kategori atau gunakan Lainnya dan tulis penjelasan di catatan.</p>';
}
function assetForm(){const a=state.edit?state.detail?.asset:null;const selectedType=a?.asset_type||'Tanah Kosong',selectedCategory=groupForType(selectedType);const input=(name,label,type='text',extra='')=>`<div class="form-group"><label>${label}</label><input class="field" name="${name}" type="${type}" value="${esc(a?.[name]??'')}" ${extra}></div>`;
 return head('REGISTER AGUNAN',a?'Perbarui Data Agunan':'Tambah Agunan Baru','Pastikan informasi legalitas sesuai dokumen resmi.',btn('back-assets','← Kembali'))+
 `<form id="asset-form" class="card"><h2>Identitas dan Legalitas</h2><div class="formgrid">${input('borrower','Nama debitur *','text','required maxlength="200"')}
 <div class="form-group wide"><label for="collateral-type-search">Cari jenis agunan</label><input id="collateral-type-search" class="field" type="search" autocomplete="off" placeholder="Cari: rumah, deposito, emas, kendaraan, piutang…" aria-controls="collateral-type-results" aria-expanded="false"><p class="small muted">Cari minimal 2 karakter, atau pilih kategori dan jenis di bawah.</p><div id="collateral-type-results" class="collateral-result-list" hidden></div></div>
 <div class="form-group"><label for="collateral-category">Kategori agunan *</label><select id="collateral-category" class="field">${collateralCategoryOptions(selectedCategory)}</select></div>
 <div class="form-group"><label for="asset-type">Jenis agunan *</label><select id="asset-type" class="field" name="asset_type" required>${collateralOptionRows(selectedCategory,selectedType)}</select></div>
 <div class="form-group wide"><p class="small muted">Semua kategori dapat dicatat sebagai Draft. Jenis selain tanah/bangunan belum dapat disubmit melalui workflow appraisal dasar dan memerlukan modul CollMan Enterprise, kajian legal, pengikatan, serta penilaian sesuai kebijakan bank.</p></div>
 <div class="form-group wide"><label>Alamat objek agunan *</label><textarea name="address" class="field" required maxlength="500">${esc(a?.address??'')}</textarea></div>
 ${input('certificate_type','Jenis bukti hak (SHM / HGB / dll.)','text','maxlength="50"')}${input('certificate_no','Nomor sertifikat','text','maxlength="100"')}
 ${input('nib','NIB sertifikat','text','maxlength="100"')}${input('ownership_name','Nama pemegang hak','text','maxlength="150"')}
 ${input('land_area','Luas tanah (m²)','number','step="0.01" min="0"')}${input('building_area','Luas bangunan (m²)','number','step="0.01" min="0"')}
 <div class="form-group"><label>Status verifikasi legalitas</label><select name="legal_status" class="field">${[['BELUM_DIVERIFIKASI','Belum diverifikasi'],['SESUAI','Sesuai dokumen'],['TIDAK_SESUAI','Tidak sesuai / ada temuan']].map(([v,t])=>`<option value="${v}" ${a?.legal_status===v?'selected':''}>${t}</option>`).join('')}</select></div>
 <div class="form-group wide"><label>Catatan awal</label><textarea class="field" name="notes" maxlength="2000">${esc(a?.notes??'')}</textarea></div></div><div class="divider"></div><div class="actions"><button class="btn primary" type="submit">${a?'Simpan Perubahan':'Simpan Agunan'}</button>${btn('back-assets','Batal')}</div></form>`;
}
function assetDetail(){const d=state.detail;if(!d)return empty('Agunan belum dipilih','Buka register agunan.');const a=d.asset,v=d.appraisal;
 const canEdit=(state.user.role==='ADMIN'||state.user.role==='MAKER'&&a.created_by===state.user.id)&&['DRAFT','RETURNED'].includes(a.status);
 const labels=['Maker','Checker','Reviewer','Approver'];const current={'DRAFT':0,'RETURNED':0,'SUBMITTED':1,'REVIEWED':2,'RECOMMENDED':3,'APPROVED':4,'REJECTED':4}[a.status]??0;
 const stepper=`<div class="statusbar">${labels.map((l,i)=>`<span class="step ${i<current?'done':i===current?'now':''}">${i<current?'✓ ':''}${l}</span>`).join('<span class="muted">→</span>')}</div>`;
 const fields=[['Referensi',a.reference_no],['Debitur',a.borrower],['Jenis objek',a.asset_type],['Lokasi',a.address],['Jenis hak',a.certificate_type||'—'],['Nomor sertifikat',a.certificate_no||'—'],['NIB',a.nib||'—'],['Nama pemegang hak',a.ownership_name||'—'],['Luas tanah',`${a.land_area} m²`],['Luas bangunan',`${a.building_area} m²`],['Status legalitas',a.legal_status.replaceAll('_',' ')],['Maker',a.maker_name]];
 const canTransition=Object.keys(actionText).filter(action=>{const def=actions[action];return def.from.includes(a.status)&&def.roles.includes(state.user.role)&&!(a.created_by===state.user.id&&['CHECK','RECOMMEND','APPROVE'].includes(action));});
 return head('DETAIL AGUNAN',a.reference_no,`${a.borrower} • ${a.asset_type}`,
 btn('back-assets','← Daftar Agunan')+(canEdit?btn('edit-asset','✎ Perbarui Data','primary'):''))+
 `<section class="card"><div class="card-head"><div><h2>Identitas & Legalitas Agunan</h2><p>${esc(a.address)}</p></div>${badge(a.status)}</div><div class="info-grid">${fields.map(([k,val])=>`<div><div class="key">${esc(k)}</div><div class="value">${esc(String(val))}</div></div>`).join('')}</div>${a.notes?`<div class="divider"></div><div class="small muted">Catatan: ${esc(a.notes)}</div>`:''}</section>
 <section class="card"><div class="card-head"><div><h2>Hasil Penilaian & Quick Appraisal</h2><p>Nilai pasar, haircut dan indikasi nilai likuidasi</p></div>${canEdit?btn('edit-appraisal',v?'Ubah Penilaian':'+ Tambah Penilaian','small'):''}</div>
 ${v?`<div class="metrics" style="margin-bottom:0;grid-template-columns:repeat(3,minmax(0,1fr))"><div class="kpi-mini"><div class="small muted">Nilai pasar</div><span class="val">${money(v.market_value)}</span></div><div class="kpi-mini"><div class="small muted">Total haircut</div><span class="val">${v.total_haircut_pct}%</span><div class="small muted">Dasar ${v.base_haircut_pct}% + risiko ${v.risk_haircut_pct}%</div></div><div class="kpi-mini"><div class="small muted">Indikasi likuidasi</div><span class="val">${money(v.liquidation_value)}</span></div></div><div class="section-label">Risiko lokasi yang ditandai</div><div class="legend">${Object.entries(riskLabels).filter(([k])=>v.risk_flags[k]).map(([k,l])=>`<span class="pill RETURNED">! ${esc(l)}</span>`).join('')||'<span class="muted">Belum ada bendera risiko ditandai</span>'}</div><p class="field-note" style="margin:15px 0 0">Tanggal penilaian: ${esc(v.valuation_date)}. ${esc(v.notes||'')} Nilai bersifat indikatif, menunggu validasi penilai berwenang.</p>`:empty('Penilaian belum tersedia','Isi market value dan parameter haircut sebelum mengirim untuk review.')}</section>
 <div class="two-col"><section class="card"><div class="card-head"><div><h2>Data Pembanding</h2><p>Referensi harga dari sumber yang dicatat user</p></div>${canEdit?btn('new-comparable','+ Pembanding','small'):''}</div>${d.comparables.length?table(['Pembanding','Harga penawaran',''],d.comparables.map(c=>`<tr><td class="wrap"><strong>${esc(c.description)}</strong><div class="small muted">${esc(c.address||'')}</div>${c.source_url?`<a href="${esc(c.source_url)}" target="_blank" rel="noopener noreferrer">Sumber ↗</a>`:''}</td><td>${money(c.offering_price)}</td><td>${canEdit?`<button class="linkbtn" data-delete-comparable="${esc(c.id)}">Hapus</button>`:''}</td></tr>`)):empty('Belum ada pembanding','Tambahkan sumber pembanding yang dapat diverifikasi.')}</section>
 <section class="card"><div class="card-head"><div><h2>Workflow & Keputusan</h2><p>Tahapan pemeriksaan berjenjang</p></div></div>${stepper}<div class="divider"></div>${canTransition.length?`<div class="form-group"><label>Catatan keputusan</label><textarea id="workflow-note" class="field" placeholder="Alasan pengembalian / penolakan wajib diisi."></textarea></div><div class="actions">${canTransition.map(action=>`<button class="btn ${action==='APPROVE'?'teal':action==='REJECT'?'danger':action==='RETURN'?'':'primary'}" data-transition="${action}">${actionText[action]}</button>`).join('')}</div>`:`<div class="notice warn">Tidak ada aksi workflow yang tersedia untuk peran atau status saat ini.</div>`}</section></div>
 <section class="card"><div class="card-head"><div><h2>Riwayat Persetujuan</h2><p>Jejak peristiwa workflow per agunan</p></div></div>${d.history.length?`<div class="timeline">${d.history.map(h=>`<div class="timeline-item"><strong>${esc(actionText[h.action]||h.action)}</strong> oleh ${esc(h.actor_name)} ${badge(h.to_status)}<small>${formatDate(h.created_at)} ${h.note?'• '+esc(h.note):''}</small></div>`).join('')}</div>`:empty('Belum ada tindakan workflow','Riwayat akan muncul setelah pengajuan pertama.')}</section>`;
}
const actions={SUBMIT:{from:['DRAFT','RETURNED'],roles:['MAKER','ADMIN']},CHECK:{from:['SUBMITTED'],roles:['CHECKER','ADMIN']},RECOMMEND:{from:['REVIEWED'],roles:['REVIEWER','ADMIN']},APPROVE:{from:['RECOMMENDED'],roles:['APPROVER','ADMIN']},REJECT:{from:['RECOMMENDED'],roles:['APPROVER','ADMIN']},RETURN:{from:['SUBMITTED','REVIEWED','RECOMMENDED'],roles:['CHECKER','REVIEWER','APPROVER','ADMIN']}};
function workflow(){const data=state.list||{records:[]};const pending=data.records.filter(a=>['SUBMITTED','REVIEWED','RECOMMENDED','RETURNED'].includes(a.status));return head('TASK MANAGEMENT','Workflow Persetujuan','Pantau tugas dan lakukan tindakan sesuai kewenangan masing-masing peran.')+
 `<section class="card"><div class="notice">Alur Maker → Checker → Reviewer → Approver. Sistem menolak persetujuan sendiri dan mencatat setiap perubahan status.</div>${pending.length?table(['Referensi','Debitur','Status','Aksi'],pending.map(a=>`<tr><td class="strong">${esc(a.reference_no)}</td><td>${esc(a.borrower)}</td><td>${badge(a.status)}</td><td><button class="btn small" data-open="${esc(a.id)}">Lihat tugas</button></td></tr>`)):empty('Tidak ada tugas berjalan','Tugas akan tampil saat pengajuan dikirim dari Maker.')}</section>`;}
function report(){const s=state.dashboard||{assets:{total:0,approved_market:0,approved_liquidation:0},statuses:[]};return head('PORTFOLIO INTELLIGENCE','Laporan & Analitik','Ringkasan yang dihasilkan dari database operasional, tanpa data dummy.',btn('print','⎙ Cetak halaman'))+
 `<div class="two-col"><div class="report-summary"><div class="eyebrow" style="color:#9de8da">PORTOFOLIO DISETUJUI</div><div class="report-num">${money(s.assets.approved_liquidation)}</div><p>Total indikasi likuidasi untuk objek berstatus Approved</p></div><div class="card"><div class="card-head"><h2>Ringkasan Portofolio</h2></div><div class="info-grid" style="grid-template-columns:repeat(2,1fr)"><div><div class="key">Total Agunan</div><div class="value">${s.assets.total}</div></div><div><div class="key">Nilai Pasar Disetujui</div><div class="value">${money(s.assets.approved_market)}</div></div></div><div class="divider"></div>${(s.statuses||[]).map(x=>`<div class="progress-row"><label>${esc(statusText[x.status]||x.status)}</label><div class="bar-track"><div class="bar-fill" style="width:${s.assets.total?100*x.total/s.assets.total:0}%"></div></div><b>${x.total}</b></div>`).join('')||'<p class="muted">Belum ada data.</p>'}</div></div>
 <section class="card"><h2>Ketentuan Penggunaan</h2><p class="muted" style="line-height:1.8">Output ini merupakan data internal dan hasil perhitungan berdasarkan parameter yang ditetapkan institusi. Tidak membuktikan keabsahan sertifikat, kondisi fisik, status tata ruang, atau kewajaran transaksi. Penetapan nilai akhir dan keputusan kredit tetap mengikuti kewenangan serta prosedur internal bank.</p></section>`;}
function settings(){const s=state.settings||{risk_weights:{},risk_flags:Object.keys(riskLabels)};return head('KONFIGURASI','Parameter Risiko Lokasi','Atur bobot haircut sesuai kebijakan institusi, tidak ditentukan otomatis oleh sistem.')+
 `<section class="card"><div class="notice warn"><strong>Kontrol kebijakan:</strong> Default seluruh bobot adalah 0%. Admin harus menetapkan bobot berdasarkan persetujuan internal. Perubahan tidak secara otomatis menghitung ulang appraisal lama; lakukan revisi appraisal untuk menerapkan parameter baru.</div><form id="settings-form"><div class="formgrid">${Object.entries(riskLabels).map(([key,label])=>`<div class="form-group"><label>${esc(label)} — haircut tambahan (%)</label><input class="field" type="number" min="0" max="100" step="0.01" name="${esc(key)}" value="${Number(s.risk_weights[key]||0)}" ${state.user.role==='ADMIN'?'':'disabled'}></div>`).join('')}</div>${state.user.role==='ADMIN'?`<div class="divider"></div><button class="btn primary" type="submit">Simpan Parameter</button>`:''}</form></section>`;}
function users(){const list=state.users?.records||[];return head('ADMINISTRASI','Manajemen Pengguna','Registrasi dan pembaruan peran dibatasi pada Administrator.')+
 `<div class="two-col"><section class="card"><h2>Tambah Pengguna</h2><p class="muted small">Password awal harus diganti melalui menu akun setelah login.</p><form id="user-form" class="formgrid" style="grid-template-columns:1fr"><div class="form-group"><label>Nama lengkap</label><input class="field" name="display_name" required maxlength="150"></div><div class="form-group"><label>Email</label><input class="field" type="email" name="email" required></div><div class="form-group"><label>Peran</label><select class="field" name="role">${['MAKER','CHECKER','REVIEWER','APPROVER','AUDITOR','ADMIN'].map(r=>`<option>${r}</option>`).join('')}</select></div><div class="form-group"><label>Password awal</label><input type="password" class="field" name="password" minlength="12" required></div><button class="btn primary" type="submit">Buat Pengguna</button></form></section><section class="card"><h2>Daftar Pengguna</h2>${list.length?table(['Nama & Email','Peran','Status',''],list.map(u=>`<tr><td class="wrap"><strong>${esc(u.display_name)}</strong><div class="small muted">${esc(u.email)}</div></td><td>${esc(u.role)}</td><td>${u.active?'Aktif':'Nonaktif'}</td><td>${u.id!==state.user.id?`<button class="linkbtn" data-toggle-user="${esc(u.id)}" data-active="${u.active}" data-role="${esc(u.role)}">${u.active?'Nonaktifkan':'Aktifkan'}</button>`:''}</td></tr>`)):empty('Belum ada pengguna','Buat pengguna dengan peran sesuai kebutuhan.')}</section></div>`;}
function audit(){const rows=state.audit?.records||[];return head('CONTROL & COMPLIANCE','Audit Trail','Jejak aktivitas penting untuk review dan investigasi.')+
 `<section class="card">${rows.length?table(['Waktu','Pengguna','Entitas','Aksi','Referensi'],rows.map(x=>`<tr><td>${formatDate(x.created_at)}</td><td>${esc(x.actor_name)}</td><td>${esc(x.entity_type)}</td><td><strong>${esc(x.action)}</strong></td><td class="small">${esc(x.entity_id.slice(0,13))}…</td></tr>`)):empty('Belum ada aktivitas','Aktivitas akan muncul setelah penggunaan.')}</section>`;}
function passwordForm(){return head('KEAMANAN AKUN','Ganti Password','Perubahan password akan mengakhiri seluruh sesi Anda.')+
  `<form id="password-form" class="card" style="max-width:560px"><div class="form-group"><label>Password saat ini</label><input class="field" type="password" name="old_password" required autocomplete="current-password"></div><div class="form-group"><label>Password baru</label><input class="field" type="password" name="new_password" minlength="12" required autocomplete="new-password"><div class="hint">Minimal 12 karakter, huruf besar, huruf kecil, dan angka.</div></div><button class="btn primary" type="submit">Simpan Password Baru</button></form>`;}
function appraisalForm(){const d=state.detail,v=d.appraisal;const flags=v?.risk_flags||{};const now=new Date().toISOString().slice(0,10);
 return `<form id="appraisal-form" class="card"><div class="card-head"><div><h2>${v?'Ubah Penilaian':'Input Penilaian Awal'}</h2><p>Masukkan nilai hasil kajian serta haircut berdasarkan kebijakan internal.</p></div>${btn('detail-back','✕ Tutup','small')}</div><div class="formgrid"><div class="form-group"><label>Nilai pasar (Rp) *</label><input class="field" name="market_value" type="number" min="0" step="1" required value="${Number(v?.market_value??0)}"></div><div class="form-group"><label>Haircut dasar (%) *</label><input class="field" name="base_haircut_pct" type="number" min="0" max="100" step="0.01" required value="${Number(v?.base_haircut_pct??0)}"></div><div class="form-group"><label>Tanggal penilaian</label><input class="field" name="valuation_date" type="date" value="${esc(v?.valuation_date||now)}"></div><div class="form-group wide"><label>Faktor risiko lokasi (tandai hanya jika didukung pemeriksaan)</label><div class="risk-grid">${Object.entries(riskLabels).map(([k,l])=>`<label><input type="checkbox" name="${k}" ${flags[k]?'checked':''}>${esc(l)}</label>`).join('')}</div></div><div class="form-group wide"><label>Catatan penilai / keterbatasan</label><textarea class="field" name="notes" maxlength="2000">${esc(v?.notes||'')}</textarea></div></div><div class="divider"></div><button class="btn primary" type="submit">Simpan Penilaian</button></form>`;
}
function comparableForm(){return `<form id="comparable-form" class="card"><div class="card-head"><h2>Tambahkan Referensi Pembanding</h2>${btn('detail-back','✕ Tutup','small')}</div><div class="formgrid"><div class="form-group"><label>Deskripsi pembanding *</label><input class="field" name="description" required maxlength="250"></div><div class="form-group"><label>Harga penawaran (Rp) *</label><input type="number" class="field" name="offering_price" min="1" step="1" required></div><div class="form-group wide"><label>Alamat / lokasi</label><input class="field" name="address" maxlength="500"></div><div class="form-group wide"><label>Tautan sumber pembanding</label><input class="field" type="url" name="source_url" placeholder="https://…"></div><div class="form-group"><label>Luas tanah (m²)</label><input class="field" type="number" step="0.01" min="0" name="land_area" value="0"></div><div class="form-group"><label>Luas bangunan (m²)</label><input class="field" type="number" step="0.01" min="0" name="building_area" value="0"></div></div><div class="divider"></div><button class="btn primary" type="submit">Simpan Pembanding</button></form>`;}
function formObj(form){return Object.fromEntries(new FormData(form).entries());}
async function onSubmit(event){const form=event.target;if(!form.id)return;event.preventDefault();const b=form.querySelector('[type="submit"]');if(b)b.disabled=true;
 try{
  if(form.id==='auth-form'){
   const data=formObj(form);if(state.needSetup){await api('/api/auth/bootstrap',{method:'POST',body:data});state.needSetup=false;notify('Administrator berhasil dibuat. Silakan login.');renderAuth();}
   else{await api('/api/auth/login',{method:'POST',body:data});await init();}
  }else if(form.id==='asset-form'){
   const body=formObj(form),id=state.edit?state.detail.asset.id:null;
   const result=await api(id?`/api/assets/${id}`:'/api/assets',{method:id?'PUT':'POST',body});state.edit=false;
   state.detail={asset:{id:id||result.id}};state.view='asset';await loadView();notify('Data agunan berhasil disimpan.');
  }else if(form.id==='appraisal-form'){
   const body=formObj(form);body.risk_flags=Object.fromEntries(Object.keys(riskLabels).map(k=>[k,!!form.elements[k].checked]));
   await api(`/api/assets/${state.detail.asset.id}/appraisal`,{method:'PUT',body});await loadView();notify('Penilaian berhasil disimpan.');
  }else if(form.id==='comparable-form'){
   await api(`/api/assets/${state.detail.asset.id}/comparables`,{method:'POST',body:formObj(form)});await loadView();notify('Data pembanding disimpan.');
  }else if(form.id==='settings-form'){
   await api('/api/settings',{method:'PUT',body:{risk_weights:formObj(form)}});await loadView();notify('Parameter risiko berhasil diperbarui.');
  }else if(form.id==='user-form'){
   await api('/api/users',{method:'POST',body:formObj(form)});await loadView();notify('Pengguna berhasil dibuat.');
  }else if(form.id==='password-form'){
   await api('/api/auth/password',{method:'POST',body:formObj(form)});state.user=null;state.view='dashboard';await init();notify('Password telah diubah. Silakan login kembali.');
  }
 }catch(e){notify(e.message,true);}finally{if(b)b.disabled=false;}}
async function navigate(view){state.mobile=false;state.view=view;state.edit=false;if(view==='assetform'){renderShell();return;}await loadView();}
function onAssetPickerInput(event){
 if(event.target?.id==='collateral-type-search')updateCollateralSearchResults(event.target.value);
}
function onAssetPickerChange(event){
 if(event.target?.id!=='collateral-category')return;
 const category=event.target.value;
 const select=document.getElementById('asset-type');
 if(!select)return;
 select.innerHTML=collateralOptionRows(category);
 updateCollateralSearchResults('');
 const search=document.getElementById('collateral-type-search');
 if(search)search.value='';
}
async function onClick(event){
 const chosen=event.target.closest('[data-choose-collateral]');
 if(chosen){
  const name=chosen.dataset.chooseCollateral,category=groupForType(name);
  const groupSelect=document.getElementById('collateral-category'),typeSelect=document.getElementById('asset-type');
  if(!groupSelect||!typeSelect)return;
  groupSelect.value=category;typeSelect.innerHTML=collateralOptionRows(category,name);typeSelect.value=name;
  const search=document.getElementById('collateral-type-search');if(search)search.value=name;
  const results=document.getElementById('collateral-type-results');if(results){results.hidden=true;results.innerHTML='';}
  search?.setAttribute('aria-expanded','false');typeSelect.focus();return;
 }
 const nav=event.target.closest('[data-nav]');if(nav){await navigate(nav.dataset.nav);return;}
 const open=event.target.closest('[data-open]');if(open){state.detail={asset:{id:open.dataset.open}};await navigate('asset');return;}
 const action=event.target.closest('[data-action]')?.dataset.action;
 if(action){
  if(action==='retry-connection'){const button=event.target.closest('button');if(button)button.disabled=true;await init();return;}
  if(action==='sidebar-toggle'||action==='sidebar-close'){state.mobile=action==='sidebar-toggle'?!state.mobile:false;renderShell();return;}
  if(action==='password'){state.view='password';renderShell();return;}
  if(action==='logout'){try{await api('/api/auth/logout',{method:'POST',body:{}});}catch{}state.user=null;state.view='dashboard';await init();return;}
  if(action==='new'){state.edit=false;await navigate('assetform');return;}
  if(action==='back-assets'||action==='goto-assets'){await navigate('assets');return;}
  if(action==='edit-asset'){state.edit=true;state.view='assetform';renderShell();return;}
  if(action==='detail-back'){await navigate('asset');return;}
  if(action==='edit-appraisal'){document.getElementById('page').innerHTML=appraisalForm();return;}
  if(action==='new-comparable'){document.getElementById('page').innerHTML=comparableForm();return;}
  if(action==='filter'){state.search=document.getElementById('search').value;state.status=document.getElementById('status-filter').value;await loadView();return;}
  if(action==='print'){window.print();return;}
  if(action==='export-csv'){const data=state.list?.records||[];const heads=['Referensi','Debitur','Jenis','Alamat','Status','Nilai Pasar','Indikasi Likuidasi'];const vals=data.map(a=>[a.reference_no,a.borrower,a.asset_type,a.address,a.status,a.market_value||0,a.liquidation_value||0]);
   const clean=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const csv=[heads,...vals].map(row=>row.map(clean).join(',')).join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='collman-agunan.csv';a.click();URL.revokeObjectURL(url);return;}
 }
 const transition=event.target.closest('[data-transition]');if(transition){const action=transition.dataset.transition,note=document.getElementById('workflow-note')?.value||'';
  if(['APPROVE','REJECT'].includes(action) && !window.confirm(`Konfirmasi: ${actionText[action]}?`))return;
  try{await api(`/api/assets/${state.detail.asset.id}/transition`,{method:'POST',body:{action,note}});await loadView();notify('Workflow diperbarui.');}catch(e){notify(e.message,true);}return;}
 const del=event.target.closest('[data-delete-comparable]');if(del){if(!window.confirm('Hapus pembanding ini?'))return;try{await api(`/api/assets/${state.detail.asset.id}/comparables/${del.dataset.deleteComparable}`,{method:'DELETE',body:{}});await loadView();notify('Pembanding dihapus.');}catch(e){notify(e.message,true);}return;}
 const toggle=event.target.closest('[data-toggle-user]');if(toggle){const active=toggle.dataset.active!=='1';if(!window.confirm(active?'Aktifkan pengguna ini?':'Nonaktifkan pengguna ini?'))return;
  try{await api(`/api/users/${toggle.dataset.toggleUser}`,{method:'PUT',body:{active,role:toggle.dataset.role}});await loadView();notify('Status pengguna diperbarui.');}catch(e){notify(e.message,true);}return;}
}
document.addEventListener('submit',onSubmit);document.addEventListener('click',onClick);document.addEventListener('input',onAssetPickerInput);document.addEventListener('change',onAssetPickerChange);init();
