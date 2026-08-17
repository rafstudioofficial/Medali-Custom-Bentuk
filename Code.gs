/**
 * ================================================================
 * BACKEND GOOGLE APPS SCRIPT — REKAP LAPORAN PENGERJAAN MEDALI
 * ================================================================
 * CARA PAKAI:
 * 1. Buat Google Sheet baru (kosong).
 * 2. Buka menu Extensions > Apps Script.
 * 3. Hapus isi default "Code.gs", tempel seluruh isi file ini.
 * 4. Klik Deploy > New deployment.
 *    - Pilih tipe: "Web app"
 *    - Execute as     : Me
 *    - Who has access : Anyone
 * 5. Klik Deploy, izinkan akses (Authorize access) saat diminta.
 *    PENTING: karena sekarang script ini juga memakai Google Drive
 *    (untuk menyimpan foto), Google akan minta izin tambahan untuk
 *    akses Drive — klik Allow/Izinkan.
 * 6. Copy URL Web App yang muncul (formatnya: https://script.google.com/macros/s/XXXX/exec)
 * 7. Tempel URL tersebut ke variabel GAS_URL di file script.js (frontend).
 *
 * CATATAN UNTUK YANG SUDAH PERNAH DEPLOY SEBELUMNYA:
 * Kalau Anda mengedit Code.gs yang sudah pernah di-deploy, perubahan
 * TIDAK otomatis aktif di URL /exec yang lama. Anda harus buka
 * Deploy > Manage deployments > klik ikon pensil pada deployment yang
 * ada > Version: "New version" > Deploy. URL-nya tetap sama, isinya
 * yang diperbarui.
 *
 * Sheet "Data" beserta headernya akan dibuat otomatis saat pertama kali
 * fungsi ini dijalankan (lihat getSheet_()), jadi tidak perlu dibuat manual.
 * ================================================================
 */

const SHEET_NAME = 'Data';

// Urutan kolom di Google Sheet — HARUS konsisten dengan rowToObject_() & fungsi CRUD di bawah.
const COLUMNS = [
  'ID', 'Foto', 'Mitra', 'Produk', 'WarnaDasar', 'WarnaTambahan',
  'OrderMasuk', 'BatasAkhir', 'Status', 'Ceklis', 'CeklisTanggal', 'CreatedAt', 'Jumlah', 'NamaMedali',
  'FileMaster', 'FileMasterNama'
];
// Catatan: 'Jumlah' & 'NamaMedali' sengaja ditaruh PALING AKHIR (bukan
// disisipkan di tengah) supaya baris data yang sudah lebih dulu ada di sheet
// tidak bergeser posisinya.
// Catatan lain: kolom 'Ceklis' & 'CeklisTanggal' TIDAK dipakai lagi oleh
// aplikasi (fiturnya dihapus) — sengaja dibiarkan tetap ada di sheet supaya
// posisi kolom setelahnya (CreatedAt, Jumlah, NamaMedali) tidak ikut geser.
// 'FileMaster' (URL download di Drive) & 'FileMasterNama' (nama file asli,
// buat ditampilkan) juga sengaja ditaruh PALING AKHIR dengan alasan yang sama.

// Sheet terpisah untuk "Order Tambahan" (skema: 1 produk medali utama bisa
// punya beberapa order tambahan susulan; setiap order tambahan tetap ngikut
// Mitra & Produk dari data utama, hanya beda warna & jumlah).
const SHEET_NAME_TAMBAHAN = 'OrderTambahan';
const COLUMNS_TAMBAHAN = ['ID', 'ParentID', 'WarnaDasar', 'WarnaTambahan', 'Jumlah', 'CreatedAt', 'TanggalOrder'];
// Catatan: 'TanggalOrder' sengaja ditaruh PALING AKHIR (bukan disisipkan di
// tengah) dengan alasan yang sama seperti 'Jumlah' di atas. Ini tanggal order
// tambahan tsb masuk (bisa diisi/diedit user) — beda dari 'CreatedAt' yang
// murni timestamp sistem saat baris dibuat.

// Nama folder Google Drive tempat semua foto medali disimpan.
// Dibuat otomatis (di My Drive) kalau belum ada — lihat ensureFotoFolder_().
const FOTO_FOLDER_NAME = 'Foto Medali (Rekap Pengerjaan)';

