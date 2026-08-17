/* ================================================================
   REKAP PENGERJAAN MEDALI - FRONTEND LOGIC (vanilla JS)
   ================================================================ */

/* ---------------- KONFIGURASI ---------------- */
// GANTI dengan URL Web App hasil Deploy Google Apps Script Anda (lihat Code.gs)
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbyrMp_Xm4Vrl81Gz672WCI-iJqdIHF5yk5LF81soE4_H20xSJjacbQabMxEjqfb7lgkcQ/exec";

const PASSWORD_INPUT = "rafstudio"; // password sederhana untuk menu Input Data
const AUTH_KEY = "medali_auth"; // key sessionStorage

const MITRA_LIST = ["AA Kreatif", "Hanandhya", "Nakaba", "Sally", "Zahraquds"];
const PRODUK_LIST = ["Medali Resin", "Medali Logam"];

const SECTION_TITLES = {
  dashboard: "Dashboard",
  input: "Input Data Medali",
  filemaster: "File Master",
};

/* ---------------- STATE ---------------- */
let medaliData = []; // cache seluruh data dari Google Sheet
let editingId = null; // ID data yang sedang diedit (null = mode tambah baru)
let fotoBase64 = ""; // hasil konversi file foto -> base64 (jika user upload file)

// State untuk field File Master (opsional) di form Input Data.
let fileMasterBase64 = ""; // base64 file BARU yang baru saja dipilih user (kalau ada)
let fileMasterNamaBaru = ""; // nama asli file baru tsb
let fileMasterExisting = { url: "", nama: "" }; // file master yang SUDAH tersimpan (saat mode Edit)
let removeFileMaster = false; // flag: user klik "Hapus File Master" (tanpa pilih file baru)

// Filter aktif untuk Dashboard (satu-satunya halaman tampilan data sekarang;
// menu Rekap Medali dihapus karena fungsinya sudah tercakup di Dashboard).
// mode: '' (semua) | 'bulan' | 'tanggal'. Filter tanggal memakai field Order Masuk.
let dashFilters = {
  mode: "",
  bulan: "",
  tanggal: "",
  mitra: "",
  produk: "",
  search: "",
};
// Filter aktif untuk halaman File Master (struktur sama persis, dipakai lewat bindFilterGroup).
let fileFilters = {
  mode: "",
  bulan: "",
  tanggal: "",
  mitra: "",
  produk: "",
  search: "",
};
// Filter aktif untuk tabel "Data Terbaru" di menu Input Data (struktur sama persis).
let inputFilters = {
  mode: "",
  bulan: "",
  tanggal: "",
  mitra: "",
  produk: "",
  search: "",
};

/* ================================================================
   INISIALISASI
   ================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("yearNow").textContent = new Date().getFullYear();

  populateDropdowns();
  bindNavigation();
  bindSidebarToggle();
  bindLoginEvents();
  bindFormEvents();
  bindTambahanFormEvents();
  bindRefreshButton();
  bindFilterEvents();
  bindDetailPdfButton();

  checkInputAccess(); // tampilkan form / login sesuai status sessionStorage
  showSection("dashboard");
  loadDataFromServer(); // ambil data awal dari Google Sheet
});

/* ================================================================
   NAVIGASI (SPA - toggle antar section)
   ================================================================ */
function bindNavigation() {
  document.querySelectorAll(".sidebar [data-section]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      showSection(link.getAttribute("data-section"));
    });
  });
}

function showSection(name) {
  document
    .querySelectorAll(".content-section")
    .forEach((sec) => sec.classList.add("d-none"));
  document.getElementById("section-" + name).classList.remove("d-none");

  document
    .querySelectorAll(".sidebar .nav-link")
    .forEach((link) => link.classList.remove("active"));
  const activeLink = document.querySelector(
    `.sidebar .nav-link[data-section="${name}"]`,
  );
  if (activeLink) activeLink.classList.add("active");

  document.getElementById("pageTitle").textContent = SECTION_TITLES[name] || "";

  // Refresh tampilan tiap kali pindah menu, memakai data yang sudah ada di cache
  if (name === "dashboard") renderDashboard();
  if (name === "input") {
    checkInputAccess();
    if (isAuthenticated()) renderInputTable();
  }
  if (name === "filemaster") {
    checkFileMasterAccess();
    if (isAuthenticated()) renderFileMaster();
  }
}

function bindSidebarToggle() {
  document.getElementById("sidebarToggleTop").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("toggled");
  });
}

function bindRefreshButton() {
  document
    .getElementById("refreshBtn")
    .addEventListener("click", loadDataFromServer);
}

/* ================================================================
   FILTER (Dashboard) - per Bulan, per Tanggal, per Mitra, per Produk
   Catatan: filter tanggal memakai field "Order Masuk".
   ================================================================ */
function bindFilterEvents() {
  bindFilterGroup("dash", dashFilters, renderDashboard);
  bindFilterGroup("file", fileFilters, renderFileMaster);
  bindFilterGroup("input", inputFilters, renderInputTable);
}

/**
 * Pasang event listener untuk satu grup filter (saat ini hanya dipakai prefix 'dash').
 * state = object filter terkait (dashFilters), dimutasi langsung.
 * onChange = fungsi render yang dipanggil ulang tiap filter berubah.
 */
function bindFilterGroup(prefix, state, onChange) {
  const modeSelect = document.getElementById(prefix + "FilterMode");
  const monthInput = document.getElementById(prefix + "FilterMonth");
  const dateInput = document.getElementById(prefix + "FilterDate");
  const dateLabel = document.getElementById(prefix + "FilterDateLabel");
  const mitraSelect = document.getElementById(prefix + "FilterMitra");
  const produkSelect = document.getElementById(prefix + "FilterProduk");
  const resetBtn = document.getElementById(prefix + "FilterReset");
  // Kolom pencarian teks bebas — opsional, cuma ada di beberapa grup filter (mis. Input Data).
  const searchInput = document.getElementById(prefix + "FilterSearch");

  modeSelect.addEventListener("change", () => {
    state.mode = modeSelect.value;
    // Tampilkan combo box tanggal yang sesuai: input bulan ATAU input tanggal spesifik.
    if (state.mode === "bulan") {
      dateLabel.textContent = "Bulan";
      monthInput.classList.remove("d-none");
      dateInput.classList.add("d-none");
    } else if (state.mode === "tanggal") {
      dateLabel.textContent = "Tanggal";
      dateInput.classList.remove("d-none");
      monthInput.classList.add("d-none");
    } else {
      dateLabel.innerHTML = "&nbsp;";
      monthInput.classList.add("d-none");
      dateInput.classList.add("d-none");
    }
    onChange();
  });

  monthInput.addEventListener("change", () => {
    state.bulan = monthInput.value;
    onChange();
  });

  dateInput.addEventListener("change", () => {
    state.tanggal = dateInput.value;
    onChange();
  });

  mitraSelect.addEventListener("change", () => {
    state.mitra = mitraSelect.value;
    onChange();
  });

  produkSelect.addEventListener("change", () => {
    state.produk = produkSelect.value;
    onChange();
  });

  if (searchInput) {
    // Pencarian bebas: dicocokkan case-insensitive (lihat applyFilters()),
    // jadi ketik kapital atau tidak sama saja hasilnya.
    searchInput.addEventListener("input", () => {
      state.search = searchInput.value;
      onChange();
    });
  }

  resetBtn.addEventListener("click", () => {
    state.mode = "";
    state.bulan = "";
    state.tanggal = "";
    state.mitra = "";
    state.produk = "";
    state.search = "";
    modeSelect.value = "";
    monthInput.value = "";
    dateInput.value = "";
    mitraSelect.value = "";
    produkSelect.value = "";
    if (searchInput) searchInput.value = "";
    dateLabel.innerHTML = "&nbsp;";
    monthInput.classList.add("d-none");
    dateInput.classList.add("d-none");
    onChange();
  });
}

