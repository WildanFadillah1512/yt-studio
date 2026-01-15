// ============================================================================
// YT ANALYTICS ROBOT - V20 (ULTIMATE METRICS EDITION)
// ============================================================================
// Fitur:
// 1. Mencakup 5 Kelompok Metrik Lengkap (Hype, Premium, Remix, dll)
// 2. Logic Smart Update (Update Existing, Add New)
// 3. Delay & Stabilizer untuk menangani banyaknya kolom data

// 1. KONFIGURASI
// Ganti dengan URL Webhook hasil Deploy Terbaru Anda
const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwCJ_CB4s-948tY4P0gugctqVT500BaA9mALS7pxT5laAqwQWiESeTFv1j8qof_lQA4lg/exec";

// --- DAFTAR METRIK LENGKAP (SESUAI REQUEST USER) ---
const TARGET_METRICS = [
    // --- KELOMPOK 1: PERFORMA UTAMA ---
    "Penayangan",                       // View count
    "Waktu tonton (jam)",               // Watch time
    "Rata-rata durasi tonton",          // Avg view duration
    "Persentase penayangan rata-rata",  // Retention
    "Penayangan YouTube Premium",       // Premium Views

    // --- KELOMPOK 2: JANGKAUAN ---
    "Tayangan",                         // Impressions
    "Rasio klik-tayang dari tayangan",  // CTR
    "Penonton unik",                    // Unique viewers
    "Penayangan rata-rata per penonton",// Avg views per viewer

    // --- KELOMPOK 3: AUDIENS ---
    "Penonton baru",                    // New viewers
    "Penonton yang kembali",            // Returning viewers
    "Subscriber",                       // Total subs
    "Subscriber yang diperoleh",        // Subs gained
    "Subscriber yang hilang",           // Subs lost

    // --- KELOMPOK 4: INTERAKSI ---
    "Suka",                             // Likes
    "Tidak suka",                       // Dislikes
    "Suka (vs. tidak suka)",            // Sentiment ratio
    "Komentar ditambahkan",             // Comments
    "Pembagian",                        // Shares
    "Poin hype",                        // Hype points (New Feature)

    // --- KELOMPOK 5: KONVERSI & VIRALITAS ---
    "Jumlah remix",                     // Remixes created
    "Klik pada elemen layar akhir",     // End screen clicks
    "Simpanan playlist"                 // Playlist adds
];

// 2. UTILS & HELPERS
const delay = ms => new Promise(res => setTimeout(res, ms));
const clean = text => text ? text.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim() : "";
const getTimestamp = () => new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

// --- FUNGSI TUNGGU LOADING (STABILIZER) ---
async function waitForLoadingToFinish() {
    console.log("⏳ Menunggu stabilitas halaman...");
    let loading = document.querySelector('tp-yt-paper-spinner-lite[active], .ytcp-spinner');
    while (loading) {
        await delay(500);
        loading = document.querySelector('tp-yt-paper-spinner-lite[active], .ytcp-spinner');
    }
    // Tunggu tabel render
    let rows = document.querySelectorAll('yta-explore-table-row');
    let retries = 0;
    while (rows.length === 0 && retries < 40) { // Max 20 detik
        await delay(500);
        rows = document.querySelectorAll('yta-explore-table-row');
        retries++;
    }
    console.log("✅ Halaman Siap.");
}

// --- FUNGSI KLIK HEADER TANGGAL (AUTO SORT) ---
async function clickDateHeader() {
    console.log("📅 Mengatur urutan tanggal...");
    const headers = document.querySelectorAll('yta-explore-table-header-cell');
    for (const h of headers) {
        const titleEl = h.querySelector('#header-title');
        if (titleEl) {
            const text = titleEl.innerText.toLowerCase();
            if (text.includes('tanggal publikasi') || text.includes('publish date') || text.includes('date')) {
                titleEl.click();
                return true;
            }
        }
    }
    return false;
}

// --- FUNGSI EKSTRAKSI METADATA DASAR ---
function extractRowMeta(rowElement) {
    let title = "Tanpa Judul";
    const titleEl = rowElement.querySelector('#entity-title-value') || rowElement.querySelector('#video-title');
    if (titleEl) title = clean(titleEl.innerText);

    let date = "-";
    const dateHighlight = rowElement.querySelector('.highlighted-metadata');
    const dateSubtitle = rowElement.querySelector('#metatadata-subtitle-value');
    if (dateHighlight) {
        date = clean(dateHighlight.innerText);
    } else if (dateSubtitle) {
        let rawDate = clean(dateSubtitle.innerText);
        date = rawDate.replace(/Dipublikasikan|Published|Uploaded|Streamed/gi, '').trim();
    }

    let duration = "-";
    const thumbLabel = rowElement.querySelector('ytcp-thumbnail .label');
    if (thumbLabel) duration = clean(thumbLabel.innerText);

    return { title, date, duration };
}