// Nama folder Google Drive tempat semua file master (desain asli, siap
// download kembali — bisa PDF, CDR, AI, ZIP, dll) disimpan.
const FILE_MASTER_FOLDER_NAME = 'File Master Medali (Rekap Pengerjaan)';

/* ================================================================
   HELPER
   ================================================================ */

/** Ambil sheet "Data". Jika belum ada, buat otomatis beserta header. */
function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Bungkus response sebagai JSON. */
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Konversi 1 baris sheet (array) menjadi object JS yang rapi untuk frontend. */
function rowToObject_(row) {
  return {
    id: row[0],
    foto: row[1],
    mitra: row[2],
    produk: row[3],
    warnaDasar: row[4],
    warnaTambahan: row[5],
    orderMasuk: row[6],
    batasAkhir: row[7],
    status: row[8],
    ceklis: row[9] === true || row[9] === 'true' || row[9] === 'TRUE',
    ceklisTanggal: row[10],
    createdAt: row[11],
    jumlah: row[12] === '' || row[12] === undefined ? 0 : Number(row[12]),
    namaMedali: row[13],
    fileMaster: row[14],
    fileMasterNama: row[15]
  };
}

/** Ambil sheet "OrderTambahan". Jika belum ada, buat otomatis beserta header. */
function getSheetTambahan_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME_TAMBAHAN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_TAMBAHAN);
    sheet.appendRow(COLUMNS_TAMBAHAN);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Konversi 1 baris sheet OrderTambahan (array) menjadi object JS. */
function rowToObjectTambahan_(row) {
  return {
    id: row[0],
    parentId: row[1],
    warnaDasar: row[2],
    warnaTambahan: row[3],
    jumlah: row[4] === '' || row[4] === undefined ? 0 : Number(row[4]),
    createdAt: row[5],
    tanggalOrder: row[6]
  };
}

/** Cari nomor baris (1-based, termasuk header) berdasarkan ID. -1 jika tidak ditemukan. */
function findRowIndexById_(sheet, id) {
  const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      return i + 2; // +2 karena data mulai baris ke-2 (baris 1 = header)
    }
  }
  return -1;
}

/* ================================================================
   FOTO: SIMPAN KE GOOGLE DRIVE (BUKAN LANGSUNG DI SEL SHEET)
   ------------------------------------------------------------------
   Kenapa: 1 sel Google Sheets punya batas keras 50.000 karakter.
   Foto hasil upload (base64) sangat mudah melewati itu walau sudah
   dikompres di frontend, dan begitu batas itu terlampaui, penulisan
   ke sheet gagal di level platform — di browser ini sering muncul
   sebagai "Failed to fetch" (bukan pesan error yang jelas).
   Solusinya: file foto disimpan sebagai file asli di Google Drive,
   dan yang disimpan di sel Sheet hanya URL-nya (pendek & aman).
   ================================================================ */

/**
 * Ambil folder Drive tempat foto disimpan; buat otomatis kalau belum ada.
 * ID folder di-cache di Script Properties supaya request berikutnya tidak
 * perlu getFoldersByName() lagi (itu salah satu yang bikin submit terasa lambat).
 */
function ensureFotoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cachedId = props.getProperty('FOTO_FOLDER_ID');

  if (cachedId) {
    try {
      return DriveApp.getFolderById(cachedId);
    } catch (err) {
      // Folder cache mungkin sudah dihapus manual di Drive, lanjut ke pencarian/buat baru di bawah.
    }
  }

  let folder;
  const folders = DriveApp.getFoldersByName(FOTO_FOLDER_NAME);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(FOTO_FOLDER_NAME);
  }

  // Sharing di-set SEKALI di level folder (bukan per file) supaya file yang
  // dibuat di dalamnya otomatis ikut bisa diakses "Anyone with link" tanpa
  // perlu panggilan setSharing terpisah tiap upload foto (itu yang paling lambat).
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  props.setProperty('FOTO_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * Kalau `fotoValue` berupa data URL (hasil upload file, format
 * "data:image/...;base64,...."), decode lalu simpan sebagai file
 * di Drive, dan kembalikan URL gambar yang bisa dipakai langsung
 * di tag <img>. Kalau `fotoValue` BUKAN data URL (mis. sudah berupa
 * link https://... atau string kosong), dikembalikan apa adanya.
 */
function resolveFoto_(fotoValue, id) {
  if (!fotoValue || typeof fotoValue !== 'string' || !fotoValue.startsWith('data:')) {
    return fotoValue || '';
  }

  const match = fotoValue.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.*)$/);
  if (!match) {
    // Bukan format data URL gambar yang valid, jangan dipaksa disimpan ke Drive.
    return fotoValue;
  }
  const mimeType = match[1];
  const base64Data = match[2];
  const ext = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const fileName = 'medali-' + id + '.' + ext;

  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);

  const folder = ensureFotoFolder_();

  // Kalau sebelumnya sudah ada file foto untuk ID yang sama, hapus dulu
  // (dipindah ke trash) supaya Drive tidak menumpuk file lama tiap kali diedit.
  const existing = folder.getFilesByName(fileName);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }

  const file = folder.createFile(blob);
  // Tidak perlu file.setSharing() di sini lagi — file otomatis ikut permission
  // "Anyone with link" dari folder induknya (di-set sekali di ensureFotoFolder_()).

  // Sengaja TANPA parameter &sz= di sini — ukuran thumbnail ditentukan oleh
  // frontend sesuai konteks tampilan (lihat fotoUrl() di script.js), supaya
  // thumbnail kecil di grid/tabel tidak ikut minta resolusi besar yang lama digenerate.
  return 'https://drive.google.com/thumbnail?id=' + file.getId();
}

/* ================================================================
   FILE MASTER: SIMPAN KE GOOGLE DRIVE
   ------------------------------------------------------------------
   Sama seperti foto (disimpan sebagai file asli di Drive, bukan di sel
   Sheet), bedanya file master boleh jenis apa saja (PDF, CDR, AI, ZIP,
   dst) — bukan cuma gambar — dan yang disimpan di sel Sheet adalah link
   downloadnya (uc?export=download) supaya klik = langsung unduh.
   ================================================================ */

/** Ambil folder Drive tempat file master disimpan; buat otomatis kalau belum ada. */
function ensureFileMasterFolder_() {
  const props = PropertiesService.getScriptProperties();
  const cachedId = props.getProperty('FILE_MASTER_FOLDER_ID');

  if (cachedId) {
    try {
      return DriveApp.getFolderById(cachedId);
    } catch (err) {
      // Folder cache mungkin sudah dihapus manual di Drive, lanjut ke pencarian/buat baru di bawah.
    }
  }

  let folder;
  const folders = DriveApp.getFoldersByName(FILE_MASTER_FOLDER_NAME);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(FILE_MASTER_FOLDER_NAME);
  }

  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty('FILE_MASTER_FOLDER_ID', folder.getId());
  return folder;
}

/* ================================================================
   UPLOAD LANGSUNG KE DRIVE (untuk file besar, > beberapa MB)
   ------------------------------------------------------------------
   Cara base64 lewat POST (createData_/updateData_) mentok di batas
   ukuran request & waktu eksekusi Apps Script — jadi TIDAK dipakai
   untuk file besar. Alurnya untuk file besar:
   1. Browser minta "sesi upload" ke sini (action: initUpload) — yang
      dikirim cuma nama & tipe file, BUKAN isi file-nya (jadi ringan).
   2. Fungsi ini minta "resumable upload session" ke Drive API pakai
      identitas akun pemilik script (ScriptApp.getOAuthToken()), lalu
      balikin URL sesi sementara itu ke browser.
   3. Browser upload file besarnya LANGSUNG ke URL sesi itu (PUT ke
      www.googleapis.com, BUKAN ke Apps Script) — jadi sama sekali
      tidak kena limit Apps Script, walau filenya ratusan MB.
   4. File otomatis masuk ke folder Drive yang sama seperti upload
      biasa, dan otomatis ikut permission "Anyone with link" dari
      folder induknya (sudah di-set sekali di atas / ensureFotoFolder_()).
   ================================================================ */
