# 🤖 MRD: HELP (Hermes Liquidity Provider) AI Agent

**DOCUMENT PURPOSE:** Master Reference Document (MRD) untuk pengembangan AI Agent. Dokumen ini berfungsi sebagai sumber kebenaran tunggal (*single source of truth*) untuk memulihkan konteks secara cepat. Jika Anda adalah AI Developer yang membaca ini, gunakan status `[TODO]` untuk melacak progres saat ini.

## 1. PROJECT OVERVIEW

* **Project Name:** HELP (Hermes Liquidity Provider).
* **Target Platform:** Meteora.ag (Solana DEX - Dynamic Liquidity Market Maker / DLMM).
* **Core Objective:** Otomatisasi manajemen likuiditas end-to-end, mulai dari *screening* pool, eksekusi posisi (entry/exit), manajemen risiko tingkat tinggi, hingga monitoring pasif (*daemon*) dengan kapabilitas *self-learning*.
* **Tech Stack Mapping:** Python / TypeScript (Node.js), Solana Web3.js, Meteora DLMM SDK.

---

## 2. SYSTEM BLUEPRINT & ARCHITECTURE

Sistem HELP dibagi menjadi 5 modul utama. AI Agent harus mengembangkan ini secara terisolasi (*loose coupling*).

### Module A: Risk Management & Filtering Engine (Prioritas Mutlak)

Modul ini bertindak sebagai *firewall* sebelum agent melakukan *screening* atau *entry*.

* **Blacklist Categories:** Wajib memblokir *pool/project* yang terindikasi: Gambling, Porn/NSFW, Prediction Market, Perpetual DEX, Binary Option, dan Lending/Borrowing.
* **Keyword/Content Banning:** Sistem konfigurasi manual untuk *custom banned keywords* (bisa diperbarui secara dinamis via file config/JSON).
* **Action:** Jika terdeteksi pada metadata token atau deskripsi, fungsi `return false` (Skip/Drop).

### Module B: Screener & Self-Improvement Engine

* **Custom Criteria Setup:** Menerima input parameter seperti Minimum TVL, Minimum 24h Volume, Fee/TVL Ratio, Volatility index.
* **Self-Improvement Loop:** Mencatat hasil *profit/loss* dari pool yang dipilih sebelumnya untuk menyesuaikan *weighting criteria* di masa depan (misal: "Pool dengan volatilitas X ternyata sering rugi, turunkan skornya").

### Module C: Execution Engine (Entry)

* **Strategy Modes:** * `SPOT`: Distribusi likuiditas terpusat di sekitar harga saat ini.
* `CURVE`: Distribusi melebar untuk menangkap pergerakan volatilitas.
* `BID-ASK`: Distribusi asimetris jika ada bias pergerakan harga.


* **Range Setup:** Mendukung konfigurasi *Manual* (user menentukan min/max price) atau *Auto* (Agent menghitung range berdasarkan *historical volatility* dan indikator teknikal).

### Module D: Exit & Protection Engine (Close Position)

* **Triggers:** Take Profit (TP) percentage, Stop Loss (SL) percentage, Trailing Stop.
* **Exit Plan Module:** Setup manual untuk strategi keluar, dipadukan dengan *self-learning* (Agent menganalisis apakah SL terlalu ketat atau TP terlalu cepat berdasarkan data historis).
* **Routing:** `auto_zap_out` (mencabut likuiditas) $\rightarrow$ `auto_swap` (langsung mengonversi semua aset pecahan kembali ke murni SOL).

### Module E: Daemon & State Monitor

* **Background Process:** Berjalan sebagai *daemon/background service*.
* **Polling/Websocket:** Mengecek *active position state* setiap interval waktu tertentu (misal: per 15 detik atau per blok Solana).
* **State Evaluator:** Mengevaluasi harga terkini vs *Range*, TP, dan SL untuk memicu Module D secara *real-time*.

---

## 3. DEVELOPMENT TO-DOS (TRACKER)

*AI Developer: Saat memulai sesi, tanyakan kepada User nomor TODO mana yang saat ini sedang dikerjakan untuk melanjutkan konteks.*

### Phase 1: Foundation & Setup

* [ ] **TODO 1.1:** Setup project environment (Python/TypeScript), inisialisasi koneksi RPC Solana.
* [ ] **TODO 1.2:** Integrasi dengan Meteora DLMM SDK (Fetch pool data, get active bins).
* [ ] **TODO 1.3:** Setup wallet integration (Keypair handling yang aman untuk eksekusi otomatis).

### Phase 2: Risk Engine & Screener

* [ ] **TODO 2.1:** Buat fungsi `RiskManager.check(pool_data)` untuk memfilter *banned categories* dan *keywords*.
* [ ] **TODO 2.2:** Buat fungsi `PoolScreener.scan(criteria)` yang mengembalikan daftar pool yang lolos filter Module A dan kriteria performa.
* [ ] **TODO 2.3:** Buat *database/local file log* sederhana untuk menyimpan data *screening* sebagai basis *self-improvement*.

### Phase 3: Entry Execution

* [ ] **TODO 3.1:** Implementasi fungsi kalkulasi bin untuk strategi `SPOT`, `CURVE`, dan `BID_ASK`.
* [ ] **TODO 3.2:** Implementasi fungsi `Position.open()` menggunakan Meteora SDK berdasarkan kalkulasi bin di atas.
* [ ] **TODO 3.3:** Buat modul *Auto-Range Calculator* berbasis volatilitas.

### Phase 4: Monitoring (Daemon) & Exit Execution

* [ ] **TODO 4.1:** Buat *Daemon Script* yang berjalan asinkron untuk memonitor posisi dompet.
* [ ] **TODO 4.2:** Implementasi *logic* `Evaluator` (cek TP, SL percentage, dan kalkulasi Trailing Stop).
* [ ] **TODO 4.3:** Implementasi fungsi `Position.close()` (Withdraw dari DLMM).
* [ ] **TODO 4.4:** Implementasi fungsi *Auto Zap/Swap* ke SOL menggunakan Jupiter API atau Meteora Router setelah posisi ditutup.

### Phase 5: Self-Learning & Optimization

* [ ] **TODO 5.1:** Buat modul analisis pasca-trade (menghitung *Actual PnL* vs *Expected PnL*).
* [ ] **TODO 5.2:** Implementasi *feedback loop* yang memperbarui parameter *screening* dan parameter *exit plan* secara otomatis.

---

## 4. CONTEXT RECOVERY PROTOCOL (For AI Agent)

Jika Anda (AI) baru saja di-*reset* atau mengalami *limit context*, ikuti prosedur berikut sebelum menulis kode:

1. **Acknowledge:** Konfirmasi bahwa Anda telah membaca "PRD: HELP (Hermes Liquidity Provider)".
2. **Locate:** Tanyakan kepada pengguna: *"Kita sedang berada di Phase berapa dan TODO nomor berapa?"*
3. **Review State:** Minta pengguna menempelkan kode terakhir dari modul yang sedang dikerjakan (atau *error* terakhir yang muncul) agar perbaikan tetap terisolasi dan tidak merusak *blueprint*.
4. **Execute:** Lanjutkan penulisan kode atau perbaikan sistem dengan tetap mematuhi batasan Tech Stack dan arsitektur di atas.