// --- UI FINDER ---
function findPlusButton() {
    // Mencari tombol (+) untuk tambah metrik
    const selectors = ['.add-metric-button', '[aria-label="Tambahkan metrik ke tabel"]', '#add-metric-icon', 'ytcp-icon-button iron-icon[icon="icons:add-circle"]'];
    for (let sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return el.closest('ytcp-icon-button') || el;
    }
    return null;
}

// 3. UI BUILDER (PANEL ROBOT)
async function createPanel() {
    const old = document.getElementById('yt-robot-panel');
    if (old) old.remove();

    await waitForLoadingToFinish();

    const panel = document.createElement('div');
    panel.id = 'yt-robot-panel';
    panel.style.cssText = `position: fixed; top: 60px; right: 20px; width: 400px; background: #0c0c0c; color: #fff; z-index: 999999; border: 1px solid #333; border-radius: 12px; font-family: Roboto, sans-serif; box-shadow: 0 10px 50px rgba(0,0,0,0.8);`;

    panel.innerHTML = `
        <div style="padding:15px; background:#1f1f1f; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center; border-radius:12px 12px 0 0;">
            <h3 style="margin:0; font-size:15px; color:#4fc3f7; font-weight:bold;">YT Robot V20 (Full Metrics)</h3>
            <button id="btnClose" style="background:none; border:none; color:#aaa; font-size:20px; cursor:pointer;">&times;</button>
        </div>
        <div style="padding:15px;">
            <div style="margin-bottom:12px; font-size:11px; color:#bbb; line-height:1.4;">
                <strong>Status:</strong> Siap mengambil ${TARGET_METRICS.length} jenis data.<br>
                <em>Kelompok 1-5 (Premium, Hype, Remix, dll).</em>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <label style="font-size:11px; color:#81c784; font-weight:bold;">DAFTAR VIDEO:</label>
                <div style="font-size:10px;">
                    <a href="#" id="btnRefresh" style="color:#64b5f6; text-decoration:none;">🔄 Refresh</a> | 
                    <a href="#" id="toggleAll" style="color:#aaa; text-decoration:none;">Select All</a>
                </div>
            </div>
            <div id="videoBox" style="height:220px; overflow-y:auto; border:1px solid #333; padding:5px; background:#121212; margin-bottom:15px;"></div>

            <button id="btnRun" style="width:100%; padding:12px; background:#2e7d32; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px;">MULAI PROSES 🚀</button>
            <div id="status" style="margin-top:10px; font-size:11px; color:#888; text-align:center;">Menunggu perintah...</div>
        </div>
    `;

    document.body.appendChild(panel);

    document.getElementById('btnClose').onclick = () => panel.remove();
    document.getElementById('btnRefresh').onclick = scanRows;
    document.getElementById('toggleAll').onclick = (e) => {
        e.preventDefault();
        const chks = document.querySelectorAll('.chk-vid');
        if (chks.length) {
            const target = !chks[0].checked;
            chks.forEach(c => c.checked = target);
        }
    };
    document.getElementById('btnRun').onclick = runProcess;

    setTimeout(scanRows, 1000);
}

function scanRows() {
    const box = document.getElementById('videoBox');
    const rows = document.querySelectorAll('yta-explore-table-row');
    box.innerHTML = '';
    if (!rows.length) return box.innerHTML = '<div style="padding:10px; text-align:center; font-size:11px;">Data sedang dimuat...</div>';

    rows.forEach((el, idx) => {
        const meta = extractRowMeta(el);
        const div = document.createElement('div');
        div.style.borderBottom = "1px solid #222";
        div.innerHTML = `
            <label style="display:flex; align-items:center; cursor:pointer; padding:6px 4px;">
                <input type="checkbox" class="chk-vid" value="${idx}" style="margin-right:10px;">
                <div style="overflow:hidden;">
                    <div style="font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#e0e0e0;">${meta.title}</div>
                    <div style="font-size:10px; color:#777;">📅 ${meta.date}</div>
                </div>
            </label>`;
        box.appendChild(div);
    });
    document.getElementById('status').innerText = `Terdeteksi ${rows.length} video.`;
}