/** Terapkan filter ke array data, hasilkan array baru (tidak mengubah medaliData asli). */
function applyFilters(data, filters) {
  return data.filter((item) => {
    if (filters.mitra && item.mitra !== filters.mitra) return false;
    if (filters.produk && item.produk !== filters.produk) return false;
    if (filters.mode === "bulan" && filters.bulan) {
      if (toMonthValue(item.orderMasuk) !== filters.bulan) return false;
    }
    if (filters.mode === "tanggal" && filters.tanggal) {
      if (formatDateForInput(item.orderMasuk) !== filters.tanggal) return false;
    }
    if (filters.search && filters.search.trim()) {
      // Case-insensitive: "AA Kreatif", "aa kreatif", "Aa Kreatif" dianggap sama.
      const q = filters.search.trim().toLowerCase();
      const haystack = [
        item.namaMedali,
        item.mitra,
        item.produk,
        item.warnaDasar,
        item.warnaTambahan,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Ubah tanggal apapun jadi format 'YYYY-MM' untuk dibandingkan dengan input type=month. */
function toMonthValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return d.getFullYear() + "-" + mm;
}

/** Apakah ada filter yang sedang aktif (dipakai untuk teks empty-state yang lebih relevan). */
function isFilterActive(filters) {
  return !!(
    filters.mitra ||
    filters.produk ||
    (filters.search && filters.search.trim()) ||
    (filters.mode === "bulan" && filters.bulan) ||
    (filters.mode === "tanggal" && filters.tanggal)
  );
}

/* ================================================================
   PROTEKSI PASSWORD - MENU INPUT DATA (pakai sessionStorage)
   ================================================================ */
function isAuthenticated() {
  return sessionStorage.getItem(AUTH_KEY) === "true";
}

function checkInputAccess() {
  const loginCard = document.getElementById("loginCard");
  const formCard = document.getElementById("inputFormCard");
  if (isAuthenticated()) {
    loginCard.classList.add("d-none");
    formCard.classList.remove("d-none");
  } else {
    loginCard.classList.remove("d-none");
    formCard.classList.add("d-none");
  }
}

/** Sama seperti checkInputAccess(), tapi untuk menu File Master. Memakai
 *  sesi login (AUTH_KEY) yang SAMA dengan Input Data — jadi operator cukup
 *  login sekali untuk buka kedua menu. */
function checkFileMasterAccess() {
  const loginCard = document.getElementById("loginCardFile");
  const contentCard = document.getElementById("filemasterContentCard");
  if (isAuthenticated()) {
    loginCard.classList.add("d-none");
    contentCard.classList.remove("d-none");
  } else {
    loginCard.classList.remove("d-none");
    contentCard.classList.add("d-none");
  }
}

function bindLoginEvents() {
  document.getElementById("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = document.getElementById("passwordInput").value;
    const errorBox = document.getElementById("loginError");

    if (val === PASSWORD_INPUT) {
      // Password benar -> simpan status login di sessionStorage.
      // Berlaku selama tab browser belum ditutup, sehingga user bisa
      // pindah ke Dashboard lalu kembali ke Input tanpa login ulang.
      sessionStorage.setItem(AUTH_KEY, "true");
      errorBox.classList.add("d-none");
      document.getElementById("passwordInput").value = "";
      checkInputAccess();
      renderInputTable();
    } else {
      errorBox.classList.remove("d-none");
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem(AUTH_KEY);
    checkInputAccess();
    checkFileMasterAccess();
  });

  // Form login khusus di menu File Master — password & sesi (AUTH_KEY) sama
  // seperti Input Data, jadi begitu berhasil login di sini, menu Input Data
  // juga otomatis kebuka tanpa perlu login ulang.
  document.getElementById("loginFormFile").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = document.getElementById("passwordInputFile").value;
    const errorBox = document.getElementById("loginErrorFile");

    if (val === PASSWORD_INPUT) {
      sessionStorage.setItem(AUTH_KEY, "true");
      errorBox.classList.add("d-none");
      document.getElementById("passwordInputFile").value = "";
      checkFileMasterAccess();
      renderFileMaster();
    } else {
      errorBox.classList.remove("d-none");
    }
  });

  document.getElementById("logoutBtnFile").addEventListener("click", () => {
    sessionStorage.removeItem(AUTH_KEY);
    checkFileMasterAccess();
    checkInputAccess();
  });
}

/* ================================================================
   DROPDOWN MITRA & PRODUK
   ================================================================ */
function populateDropdowns() {
  const mitraSelect = document.getElementById("inputMitra");
  const produkSelect = document.getElementById("inputProduk");
  MITRA_LIST.forEach((m) => mitraSelect.add(new Option(m, m)));
  PRODUK_LIST.forEach((p) => produkSelect.add(new Option(p, p)));

  // Dropdown untuk filter Dashboard
  const dashMitraEl = document.getElementById("dashFilterMitra");
  MITRA_LIST.forEach((m) => dashMitraEl.add(new Option(m, m)));
  const dashProdukEl = document.getElementById("dashFilterProduk");
  PRODUK_LIST.forEach((p) => dashProdukEl.add(new Option(p, p)));

  // Dropdown untuk filter File Master
  const fileMitraEl = document.getElementById("fileFilterMitra");
  MITRA_LIST.forEach((m) => fileMitraEl.add(new Option(m, m)));
  const fileProdukEl = document.getElementById("fileFilterProduk");
  PRODUK_LIST.forEach((p) => fileProdukEl.add(new Option(p, p)));

  // Dropdown untuk filter tabel "Data Terbaru" di Input Data
  const inputMitraFilterEl = document.getElementById("inputFilterMitra");
  MITRA_LIST.forEach((m) => inputMitraFilterEl.add(new Option(m, m)));
  const inputProdukFilterEl = document.getElementById("inputFilterProduk");
  PRODUK_LIST.forEach((p) => inputProdukFilterEl.add(new Option(p, p)));
}

/* ================================================================
   AMBIL DATA DARI GOOGLE SHEET (GET ke Google Apps Script)
   ================================================================ */
function loadDataFromServer(silent) {
  if (!silent) showLoading(true);
  return fetch(GAS_URL)
    .then((res) => res.json())
    .then((json) => {
      if (json.success) {
        medaliData = json.data || [];
        renderDashboard();
        if (isAuthenticated()) {
          renderInputTable();
          renderFileMaster();
        }
      } else {
        showToast("Gagal memuat data: " + json.message, "danger");
      }
    })
    .catch((err) => {
      showToast(
        "Tidak dapat terhubung ke Google Apps Script. Pastikan GAS_URL sudah benar. (" +
          err.message +
          ")",
        "danger",
      );
    })
    .finally(() => {
      if (!silent) showLoading(false);
    });
}

/* ================================================================
   DASHBOARD - GALERI CARD
   ================================================================ */
function renderDashboard() {
  const wrap = document.getElementById("dashboardCards");
  const emptyState = document.getElementById("dashboardEmpty");
  const emptyText = document.getElementById("dashboardEmptyText");

  const filtered = applyFilters(medaliData, dashFilters);
  document.getElementById("dashboardCount").textContent =
    filtered.length + " produk";

  if (filtered.length === 0) {
    wrap.innerHTML = "";
    emptyState.classList.remove("d-none");
    emptyText.textContent = isFilterActive(dashFilters)
      ? "Tidak ada data yang cocok dengan filter."
      : "Belum ada data medali.";
    return;
  }
  emptyState.classList.add("d-none");

  wrap.innerHTML = filtered
    .map((item) => {
      const punyaTambahan = (item.orderTambahan || []).length > 0;
      const total = item.total !== undefined ? item.total : item.jumlah || 0;
      // Badge Total dikasih border biru + tebal khusus kalau ada order tambahan,
      // supaya langsung kelihatan beda dari produk yang tidak ada tambahannya.
      const totalBadgeClass = punyaTambahan
        ? "badge border border-primary text-primary font-weight-bold"
        : "badge badge-light border";
      return `
    <div class="col-6 col-md-4 col-lg-3 mb-4">
      <div class="card medal-card" style="cursor:pointer;" onclick="showDetailModal('${item.id}')">
        <div class="medal-photo-wrap">
          ${
            item.foto
              ? `<img src="${escapeHtml(fotoUrl(item.foto, 400))}" alt="${escapeHtml(item.produk)}">`
              : `<i class="fa-solid fa-image"></i>`
          }
        </div>
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div class="medal-mitra">${escapeHtml(item.mitra || "-")}</div>
            <span class="${totalBadgeClass}" title="${punyaTambahan ? "Total termasuk " + item.orderTambahan.length + " order tambahan" : "Total"}">${total} pcs${punyaTambahan ? ` <span class="badge badge-info ml-1">+${item.orderTambahan.length}</span>` : ""}</span>
          </div>
          ${item.namaMedali ? `<p class="medal-nama-medali mb-0">${escapeHtml(item.namaMedali)}</p>` : ""}
          <p class="medal-name mb-1">${escapeHtml(item.produk || "-")}</p>
          <div>
            ${statusBadge(item.status)}
          </div>
        </div>
      </div>
    </div>
  `;
    })
    .join("");
}

/* ================================================================
   HALAMAN FILE MASTER - GALERI (mirip Dashboard, versi ringkas)
   ------------------------------------------------------------------
   Cuma menampilkan produk yang punya File Master terupload — dan hanya
   info nama medali, nama produk, & tombol unduh (tanpa total/warna/jumlah).
   ================================================================ */
function renderFileMaster() {
  const wrap = document.getElementById("filemasterCards");
  const emptyState = document.getElementById("filemasterEmpty");
  if (!wrap || !emptyState) return; // jaga-jaga kalau section belum ke-render di DOM

  const withFile = medaliData.filter((item) => !!item.fileMaster);
  const filtered = applyFilters(withFile, fileFilters);

  document.getElementById("filemasterCount").textContent =
    filtered.length + " file";

  if (filtered.length === 0) {
    wrap.innerHTML = "";
    emptyState.classList.remove("d-none");
    document.getElementById("filemasterEmptyText").textContent =
      isFilterActive(fileFilters) || withFile.length > 0
        ? "Tidak ada file yang cocok dengan filter."
        : "Belum ada file master yang diupload.";
    return;
  }
  emptyState.classList.add("d-none");

  wrap.innerHTML = filtered
    .map(
      (item) => `
    <div class="col-6 col-md-4 col-lg-3 mb-4">
      <div class="card medal-card">
        <div class="medal-photo-wrap">
          ${
            item.foto
              ? `<img src="${escapeHtml(fotoUrl(item.foto, 400))}" alt="${escapeHtml(item.produk)}">`
              : `<i class="fa-solid fa-file-zipper"></i>`
          }
        </div>
        <div class="card-body">
          ${item.namaMedali ? `<p class="medal-nama-medali mb-0">${escapeHtml(item.namaMedali)}</p>` : ""}
          <p class="medal-name mb-2">${escapeHtml(item.produk || "-")}</p>
          <a href="${escapeHtml(item.fileMaster)}" target="_blank" rel="noopener" class="btn btn-sm btn-primary btn-block">
            <i class="fa-solid fa-download"></i> Unduh Master
          </a>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}
function bindFormEvents() {
  document
    .getElementById("inputFotoFile")
    .addEventListener("change", handleFotoFileChange);
  document
    .getElementById("inputFileMaster")
    .addEventListener("change", handleFileMasterChange);
  document
    .getElementById("inputFileMasterUrl")
    .addEventListener("input", handleFileMasterUrlInput);
  document
    .getElementById("removeFileMasterBtn")
    .addEventListener("click", handleRemoveFileMasterClick);
  document
    .getElementById("medaliForm")
    .addEventListener("submit", handleFormSubmit);
  document.getElementById("cancelEditBtn").addEventListener("click", resetForm);
}

// Field-field yang wajib diisi HANYA saat mode Tambah Data Baru.
// Saat mode Edit, atribut "required" ini dilepas semua (bukan dihapus dari form,
// cuma sementara dimatikan) supaya tombol Update tetap bisa diklik walau ada
// kolom yang sengaja dikosongkan.
const REQUIRED_FIELD_IDS = [
  "inputMitra",
  "inputProduk",
  "inputWarnaDasar",
  "inputWarnaTambahan",
  "inputJumlah",
  "inputOrderMasuk",
  "inputStatus",
];

function setFormRequired(isRequired) {
  REQUIRED_FIELD_IDS.forEach((id) => {
    document.getElementById(id).required = isRequired;
  });
}

/**
 * Kompres sebuah data URL gambar: diperkecil ke maksimal `maxDim` px pada sisi
 * terpanjang, lalu di-encode ulang sebagai JPEG dengan kualitas `quality`.
 * Ini yang membuat ukuran base64 foto jauh lebih kecil sebelum dikirim/disimpan.
 */
function compressImageDataUrl(dataUrl, maxDim = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () =>
      reject(new Error("Gagal memuat gambar untuk dikompres"));
    img.src = dataUrl;
  });
}

/** Ambang batas kasar (dalam karakter data URL) di atas mana foto lama akan dikompres ulang otomatis. */
const FOTO_RECOMPRESS_THRESHOLD = 700000; // kira-kira setara >500KB file asli

function handleFotoFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById("fotoPreview");
  const reader = new FileReader();
  reader.onload = () => {
    // Tampilkan dulu preview mentah sambil proses kompresi jalan di background.
    preview.src = reader.result;
    preview.style.display = "block";

    compressImageDataUrl(reader.result, 800, 0.8)
      .then((compressed) => {
        fotoBase64 = compressed;
        preview.src = compressed;
      })
      .catch(() => {
        // Kalau kompresi gagal (mis. bukan file gambar valid), pakai hasil asli saja.
        fotoBase64 = reader.result;
      });
  };
  reader.readAsDataURL(file);
}

/** Ambang batas: file di bawah ini pakai cara lama (base64 lewat POST) —
 *  simpel & cepat, tidak butuh sesi upload terpisah. Di atas ambang ini,
 *  otomatis pakai upload langsung ke Drive (lihat uploadFileMasterDirect()). */
const MAX_FILE_MASTER_DIRECT_BASE64 = 5 * 1024 * 1024; // 5MB
/** Batas atas realistis supaya tidak upload file yang kelewat besar tanpa sadar. */
const MAX_FILE_MASTER_UPLOAD_SIZE = 200 * 1024 * 1024; // 200MB

/** URL Drive hasil upload langsung (kalau file besar) — berbeda dari fileMasterBase64
 *  (yang isinya data base64 mentah untuk file kecil). Hanya salah satu yang terisi. */
let fileMasterDirectUrl = "";

/** User pilih file baru di input File Master. */
function handleFileMasterChange(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > MAX_FILE_MASTER_UPLOAD_SIZE) {
    showToast(
      "File terlalu besar (" +
        (file.size / (1024 * 1024)).toFixed(1) +
        "MB). Maksimal " +
        MAX_FILE_MASTER_UPLOAD_SIZE / (1024 * 1024) +
        "MB.",
      "danger",
    );
    e.target.value = "";
    return;
  }

  removeFileMaster = false; // pilih file baru otomatis membatalkan niat hapus
  document.getElementById("inputFileMasterUrl").value = ""; // upload & URL saling eksklusif
  fileMasterBase64 = "";
  fileMasterDirectUrl = "";

  if (file.size <= MAX_FILE_MASTER_DIRECT_BASE64) {
    // File kecil (<=5MB): cara lama, base64 lewat POST — cepat, tanpa progress bar.
    const reader = new FileReader();
    reader.onload = () => {
      fileMasterBase64 = reader.result;
      fileMasterNamaBaru = file.name;
      renderFileMasterInfo();
    };
    reader.readAsDataURL(file);
  } else {
    // File besar (>5MB): upload LANGSUNG ke Google Drive, tidak lewat Apps Script.
    fileMasterNamaBaru = file.name;
    renderFileMasterInfo();
    uploadFileMasterDirect(file);
  }
}

/**
 * Upload file besar langsung ke Google Drive (bypass Apps Script sepenuhnya
 * untuk isi filenya). Alur: minta sesi upload ke backend (initUploadSession_
 * di Code.gs) → PUT file langsung ke URL sesi tsb → simpan URL hasil akhir
 * ke fileMasterDirectUrl (dipakai saat submit form).
 */
function uploadFileMasterDirect(file) {
  const progressWrap = document.getElementById("fileMasterProgressWrap");
  const progressBar = document.getElementById("fileMasterProgressBar");
  progressWrap.classList.remove("d-none");
  progressBar.style.width = "0%";
  progressBar.textContent = "Menyiapkan sesi upload...";
  setFileMasterUploading_(true);

  fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "initUpload",
      payload: {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        folderType: "filemaster",
      },
    }),
  })
    .then((res) => res.json())
    .then((json) => {
      if (!json.success)
        throw new Error(json.message || "Gagal membuat sesi upload");
      progressBar.textContent = "0%";
      return putFileToUploadUrl_(json.uploadUrl, file, progressBar);
    })
    .then((driveFile) => {
      fileMasterDirectUrl =
        "https://drive.google.com/uc?export=download&id=" + driveFile.id;
      progressBar.style.width = "100%";
      progressBar.textContent = "Selesai";
      showToast("File master berhasil diupload ke Drive", "success");
    })
    .catch((err) => {
      showToast("Gagal upload file master: " + err.message, "danger");
      document.getElementById("inputFileMaster").value = "";
      fileMasterNamaBaru = "";
      fileMasterDirectUrl = "";
      progressWrap.classList.add("d-none");
      renderFileMasterInfo();
    })
    .finally(() => setFileMasterUploading_(false));
}

/** PUT file langsung ke URL sesi resumable Drive, pakai XHR (bukan fetch) supaya bisa pantau progress upload. */
function putFileToUploadUrl_(uploadUrl, file, progressBar) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = pct + "%";
        progressBar.textContent = pct + "%";
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(new Error("Respons Google Drive tidak valid"));
        }
      } else {
        reject(new Error("Upload gagal (status " + xhr.status + ")"));
      }
    };
    xhr.onerror = () => reject(new Error("Koneksi terputus saat upload"));
    xhr.send(file);
  });
}

/** Kunci tombol Simpan/Update selama file besar masih diupload, biar tidak submit setengah jalan. */
function setFileMasterUploading_(isUploading) {
  const btn = document.getElementById("submitBtn");
  if (btn) btn.disabled = isUploading;
}

/** User ngetik/tempel link di kolom File Master (URL) — batalkan upload file yang sudah dipilih (kalau ada). */
function handleFileMasterUrlInput() {
  if (fileMasterBase64 || fileMasterDirectUrl) {
    fileMasterBase64 = "";
    fileMasterDirectUrl = "";
    fileMasterNamaBaru = "";
    document.getElementById("inputFileMaster").value = "";
    document.getElementById("fileMasterProgressWrap").classList.add("d-none");
  }
  removeFileMaster = false;
  renderFileMasterInfo();
}

/** User klik tombol "Hapus File Master" (menghapus file yang SUDAH tersimpan). */
function handleRemoveFileMasterClick() {
  removeFileMaster = true;
  fileMasterBase64 = "";
  fileMasterDirectUrl = "";
  fileMasterNamaBaru = "";
  document.getElementById("inputFileMaster").value = "";
  document.getElementById("inputFileMasterUrl").value = "";
  document.getElementById("fileMasterProgressWrap").classList.add("d-none");
  renderFileMasterInfo();
}

/** Update teks info + tombol Hapus di bawah field File Master sesuai state saat ini. */
function renderFileMasterInfo() {
  const info = document.getElementById("currentFileMasterInfo");
  const removeBtn = document.getElementById("removeFileMasterBtn");

  if (fileMasterNamaBaru) {
    info.textContent = "File baru dipilih: " + fileMasterNamaBaru;
    info.classList.remove("d-none");
    removeBtn.classList.add("d-none");
  } else if (removeFileMaster) {
    info.textContent = "File master akan dihapus setelah data disimpan.";
    info.classList.remove("d-none");
    removeBtn.classList.add("d-none");
  } else if (fileMasterExisting.url) {
    info.innerHTML =
      'File saat ini: <a href="' +
      escapeHtml(fileMasterExisting.url) +
      '" target="_blank" rel="noopener">' +
      escapeHtml(fileMasterExisting.nama || "Lihat file") +
      "</a>";
    info.classList.remove("d-none");
    removeBtn.classList.remove("d-none");
  } else {
    info.classList.add("d-none");
    removeBtn.classList.add("d-none");
  }
}

function handleFormSubmit(e) {
  e.preventDefault();

  const foto =
    fotoBase64 || document.getElementById("inputFotoUrl").value.trim();

  const payload = {
    foto: foto,
    namaMedali: document.getElementById("inputNamaMedali").value.trim(),
    mitra: document.getElementById("inputMitra").value,
    produk: document.getElementById("inputProduk").value,
    warnaDasar: document.getElementById("inputWarnaDasar").value.trim(),
    warnaTambahan: document.getElementById("inputWarnaTambahan").value.trim(),
    jumlah: Number(document.getElementById("inputJumlah").value) || 0,
    orderMasuk: document.getElementById("inputOrderMasuk").value,
    batasAkhir: document.getElementById("inputBatasAkhir").value,
    status: document.getElementById("inputStatus").value,
  };

  // File Master bersifat opsional & tidak selalu diubah tiap submit — hanya
  // disertakan di payload kalau user memang pilih file baru, isi/ubah link
  // URL-nya, ATAU klik Hapus. Supaya saat mode Edit dan field ini tidak
  // disentuh, file lama di backend tetap dipertahankan apa adanya (lihat
  // valueOr_ di Code.gs).
  const fileMasterUrlTyped = document
    .getElementById("inputFileMasterUrl")
    .value.trim();
  if (fileMasterDirectUrl) {
    // File besar yang barusan diupload langsung ke Drive — kirim URL hasilnya
    // apa adanya (backend akan pass-through, bukan decode base64).
    payload.fileMaster = fileMasterDirectUrl;
    payload.fileMasterNama = fileMasterNamaBaru;
  } else if (fileMasterBase64) {
    payload.fileMaster = fileMasterBase64;
    payload.fileMasterNama = fileMasterNamaBaru;
  } else if (removeFileMaster) {
    payload.fileMaster = "";
    payload.fileMasterNama = "";
  } else if (
    fileMasterUrlTyped &&
    fileMasterUrlTyped !== fileMasterExisting.url
  ) {
    payload.fileMaster = fileMasterUrlTyped;
    payload.fileMasterNama = fileMasterNamaBaru || "";
  }

  if (editingId) {
    payload.id = editingId;
    sendToGAS("update", payload, "Data berhasil diperbarui");
  } else {
    sendToGAS("create", payload, "Data berhasil ditambahkan");
  }
}

/**
 * Kirim data ke Google Apps Script (POST).
 * Catatan: Content-Type sengaja "text/plain" agar browser tidak melakukan
 * CORS preflight (OPTIONS) yang tidak didukung web app Apps Script secara default.
 * e.postData.contents di Code.gs tetap akan mem-parsing isinya sebagai JSON.
 */
function sendToGAS(action, payload, successMessage) {
  showLoading(true);
  fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload }),
  })
    .then((res) => res.json())
    .then((json) => {
      if (json.success) {
        showToast(successMessage, "success");
        resetForm();
        loadDataFromServer();
      } else {
        showToast("Gagal: " + json.message, "danger");
      }
    })
    .catch((err) => showToast("Gagal mengirim data: " + err.message, "danger"))
    .finally(() => showLoading(false));
}

function resetForm() {
  document.getElementById("medaliForm").reset();
  document.getElementById("editingId").value = "";
  editingId = null;
  fotoBase64 = "";
  document.getElementById("fotoPreview").style.display = "none";

  fileMasterBase64 = "";
  fileMasterDirectUrl = "";
  fileMasterNamaBaru = "";
  fileMasterExisting = { url: "", nama: "" };
  removeFileMaster = false;
  document.getElementById("inputFileMaster").value = "";
  document.getElementById("inputFileMasterUrl").value = "";
  document.getElementById("fileMasterProgressWrap").classList.add("d-none");
  renderFileMasterInfo();

  document.getElementById("formModeLabel").textContent = "Tambah Data Baru";
  document.getElementById("cancelEditBtn").classList.add("d-none");
  setFormRequired(true); // mode Tambah: semua field wajib diisi

  // Kembalikan tampilan ke tema hijau (mode Tambah Data).
  document.getElementById("medaliFormCard").classList.remove("mode-edit");
  document.getElementById("formModeLabel").classList.remove("text-warning");
  document.getElementById("formModeLabel").classList.add("text-success");

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.classList.remove("btn-warning");
  submitBtn.classList.add("btn-success");
  submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Data';
}

function loadItemToForm(id) {
  const item = medaliData.find((d) => String(d.id) === String(id));
  if (!item) return;

  editingId = item.id;
  document.getElementById("editingId").value = item.id;
  setFormRequired(false); // mode Edit: field boleh dikosongkan, tombol tetap aktif
  document.getElementById("inputFotoUrl").value = (item.foto || "").startsWith(
    "data:",
  )
    ? ""
    : item.foto || "";
  fotoBase64 = (item.foto || "").startsWith("data:") ? item.foto : "";

  const preview = document.getElementById("fotoPreview");
  if (item.foto) {
    preview.src = fotoUrl(item.foto, 500);
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }

  // Foto lama yang sudah kadung tersimpan besar (base64 hasil upload lama, sebelum
  // ada kompresi otomatis) akan dikompres ulang diam-diam begitu data ini dibuka
  // di mode Edit, supaya user tidak perlu re-upload manual satu-satu.
  if (
    fotoBase64 &&
    fotoBase64.startsWith("data:") &&
    fotoBase64.length > FOTO_RECOMPRESS_THRESHOLD
  ) {
    const idBeingEdited = item.id;
    compressImageDataUrl(fotoBase64, 800, 0.8)
      .then((compressed) => {
        // Pastikan user belum pindah ke item lain / batal edit sebelum hasil kompresi selesai.
        if (editingId === idBeingEdited) {
          fotoBase64 = compressed;
          preview.src = compressed;
        }
      })
      .catch(() => {
        /* kalau gagal, biarkan foto lama apa adanya */
      });
  }

  document.getElementById("inputNamaMedali").value = item.namaMedali || "";
  document.getElementById("inputMitra").value = item.mitra || "";
  document.getElementById("inputProduk").value = item.produk || "";
  document.getElementById("inputWarnaDasar").value = item.warnaDasar || "";
  document.getElementById("inputWarnaTambahan").value =
    item.warnaTambahan || "";
  document.getElementById("inputJumlah").value = item.jumlah || "";
  document.getElementById("inputOrderMasuk").value = formatDateForInput(
    item.orderMasuk,
  );
  document.getElementById("inputBatasAkhir").value = formatDateForInput(
    item.batasAkhir,
  );
  document.getElementById("inputStatus").value = item.status || "Proses";

  fileMasterBase64 = "";
  fileMasterDirectUrl = "";
  fileMasterNamaBaru = "";
  removeFileMaster = false;
  fileMasterExisting = {
    url: item.fileMaster || "",
    nama: item.fileMasterNama || "",
  };
  document.getElementById("inputFileMaster").value = "";
  document.getElementById("inputFileMasterUrl").value = "";
  document.getElementById("fileMasterProgressWrap").classList.add("d-none");
  renderFileMasterInfo();

  const editBreadcrumb = [item.mitra, item.produk, item.namaMedali]
    .filter(Boolean)
    .join(" > ");
  document.getElementById("formModeLabel").textContent =
    "Edit Data: " + (editBreadcrumb || item.produk || "");
  document.getElementById("submitBtn").innerHTML =
    '<i class="fa-solid fa-floppy-disk"></i> Update Data';
  document.getElementById("cancelEditBtn").classList.remove("d-none");

  // Ganti tampilan form ke tema kuning supaya jelas kalau sedang dalam mode Edit.
  document.getElementById("medaliFormCard").classList.add("mode-edit");
  document.getElementById("formModeLabel").classList.remove("text-success");
  document.getElementById("formModeLabel").classList.add("text-warning");

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.classList.remove("btn-success");
  submitBtn.classList.add("btn-warning");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteItem(id) {
  if (
    !confirm("Yakin ingin menghapus data ini? Tindakan tidak bisa dibatalkan.")
  )
    return;
  sendToGAS("delete", { id }, "Data berhasil dihapus");
}

/* ================================================================
   TABEL DATA SEMENTARA DI MENU INPUT (list ringkas + tombol edit/hapus)
   ================================================================ */
function renderInputTable() {
  const tbody = document.getElementById("inputDataTableBody");
  const filtered = applyFilters(medaliData, inputFilters);

  if (filtered.length === 0) {
    const emptyText = isFilterActive(inputFilters)
      ? "Tidak ada data yang cocok dengan filter."
      : "Belum ada data";
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">${emptyText}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((item) => {
      const punyaTambahan = (item.orderTambahan || []).length > 0;
      const total = item.total !== undefined ? item.total : item.jumlah || 0;
      return `
    <tr>
      <td>${item.foto ? `<img src="${escapeHtml(fotoUrl(item.foto, 150))}" class="table-thumb">` : '<div class="table-thumb"></div>'}</td>
      <td>${escapeHtml(item.mitra || "-")}</td>
      <td>${escapeHtml(item.produk || "-")}</td>
      <td>${item.jumlah || 0}</td>
      <td><span class="${punyaTambahan ? "border border-primary text-primary font-weight-bold px-2 py-1 rounded d-inline-block" : ""}">${total}</span>${punyaTambahan ? ` <span class="badge badge-info" title="${item.orderTambahan.length} order tambahan">+${item.orderTambahan.length}</span>` : ""}</td>
      <td>${statusBadge(item.status)}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="loadItemToForm('${item.id}')" title="Edit">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn btn-sm btn-outline-info" onclick="openTambahanModal('${item.id}')" title="Order Tambahan">
          <i class="fa-solid fa-layer-group"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteItem('${item.id}')" title="Hapus">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `;
    })
    .join("");
}

/* ================================================================
   MODAL DETAIL MEDALI (diklik dari card Dashboard)
   ================================================================ */
function showDetailModal(id) {
  const item = medaliData.find((d) => String(d.id) === String(id));
  if (!item) return;

  document.getElementById("detailModalTitle").textContent =
    item.namaMedali || item.produk || "Detail Medali";

  const fotoImg = document.getElementById("detailFoto");
  const fotoEmpty = document.getElementById("detailFotoEmpty");
  if (item.foto) {
    fotoImg.src = fotoUrl(item.foto, 1000);
    fotoImg.style.display = "inline-block";
    fotoEmpty.style.display = "none";
  } else {
    fotoImg.style.display = "none";
    fotoEmpty.style.display = "block";
  }

  document.getElementById("detailNamaMedali").textContent =
    item.namaMedali || "-";
  document.getElementById("detailMitra").textContent = item.mitra || "-";
  document.getElementById("detailProduk").textContent = item.produk || "-";
  document.getElementById("detailJumlah").textContent =
    (item.jumlah || 0) + " pcs";

  // Baris Total & daftar order tambahan hanya ditampilkan kalau produk ini
  // memang punya order tambahan (sesuai skema: dashboard cuma nampilin
  // detailnya saat produk yang ada order tambahannya diklik).
  const tambahanList = item.orderTambahan || [];
  const totalRow = document.getElementById("detailTotalRow");
  const tambahanWrap = document.getElementById("detailTambahanWrap");
  if (tambahanList.length > 0) {
    totalRow.classList.remove("d-none");
    document.getElementById("detailTotal").textContent =
      (item.total !== undefined ? item.total : item.jumlah) + " pcs";

    tambahanWrap.classList.remove("d-none");
    document.getElementById("detailTambahanList").innerHTML = tambahanList
      .map(
        (t, idx) => `
      <li class="list-group-item px-0 py-2 d-flex justify-content-between align-items-center">
        <div>
          <span class="font-weight-bold">Order Tambahan #${idx + 1}</span>
          <span class="text-muted small d-block">
            ${escapeHtml(t.warnaDasar || "-")}${t.warnaTambahan ? " / " + escapeHtml(t.warnaTambahan) : ""}
            &middot; ${formatDateDisplay(t.tanggalOrder)}
          </span>
        </div>
        <span class="badge badge-primary">+${t.jumlah || 0}</span>
      </li>
    `,
      )
      .join("");
  } else {
    totalRow.classList.add("d-none");
    tambahanWrap.classList.add("d-none");
  }

  document.getElementById("detailWarnaDasar").textContent =
    item.warnaDasar || "-";
  document.getElementById("detailWarnaTambahan").textContent =
    item.warnaTambahan || "-";
  document.getElementById("detailOrderMasuk").textContent = formatDateDisplay(
    item.orderMasuk,
  );
  document.getElementById("detailBatasAkhir").textContent = formatDateDisplay(
    item.batasAkhir,
  );
  document.getElementById("detailStatus").innerHTML = statusBadge(item.status);

  // Simpan id yang sedang tampil di tombol Download PDF, supaya saat diklik
  // tahu data mana yang mau di-export (tanpa perlu simpan state global terpisah).
  document.getElementById("downloadDetailPdfBtn").dataset.medaliId = item.id;

  $("#detailModal").modal("show");
}

/* ================================================================
   DOWNLOAD PDF - MODAL DETAIL MEDALI
   ------------------------------------------------------------------
   Dipanggil dari tombol "Download PDF" di footer modal detail.
   Pakai jsPDF + jsPDF-AutoTable (dimuat lewat CDN di index.html).
   Foto medali dicoba disertakan (di-convert ke base64 dulu); kalau
   gagal diakses (mis. dibatasi CORS oleh sumbernya), PDF tetap
   dibuat tanpa foto supaya fitur ini tidak pernah gagal total.
   ================================================================ */
function bindDetailPdfButton() {
  document
    .getElementById("downloadDetailPdfBtn")
    .addEventListener("click", () => {
      const id = document.getElementById("downloadDetailPdfBtn").dataset
        .medaliId;
      if (id) downloadDetailPdf(id);
    });

  // Jaring pengaman: kalau ada error tak terduga yang lolos dari try/catch
  // manapun (mis. Promise yang tidak di-await), jangan biarkan loading
  // nyangkut tanpa pesan apa-apa ke user — tampilkan toast & matikan loading.
  window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled promise rejection:", e.reason);
    showLoading(false);
    showToast(
      "Terjadi kesalahan tak terduga: " +
        (e.reason && e.reason.message ? e.reason.message : e.reason),
      "danger",
    );
  });
}