function initUploadSession_(payload) {
  if (!payload.fileName) {
    return { success: false, message: 'Nama file wajib diisi untuk memulai sesi upload' };
  }

  const folder = payload.folderType === 'foto' ? ensureFotoFolder_() : ensureFileMasterFolder_();

  const metadata = {
    name: payload.fileName,
    parents: [folder.getId()]
  };

  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: {
        Authorization: 'Bearer ' + token,
        'X-Upload-Content-Type': payload.mimeType || 'application/octet-stream'
      },
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true
    }
  );

  if (response.getResponseCode() !== 200) {
    return { success: false, message: 'Gagal membuat sesi upload Drive: ' + response.getContentText() };
  }

  const headers = response.getHeaders();
  const uploadUrl = headers['Location'] || headers['location'];
  if (!uploadUrl) {
    return { success: false, message: 'Google Drive tidak mengembalikan URL sesi upload' };
  }
  return { success: true, uploadUrl: uploadUrl };
}

/**
 * Kalau `fileValue` berupa data URL (hasil upload file, format
 * "data:<mime>;base64,...." — <mime> boleh KOSONG, karena browser sering
 * tidak bisa menebak MIME type untuk ekstensi yang jarang dipakai seperti
 * .dxf, .cdr, dll), decode lalu simpan sebagai file di Drive folder File
 * Master, dan kembalikan link downloadnya. Kalau BUKAN data URL (mis. sudah
 * berupa link https://... atau string kosong), dikembalikan apa adanya.
 *
 * `originalName` (nama file asli dari komputer user, mis. "desain.dxf")
 * dipakai buat nentuin EKSTENSI file yang disimpan — lebih diandalkan
 * daripada MIME type, yang sering kosong/salah tebak untuk format CAD/desain.
 */
function resolveFileMaster_(fileValue, id, originalName) {
  if (!fileValue || typeof fileValue !== 'string' || !fileValue.startsWith('data:')) {
    return fileValue || '';
  }

  // Mime boleh kosong: cocok untuk "data:;base64,...." maupun "data:application/pdf;base64,....".
  const match = fileValue.match(/^data:([^;]*);base64,([\s\S]*)$/);
  if (!match) {
    return fileValue; // bukan format data URL yang valid, jangan dipaksa disimpan
  }
  const mimeType = match[1] || 'application/octet-stream';
  const base64Data = match[2];

  // Prioritas 1: ekstensi dari nama file asli (paling akurat, apapun formatnya).
  // Prioritas 2: tebak dari MIME type kalau nama file tidak ada/tidak punya ekstensi.
  const extFromName = (originalName || '').match(/\.([a-zA-Z0-9]+)$/);
  const ext = extFromName
    ? extFromName[1].toLowerCase()
    : (mimeType.split('/')[1] || 'bin').split('+')[0];

  const fileName = 'filemaster-' + id + '-' + new Date().getTime() + '.' + ext;

  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);

  const folder = ensureFileMasterFolder_();

  // Hapus file master LAMA untuk ID yang sama sebelum simpan yang baru (dicari
  // dari prefix nama file, bukan nama persis, karena ekstensi bisa beda tiap upload).
  const prefix = 'filemaster-' + id + '-';
  const existingFiles = folder.getFiles();
  while (existingFiles.hasNext()) {
    const f = existingFiles.next();
    if (f.getName().indexOf(prefix) === 0) f.setTrashed(true);
  }

  const file = folder.createFile(blob);
  // export=download supaya link-nya langsung memicu unduhan, bukan cuma preview.
  return 'https://drive.google.com/uc?export=download&id=' + file.getId();
}


/* ================================================================
   ENTRY POINT: GET — membaca seluruh data
   Dipanggil dari frontend dengan: fetch(GAS_URL)
   ================================================================ */
function doGet(e) {
  try {
    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return jsonResponse_({ success: true, data: [] });
    }
    const values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
    const data = values
      .filter(row => row[0] !== '' && row[0] !== null)
      .map(rowToObject_);

    // Ambil semua order tambahan, kelompokkan per parentId (ID produk utama).
    const tambahanByParent = getAllTambahanGroupedByParent_();

    // Gabungkan: tiap produk utama dapat array `orderTambahan` (kosong kalau
    // tidak ada) dan `total` = jumlah utama + jumlah seluruh order tambahannya.
    data.forEach(item => {
      const list = tambahanByParent[item.id] || [];
      item.orderTambahan = list;
      item.total = (item.jumlah || 0) + list.reduce((sum, t) => sum + (t.jumlah || 0), 0);
    });

    return jsonResponse_({ success: true, data: data });
  } catch (err) {
    return jsonResponse_({ success: false, message: err.message });
  }
}

