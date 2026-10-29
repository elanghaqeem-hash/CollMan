/** Public diagnostics contain no database hostnames, SQL or credentials. */
export function serviceError(error) {
  if(error.message==='DATABASE_URL is missing')return {status:503,code:'DATABASE_NOT_CONFIGURED',message:'Database belum terhubung. Administrator perlu menghubungkan PostgreSQL ke aplikasi.'};
  if(error.message?.includes('Production database must configure TLS'))return {status:503,code:'DATABASE_TLS_REQUIRED',message:'Koneksi database aman belum dikonfigurasi. Hubungi administrator.'};
  if(['42P01','42703'].includes(error.code))return {status:503,code:'DATABASE_MIGRATION_REQUIRED',message:'Struktur database belum siap. Administrator perlu menjalankan migrasi PostgreSQL.'};
  if(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','28P01','3D000','53300','57P03'].includes(error.code)||error.message==='Connection terminated due to connection timeout')
    return {status:503,code:'DATABASE_UNAVAILABLE',message:'Database sedang tidak dapat diakses. Silakan coba lagi atau hubungi administrator.'};
  if(Number.isInteger(error.status)&&error.status>=400&&error.status<500)return {status:error.status,message:error.message};
  if(error.status===503)return {status:503,code:'SERVICE_NOT_CONFIGURED',message:error.message};
  return {status:500,code:'INTERNAL_ERROR',message:'Terjadi gangguan sistem. Hubungi administrator.'};
}