async function downloadDetailPdf(id) {
  const item = medaliData.find((d) => String(d.id) === String(id));
  if (!item) return;

  showLoading(true);
  try {
    const photoData = item.foto
      ? await imageUrlToDataUrl(fotoUrl(item.foto, 1000))
      : null;
    await buildDetailPdf(item, photoData);
  } catch (err) {
    console.error(err);
    showToast("Gagal membuat PDF: " + err.message, "danger");
  } finally {
    showLoading(false);
  }
}

/** Ambil gambar dari URL lalu convert jadi data URL base64 (buat dimasukkan ke PDF). */
function imageUrlToDataUrl(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    fetch(url, { mode: "cors" })
      .then((res) => {
        if (!res.ok) throw new Error("fetch gagal");
        return res.blob();
      })
      .then((blob) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      })
      // Kalau kena CORS / sumbernya menolak akses, jangan gagalkan seluruh PDF —
      // cukup lanjut tanpa foto.
      .catch(() => resolve(null));
  });
}

/** Ukur dimensi gambar (buat jaga aspect ratio saat ditaruh di PDF). */
function getImageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function buildDetailPdf(item, photoData) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 16;
  const brandBlue = [78, 115, 223]; // sama dengan --sb-blue-start
  let cursorY = 0;

  // ---------- Header ----------
  doc.setFillColor(...brandBlue);
  doc.rect(0, 0, pageWidth, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("LAPORAN DETAIL MEDALI", marginX, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Medali Report", marginX, 20);
  doc.setFontSize(8.5);
  const generatedAt = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  doc.text("Dicetak: " + generatedAt, pageWidth - marginX, 20, {
    align: "right",
  });

  cursorY = 34;

  // ---------- Foto (kalau berhasil diambil) ----------
  if (photoData) {
    try {
      const size = await getImageSize(photoData);
      const maxW = 70; // mm
      const maxH = 55; // mm
      let w = maxW;
      let h = maxW;
      if (size && size.w && size.h) {
        const ratio = size.w / size.h;
        h = w / ratio;
        if (h > maxH) {
          h = maxH;
          w = h * ratio;
        }
      }
      const x = (pageWidth - w) / 2;
      doc.addImage(photoData, "JPEG", x, cursorY, w, h);
      cursorY += h + 8;
    } catch (e) {
      // Kalau format gambar tidak didukung addImage, lanjut tanpa foto.
    }
  }

  // ---------- Judul nama medali ----------
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  const titleText = item.namaMedali || item.produk || "Detail Medali";
  doc.text(titleText, pageWidth / 2, cursorY, { align: "center" });
  cursorY += 8;

  // ---------- Tabel detail (mirror dari modal di web) ----------
  const rows = [
    ["Nama Medali", item.namaMedali || "-"],
    ["Mitra", item.mitra || "-"],
    ["Produk", item.produk || "-"],
    ["Jumlah Order", (item.jumlah || 0) + " pcs"],
  ];
  const tambahanList = item.orderTambahan || [];
  if (tambahanList.length > 0) {
    rows.push([
      "Total Order + Tambahan",
      (item.total !== undefined ? item.total : item.jumlah) + " pcs",
    ]);
  }
  rows.push(
    ["Warna Dasar", item.warnaDasar || "-"],
    ["Warna Tambahan", item.warnaTambahan || "-"],
    ["Order Masuk", formatDateDisplay(item.orderMasuk)],
    ["Batas Akhir", formatDateDisplay(item.batasAkhir)],
    ["Status", item.status || "-"],
  );

  doc.autoTable({
    startY: cursorY,
    margin: { left: marginX, right: marginX },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 3,
      lineColor: [227, 230, 240],
      lineWidth: 0.2,
      textColor: [58, 59, 69],
    },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: "bold", fillColor: [248, 249, 252] },
      1: { cellWidth: "auto" },
    },
    body: rows,
  });

  let afterTableY = doc.lastAutoTable.finalY + 10;

  // ---------- Tabel order tambahan (kalau ada) ----------
  if (tambahanList.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text("Order Tambahan", marginX, afterTableY);

    doc.autoTable({
      startY: afterTableY + 3,
      margin: { left: marginX, right: marginX },
      theme: "grid",
      head: [["#", "Warna Dasar", "Warna Tambahan", "Tanggal Order", "Jumlah"]],
      headStyles: { fillColor: brandBlue, textColor: 255, fontStyle: "bold" },
      styles: {
        font: "helvetica",
        fontSize: 9.5,
        cellPadding: 2.6,
        lineColor: [227, 230, 240],
        lineWidth: 0.2,
        textColor: [58, 59, 69],
      },
      body: tambahanList.map((t, idx) => [
        idx + 1,
        t.warnaDasar || "-",
        t.warnaTambahan || "-",
        formatDateDisplay(t.tanggalOrder),
        (t.jumlah || 0) + " pcs",
      ]),
    });
  }

  // ---------- Footer di tiap halaman ----------
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(227, 230, 240);
    doc.line(marginX, pageHeight - 14, pageWidth - marginX, pageHeight - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 150);
    doc.text("Medali Report by ARVA.CO", marginX, pageHeight - 9);
    doc.text(
      `Halaman ${i} / ${pageCount}`,
      pageWidth - marginX,
      pageHeight - 9,
      {
        align: "right",
      },
    );
  }

  const filenameParts = [item.mitra, item.produk, item.namaMedali].filter(
    Boolean,
  );
  const safeName = (filenameParts.join("-") || "Medali")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-");
  doc.save(`Medali-${safeName}.pdf`);
}