/** Baca sheet OrderTambahan, kembalikan object { parentId: [order,...] }, terurut sesuai CreatedAt. */
function getAllTambahanGroupedByParent_() {
  const sheet = getSheetTambahan_();
  const lastRow = sheet.getLastRow();
  const grouped = {};
  if (lastRow < 2) return grouped;

  const values = sheet.getRange(2, 1, lastRow - 1, COLUMNS_TAMBAHAN.length).getValues();
  values
    .filter(row => row[0] !== '' && row[0] !== null)
    .map(rowToObjectTambahan_)
    .forEach(t => {
      if (!grouped[t.parentId]) grouped[t.parentId] = [];
      grouped[t.parentId].push(t);
    });
  return grouped;
}

/* ================================================================
   ENTRY POINT: POST — create / update / delete
   Body JSON dari frontend: { action: 'create' | 'update' | 'delete', payload: {...} }
   ================================================================ */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload || {};
    const sheet = getSheet_();

    let result;
    switch (action) {
      case 'create':
        result = createData_(sheet, payload);
        break;
      case 'update':
        result = updateData_(sheet, payload);
        break;
      case 'delete':
        result = deleteData_(sheet, payload);
        break;
      case 'createTambahan':
        result = createDataTambahan_(payload);
        break;
      case 'updateTambahan':
        result = updateDataTambahan_(payload);
        break;
      case 'deleteTambahan':
        result = deleteDataTambahan_(payload);
        break;
      case 'initUpload':
        result = initUploadSession_(payload);
        break;
      default:
        result = { success: false, message: 'Aksi tidak dikenal: ' + action };
    }
    return jsonResponse_(result);
  } catch (err) {
    return jsonResponse_({ success: false, message: err.message });
  }
}

/* ================================================================
   CRUD IMPLEMENTATION
   ================================================================ */

/** Tambah 1 baris data baru. */
function createData_(sheet, payload) {
  const id = 'MDL-' + new Date().getTime();
  const foto = resolveFoto_(payload.foto, id);
  const fileMaster = resolveFileMaster_(payload.fileMaster, id, payload.fileMasterNama);

  sheet.appendRow([
    id,
    foto,
    payload.mitra || '',
    payload.produk || '',
    payload.warnaDasar || '',
    payload.warnaTambahan || '',
    payload.orderMasuk || '',
    payload.batasAkhir || '',
    payload.status || 'Proses',
    false,
    '',
    new Date(),
    payload.jumlah || 0,
    payload.namaMedali || '',
    fileMaster,
    fileMaster ? (payload.fileMasterNama || '') : ''
  ]);
  return { success: true, message: 'Data berhasil ditambahkan', id: id };
}

/** Update baris berdasarkan ID. Field yang tidak dikirim akan tetap memakai nilai lama. */
function updateData_(sheet, payload) {
  if (!payload.id) {
    return { success: false, message: 'ID wajib diisi untuk update' };
  }
  const rowIndex = findRowIndexById_(sheet, payload.id);
  if (rowIndex === -1) {
    return { success: false, message: 'Data dengan ID ' + payload.id + ' tidak ditemukan' };
  }

  const current = sheet.getRange(rowIndex, 1, 1, COLUMNS.length).getValues()[0];

  const foto = payload.foto !== undefined
    ? resolveFoto_(payload.foto, payload.id)
    : current[1];

  const fileMaster = payload.fileMaster !== undefined
    ? resolveFileMaster_(payload.fileMaster, payload.id, payload.fileMasterNama)
    : current[14];
  const fileMasterNama = payload.fileMaster !== undefined
    ? (fileMaster ? (payload.fileMasterNama || '') : '') // file dihapus/diganti -> nama ikut sinkron
    : valueOr_(payload.fileMasterNama, current[15]);

  const merged = [
    current[0], // ID tidak berubah
    foto,
    valueOr_(payload.mitra, current[2]),
    valueOr_(payload.produk, current[3]),
    valueOr_(payload.warnaDasar, current[4]),
    valueOr_(payload.warnaTambahan, current[5]),
    valueOr_(payload.orderMasuk, current[6]),
    valueOr_(payload.batasAkhir, current[7]),
    valueOr_(payload.status, current[8]),
    payload.ceklis !== undefined ? payload.ceklis : current[9],
    valueOr_(payload.ceklisTanggal, current[10]),
    current[11], // CreatedAt tidak berubah
    valueOr_(payload.jumlah, current[12]),
    valueOr_(payload.namaMedali, current[13]),
    fileMaster,
    fileMasterNama
  ];

  sheet.getRange(rowIndex, 1, 1, COLUMNS.length).setValues([merged]);
  return { success: true, message: 'Data berhasil diperbarui' };
}