// 4. MAIN LOGIC (LOCK METRICS & SCRAPE)
async function runProcess() {
    const status = document.getElementById('status');
    const btn = document.getElementById('btnRun');
    const selectedIndices = Array.from(document.querySelectorAll('.chk-vid:checked')).map(c => parseInt(c.value));

    if (selectedIndices.length === 0) return alert("⚠️ Pilih minimal 1 Video untuk diproses!");

    btn.disabled = true;
    btn.style.opacity = "0.5";

    // --- STEP A: BUKA & KUNCI METRIK ---
    status.innerText = "⚙️ Mengkonfigurasi Metrik (1-5)...";
    const triggerBtn = findPlusButton();
    if (triggerBtn) {
        triggerBtn.click();
        await delay(1500); // Tunggu popup

        const items = document.querySelectorAll('yta-explore-column-picker-dialog ytcp-checkbox-lit');
        let needsApply = false;

        // Header default yang tidak boleh di-uncheck
        const BLACKLIST_HEADER = ['video', 'konten', 'durasi', 'duration', 'tanggal publikasi', 'publish date', 'tanggal upload'];

        for (const item of items) {
            const labelEl = item.querySelector('.label');
            const text = clean(labelEl ? labelEl.innerText : item.innerText);
            if (!text) continue;

            if (BLACKLIST_HEADER.includes(text.toLowerCase())) continue;

            const isTarget = TARGET_METRICS.includes(text);
            const isChecked = item.getAttribute('aria-checked') === 'true';

            // Logic: Jika Target tapi belum checked -> Check
            //        Jika BUKAN Target tapi checked -> Uncheck
            if (isTarget && !isChecked) {
                item.click(); needsApply = true; await delay(50);
            } else if (!isTarget && isChecked) {
                item.click(); needsApply = true; await delay(50);
            }
        }
        await delay(500);

        if (needsApply) {
            status.innerText = "💾 Menerapkan Kolom Tabel...";
            const apply = Array.from(document.querySelectorAll('button, ytcp-button-shape')).find(e => ['terapkan', 'apply'].includes(clean(e.innerText).toLowerCase()));
            if (apply) apply.click();

            // Delay Panjang karena YouTube me-render ulang tabel besar
            status.innerText = "⏳ Rendering Tabel (10 Detik)...";
            await delay(10000);
            await waitForLoadingToFinish();
        } else {
            const closeBtn = document.querySelector('yta-explore-column-picker-dialog #close-button');
            if (closeBtn) closeBtn.click(); else document.body.click();
        }
    }

    // --- STEP B: SORTING TANGGAL ---
    status.innerText = "📅 Mengurutkan Data...";
    await delay(1000);
    const sorted = await clickDateHeader();
    if (sorted) {
        status.innerText = "⏳ Tunggu Sorting (10 Detik)...";
        await delay(10000);
        await waitForLoadingToFinish();
    }

    // --- STEP C: MAPPING POSISI KOLOM ---
    status.innerText = "🔍 Membaca Struktur Kolom...";
    const finalHeaders = ["Judul Video", "Tanggal Upload", "Durasi"];
    const metricMap = [];

    const domHeaders = document.querySelectorAll('yta-explore-table-header-cell');
    domHeaders.forEach(h => {
        if (h.id === "new-metric-column") return;
        const txt = clean(h.innerText);
        const txtLower = txt.toLowerCase();

        // Ambil semua header selain 3 kolom utama (karena 3 kolom utama diambil dari metadata)
        if (!['video', 'konten', 'durasi', 'duration', 'tanggal publikasi', 'publish date', 'tanggal upload', 'date'].includes(txtLower) && txt !== "") {
            finalHeaders.push(txt);
            metricMap.push(txt);
        }
    });

    finalHeaders.push("Waktu Scrape");

    // --- STEP D: SCRAPING DATA ---
    const rows = document.querySelectorAll('yta-explore-table-row');
    const finalData = [];
    const scrapeTime = getTimestamp();

    rows.forEach((row, idx) => {
        if (!selectedIndices.includes(idx)) return;

        const rData = [];
        const meta = extractRowMeta(row);

        // 3 Kolom Utama
        rData.push(meta.title, meta.date, meta.duration);

        // Kolom Metrik Dinamis
        const cols = Array.from(row.querySelectorAll('.metric-column:not([hidden])'))
            .filter(c => c.id !== "new-metric-column");

        metricMap.forEach((_, i) => {
            if (cols[i]) {
                const valEl = cols[i].querySelector('.value-container') || cols[i];
                let val = clean(valEl.innerText);
                if (!val || val === "-") val = "0";
                rData.push(val);
            } else {
                rData.push("0");
            }
        });

        rData.push(scrapeTime);
        finalData.push(rData);
    });

    // --- STEP E: KIRIM KE SPREADSHEET ---
    status.innerText = "🚀 Mengirim Data...";
    try {
        await fetch(WEBHOOK_URL, {
            method: 'POST', mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headers: finalHeaders, rows: finalData })
        });
        status.innerText = "✅ SELESAI!";
        alert(`SUKSES!\n\n${finalData.length} Video berhasil diproses.\nSemua metrik (Kelompok 1-5) telah diambil.\nData yang sudah ada diupdate, data baru ditambahkan.`);
    } catch (e) {
        status.innerText = "❌ Gagal Kirim.";
        alert("Error Network: " + e.message);
    }

    btn.disabled = false;
    btn.style.opacity = "1";
}

createPanel();