/* ================================================================
   MODAL KELOLA ORDER TAMBAHAN
   ------------------------------------------------------------------
   Skema: langkah 1 (pilih produk) sudah terjadi lewat tombol di
   tabel Input Data (openTambahanModal). Field Mitra/Produk cuma
   ditampilkan (locked, ngikut data produk yang dipilih) — form yang
   diisi user hanya warna dasar, warna tambahan, dan jumlah.
   ================================================================ */
let tambahanParentId = null; // ID produk utama yang sedang dikelola order tambahannya
let editingTambahanId = null; // ID order tambahan yang sedang diedit (null = mode tambah baru)

function openTambahanModal(parentId) {
  const item = medaliData.find((d) => String(d.id) === String(parentId));
  if (!item) return;

  tambahanParentId = parentId;
  document.getElementById("tambahanParentId").value = parentId;
  document.getElementById("tambahanInfoMitra").textContent = item.mitra || "-";
  document.getElementById("tambahanInfoProduk").textContent =
    item.produk || "-";
  document.getElementById("tambahanInfoJumlah").textContent = item.jumlah || 0;

  resetTambahanForm();

  renderTambahanList(item);
  $("#tambahanModal").modal("show");
}

/** Kembalikan form Order Tambahan ke mode "Tambah" (dipanggil saat modal dibuka baru,
 *  batal edit, atau setelah submit sukses). */