/** Ambil payload[key] jika ada (termasuk string kosong yang sengaja dikirim), selain itu pakai fallback. */
function valueOr_(payloadValue, fallback) {
  return payloadValue !== undefined ? payloadValue : fallback;
}

/** Hapus baris berdasarkan ID. */
function deleteData_(sheet, payload) {
  if (!payload.id) {
    return { success: false, message: 'ID wajib diisi untuk hapus data' };
  }
  const rowIndex = findRowIndexById_(sheet, payload.id);
  if (rowIndex === -1) {
    return { success: false, message: 'Data dengan ID ' + payload.id + ' tidak ditemukan' };
  }
  sheet.deleteRow(rowIndex);
  return { success: true, message: 'Data berhasil dihapus' };
}

/* ================================================================
   CRUD: ORDER TAMBAHAN
   ------------------------------------------------------------------
   Order tambahan SELALU menempel ke 1 produk medali utama (parentId).
   Field Mitra, Produk, dsb TIDAK disimpan ulang di sini — cukup ambil
   dari data utama saat ditampilkan di frontend (irit kolom & selalu
   konsisten dengan data induknya).
   ================================================================ */

/** Tambah 1 order tambahan baru untuk produk utama tertentu. */
function createDataTambahan_(payload) {
  if (!payload.parentId) {
    return { success: false, message: 'parentId wajib diisi untuk order tambahan' };
  }

  // Pastikan produk utamanya benar-benar ada.
  const mainSheet = getSheet_();
  if (findRowIndexById_(mainSheet, payload.parentId) === -1) {
    return { success: false, message: 'Produk utama dengan ID ' + payload.parentId + ' tidak ditemukan' };
  }

  const sheet = getSheetTambahan_();
  const id = 'TMB-' + new Date().getTime();

  sheet.appendRow([
    id,
    payload.parentId,
    payload.warnaDasar || '',
    payload.warnaTambahan || '',
    payload.jumlah || 0,
    new Date(),
    payload.tanggalOrder || new Date() // kalau tidak dikirim dari frontend, pakai hari ini
  ]);
  return { success: true, message: 'Order tambahan berhasil ditambahkan', id: id };
}

/** Update 1 order tambahan berdasarkan ID. */
function updateDataTambahan_(payload) {
  if (!payload.id) {
    return { success: false, message: 'ID wajib diisi untuk update order tambahan' };
  }
  const sheet = getSheetTambahan_();
  const rowIndex = findRowIndexById_(sheet, payload.id);
  if (rowIndex === -1) {
    return { success: false, message: 'Order tambahan dengan ID ' + payload.id + ' tidak ditemukan' };
  }

  const current = sheet.getRange(rowIndex, 1, 1, COLUMNS_TAMBAHAN.length).getValues()[0];
  const merged = [
    current[0], // ID tidak berubah
    current[1], // parentId tidak berubah (order tambahan tidak dipindah produk)
    valueOr_(payload.warnaDasar, current[2]),
    valueOr_(payload.warnaTambahan, current[3]),
    valueOr_(payload.jumlah, current[4]),
    current[5], // CreatedAt tidak berubah
    valueOr_(payload.tanggalOrder, current[6])
  ];
  sheet.getRange(rowIndex, 1, 1, COLUMNS_TAMBAHAN.length).setValues([merged]);
  return { success: true, message: 'Order tambahan berhasil diperbarui' };
}

/** Hapus 1 order tambahan berdasarkan ID. */
function deleteDataTambahan_(payload) {
  if (!payload.id) {
    return { success: false, message: 'ID wajib diisi untuk hapus order tambahan' };
  }
  const sheet = getSheetTambahan_();
  const rowIndex = findRowIndexById_(sheet, payload.id);
  if (rowIndex === -1) {
    return { success: false, message: 'Order tambahan dengan ID ' + payload.id + ' tidak ditemukan' };
  }
  sheet.deleteRow(rowIndex);
  return { success: true, message: 'Order tambahan berhasil dihapus' };
}
