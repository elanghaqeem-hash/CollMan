import {BUILTIN_TYPES} from '../public/collateral-catalog.js';
/** Pure business rules. All rupiah figures are integers; rates are percentages. */
export const ROLES = ['ADMIN', 'MAKER', 'CHECKER', 'REVIEWER', 'APPROVER', 'AUDITOR'];
export const TYPES = BUILTIN_TYPES.map(type=>type.name);
export const RISK_FLAGS = ['banjir', 'sutet', 'tpu', 'jalur_hijau', 'akses_jalan', 'perubahan_ilegal', 'harga_usang', 'likuiditas', 'konsentrasi', 'kerusakan', 'kedaluwarsa', 'sengketa'];
export const STATUS_LABELS = {
  DRAFT: 'Draft', SUBMITTED: 'Menunggu Checker', REVIEWED: 'Menunggu Reviewer',
  RECOMMENDED: 'Menunggu Approver', APPROVED: 'Disetujui', RETURNED: 'Perlu Perbaikan', REJECTED: 'Ditolak'
};
export const ACTIONS = {
  SUBMIT: { from: ['DRAFT', 'RETURNED'], to: 'SUBMITTED', roles: ['MAKER', 'ADMIN'] },
  CHECK: { from: ['SUBMITTED'], to: 'REVIEWED', roles: ['CHECKER', 'ADMIN'] },
  RECOMMEND: { from: ['REVIEWED'], to: 'RECOMMENDED', roles: ['REVIEWER', 'ADMIN'] },
  APPROVE: { from: ['RECOMMENDED'], to: 'APPROVED', roles: ['APPROVER', 'ADMIN'] },
  REJECT: { from: ['RECOMMENDED'], to: 'REJECTED', roles: ['APPROVER', 'ADMIN'] },
  RETURN: { from: ['SUBMITTED', 'REVIEWED', 'RECOMMENDED'], to: 'RETURNED', roles: ['CHECKER', 'REVIEWER', 'APPROVER', 'ADMIN'] }
};
const trim = (value) => String(value ?? '').trim();
export function problem(message, status = 400) { const error = new Error(message); error.status = status; return error; }
export function numberIn(value, min, max, label) {
  const x = Number(value);
  if (!Number.isFinite(x) || x < min || x > max) throw problem(`${label} harus antara ${min} dan ${max}.`);
  return x;
}
export function required(value, label, max = 200) {
  const text = trim(value);
  if (!text || text.length > max) throw problem(`${label} wajib diisi (maksimal ${max} karakter).`);
  return text;
}
export function optional(value, max = 500) {
  const text = trim(value);
  if (text.length > max) throw problem(`Teks melebihi ${max} karakter.`);
  return text;
}
export function validateAsset(data, types = TYPES) {
  if (!data || typeof data !== 'object') throw problem('Data agunan tidak valid.');
  const assetType = required(data.asset_type, 'Jenis agunan', 100);
  if (!types.includes(assetType)) throw problem('Jenis agunan tidak dikenal.');
  return {
    borrower: required(data.borrower, 'Nama debitur'), asset_type: assetType,
    address: required(data.address, 'Alamat agunan', 500),
    certificate_type: optional(data.certificate_type, 50),
    certificate_no: optional(data.certificate_no, 100),
    nib: optional(data.nib, 100),
    ownership_name: optional(data.ownership_name, 150),
    land_area: numberIn(data.land_area ?? 0, 0, 1e9, 'Luas tanah'),
    building_area: numberIn(data.building_area ?? 0, 0, 1e9, 'Luas bangunan'),
    legal_status: ['BELUM_DIVERIFIKASI','SESUAI','TIDAK_SESUAI'].includes(data.legal_status) ? data.legal_status : 'BELUM_DIVERIFIKASI',
    notes: optional(data.notes, 2000)
  };
}
export function normalizeRiskFlags(flags) {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return {};
  const output = {};
  for (const key of RISK_FLAGS) output[key] = flags[key] === true;
  return output;
}
export function calculateValuation(data, weights = {}) {
  const marketValue = numberIn(data.market_value, 0, 9e15, 'Nilai pasar');
  if (!Number.isSafeInteger(marketValue)) throw problem('Nilai pasar harus bilangan bulat yang aman.');
  const base = numberIn(data.base_haircut_pct ?? 0, 0, 100, 'Haircut dasar');
  const flags = normalizeRiskFlags(data.risk_flags);
  let risk = 0;
  for (const key of RISK_FLAGS) {
    if (flags[key]) risk += numberIn(weights[key] ?? 0, 0, 100, `Bobot risiko ${key}`);
  }
  const total = Math.min(100, Math.round((base + risk) * 100) / 100);
  const liquidation = Math.round(marketValue * (1 - total / 100));
  return { market_value: marketValue, base_haircut_pct: base, risk_haircut_pct: Math.round(risk*100)/100,
    total_haircut_pct: total, liquidation_value: liquidation, risk_flags: flags };
}
export function nextWorkflow(action, status, role, createdBy, actorId) {
  const rule = ACTIONS[action];
  if (!rule || !rule.from.includes(status) || !rule.roles.includes(role)) throw problem('Aksi tidak diizinkan pada status dan peran saat ini.', 403);
  if (action === 'APPROVE' && createdBy === actorId) throw problem('Segregation of duties: Maker tidak boleh menyetujui agunannya sendiri.', 403);
  if ((action === 'CHECK' || action === 'RECOMMEND') && createdBy === actorId) throw problem('Maker tidak dapat memeriksa agunannya sendiri.', 403);
  if (action === 'RETURN' && role === 'CHECKER' && status !== 'SUBMITTED') throw problem('Checker hanya dapat mengembalikan tugas pada tahap Checker.',403);
  if (action === 'RETURN' && role === 'REVIEWER' && status !== 'REVIEWED') throw problem('Reviewer hanya dapat mengembalikan tugas pada tahap Reviewer.',403);
  if (action === 'RETURN' && role === 'APPROVER' && status !== 'RECOMMENDED') throw problem('Approver hanya dapat mengembalikan tugas pada tahap Approver.',403);
  return rule.to;
}