function resetTambahanForm() {
  document.getElementById("tambahanForm").reset();
  document.getElementById("tambahanEditingId").value = "";
  editingTambahanId = null;
  document.getElementById("tambahanParentId").value = tambahanParentId || "";
  document.getElementById("tambahanTanggal").value = todayISO();

  document.getElementById("tambahanFormLabel").textContent =
    "Tambah Order Tambahan";
  document.getElementById("cancelTambahanEditBtn").classList.add("d-none");

  const submitBtn = document.getElementById("tambahanSubmitBtn");
  submitBtn.classList.remove("btn-warning");
  submitBtn.classList.add("btn-primary");
  submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Tambahkan';
}

/** Isi form Order Tambahan dengan data order yang mau diedit. */
function loadTambahanToForm(id) {
  const item = medaliData.find(
    (d) => String(d.id) === String(tambahanParentId),
  );
  if (!item) return;
  const t = (item.orderTambahan || []).find((o) => String(o.id) === String(id));
  if (!t) return;

  editingTambahanId = t.id;
  document.getElementById("tambahanEditingId").value = t.id;
  document.getElementById("tambahanWarnaDasar").value = t.warnaDasar || "";
  document.getElementById("tambahanWarnaTambahan").value =
    t.warnaTambahan || "";
  document.getElementById("tambahanJumlah").value = t.jumlah || "";
  document.getElementById("tambahanTanggal").value =
    formatDateForInput(t.tanggalOrder) || todayISO();

  document.getElementById("tambahanFormLabel").textContent =
    "Edit Order Tambahan";
  document.getElementById("cancelTambahanEditBtn").classList.remove("d-none");

  const submitBtn = document.getElementById("tambahanSubmitBtn");
  submitBtn.classList.remove("btn-primary");
  submitBtn.classList.add("btn-warning");
  submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update';
}

function renderTambahanList(item) {
  const list = item.orderTambahan || [];
  const wrap = document.getElementById("tambahanList");
  if (list.length === 0) {
    wrap.innerHTML =
      '<li class="list-group-item text-muted small text-center">Belum ada order tambahan</li>';
    return;
  }
  wrap.innerHTML = list
    .map(
      (t, idx) => `
    <li class="list-group-item d-flex justify-content-between align-items-center py-2">
      <div>
        <span class="font-weight-bold small">Order Tambahan #${idx + 1}</span>
        <span class="text-muted small d-block">
          ${escapeHtml(t.warnaDasar || "-")}${t.warnaTambahan ? " / " + escapeHtml(t.warnaTambahan) : ""}
          &middot; ${formatDateDisplay(t.tanggalOrder)}
        </span>
      </div>
      <div class="d-flex align-items-center">
        <span class="badge badge-primary mr-2">+${t.jumlah || 0}</span>
        <button type="button" class="btn btn-sm btn-outline-primary mr-1" onclick="loadTambahanToForm('${t.id}')" title="Edit order tambahan ini">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteTambahan('${t.id}')" title="Hapus order tambahan ini">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </li>
  `,
    )
    .join("");
}

function bindTambahanFormEvents() {
  document.getElementById("tambahanForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const payload = {
      parentId: tambahanParentId,
      warnaDasar: document.getElementById("tambahanWarnaDasar").value.trim(),
      warnaTambahan: document
        .getElementById("tambahanWarnaTambahan")
        .value.trim(),
      tanggalOrder: document.getElementById("tambahanTanggal").value,
      jumlah: Number(document.getElementById("tambahanJumlah").value) || 0,
    };
    if (!payload.jumlah || payload.jumlah <= 0) {
      showToast("Jumlah order tambahan harus lebih dari 0", "danger");
      return;
    }
    if (editingTambahanId) {
      payload.id = editingTambahanId;
      sendTambahanAction(
        "updateTambahan",
        payload,
        "Order tambahan berhasil diperbarui",
      );
    } else {
      sendTambahanAction(
        "createTambahan",
        payload,
        "Order tambahan berhasil ditambahkan",
      );
    }
  });

  document
    .getElementById("cancelTambahanEditBtn")
    .addEventListener("click", resetTambahanForm);
}

function deleteTambahan(id) {
  if (
    !confirm(
      "Yakin ingin menghapus order tambahan ini? Tindakan tidak bisa dibatalkan.",
    )
  )
    return;
  sendTambahanAction(
    "deleteTambahan",
    { id },
    "Order tambahan berhasil dihapus",
  );
}

/**
 * Sama seperti sendToGAS, tapi TIDAK mereset form input utama dan TIDAK
 * menutup modal — setelah data dimuat ulang, modal Order Tambahan dibuka
 * lagi untuk produk yang sama supaya user langsung lihat list terbaru.
 */
function sendTambahanAction(action, payload, successMessage) {
  showLoading(true);
  fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload }),
  })
    .then((res) => res.json())
    .then((json) => {
      if (json.success) {
        showToast(successMessage, "success");
        const keepOpenForId = tambahanParentId;
        return loadDataFromServer(true).then(() => {
          resetTambahanForm();
          const item = medaliData.find(
            (d) => String(d.id) === String(keepOpenForId),
          );
          if (item) renderTambahanList(item);
        });
      } else {
        showToast("Gagal: " + json.message, "danger");
      }
    })
    .catch((err) => showToast("Gagal mengirim data: " + err.message, "danger"))
    .finally(() => showLoading(false));
}

function statusBadge(status) {
  const cls = status === "Selesai" ? "badge-success" : "badge-warning";
  return `<span class="badge ${cls}">${escapeHtml(status || "-")}</span>`;
}

/* ================================================================
   HELPER UMUM
   ================================================================ */

/**
 * Bangun URL foto dengan ukuran thumbnail yang sesuai konteks pemakaian.
 * Untuk foto yang disimpan di Google Drive (format .../thumbnail?id=...),
 * ukuran besar (mis. 1600px) tidak perlu diminta untuk thumbnail kecil di
 * kartu/tabel — itu bikin loading lebih lama tanpa gunanya. `size` = lebar
 * target dalam px. Untuk foto berupa URL biasa (bukan dari Drive), dikembalikan
 * apa adanya karena parameter ukuran ini tidak berlaku untuknya.
 */
function fotoUrl(foto, size) {
  if (!foto) return "";
  if (foto.indexOf("drive.google.com/thumbnail") === -1) return foto;
  const base = foto.split("&sz=")[0]; // buang parameter sz lama kalau ada (data lama)
  return base + "&sz=w" + size;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function todayISO() {
  return formatDateForInput(new Date());
}

/**
 * Ubah tanggal apapun jadi format 'YYYY-MM-DD' (buat isi <input type=date> &
 * buat dibandingkan dengan filter per-tanggal).
 * PENTING: sengaja pakai getFullYear()/getMonth()/getDate() (waktu LOKAL),
 * BUKAN toISOString() (waktu UTC) — sebelumnya pakai toISOString() dan itu
 * bikin tanggalnya bisa mundur 1 hari (mis. tersimpan sebagai tengah malam
 * lokal, lalu di-convert ke UTC jadi hari sebelumnya), makanya filter
 * "Per Tanggal" di Dashboard sempat tidak pernah cocok walau "Per Bulan" oke
 * (karena toMonthValue() di bawah memang sudah pakai waktu lokal).
 */
function formatDateForInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d)) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateDisplay(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function showLoading(show) {
  document.getElementById("loadingOverlay").classList.toggle("d-none", !show);
}

function showToast(message, type = "success") {
  const box = document.getElementById("toastBox");
  const el = document.createElement("div");
  el.className = `alert alert-${type} shadow-sm`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
