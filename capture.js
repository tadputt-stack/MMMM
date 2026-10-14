// capture.js — แคปทั้งหน้าจอ (พื้นหลัง + กล่องกล้อง + เส้นมือ + ป๊อปอัปวง + การ์ดสถานะ)
const photoModal = document.getElementById('photo-modal');
const closeModal = document.getElementById('close-modal');
const capturedImage = document.getElementById('captured-image');
const downloadLink = document.getElementById('download-link');
const qrcodeContainer = document.getElementById('qrcode');

// ---------- ตัวช่วยวาด ----------
let bgImageCache = null;
let bgImageSrc = '';

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ดึงรูปพื้นหลังจาก CSS ของ body (background-image)
async function getBodyBackground() {
  const m = getComputedStyle(document.body).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
  if (!m) return null;
  if (bgImageCache && bgImageSrc === m[1]) return bgImageCache;
  const img = await loadImage(m[1]);
  bgImageSrc = m[1];
  bgImageCache = img;
  return img;
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// วาดภาพให้เต็มกรอบแบบ object-fit: cover
function drawCover(ctx, img, sw, sh, dx, dy, dw, dh) {
  if (!sw || !sh) return;
  const scale = Math.max(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  ctx.drawImage(img, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
}

// วาดข้อความของ element ตรงตำแหน่งบนหน้าจอ
function drawElementText(ctx, el) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.fillStyle = cs.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(el.innerText.trim(), r.left + r.width / 2, r.top + r.height / 2, r.width);
}

// ---------- ประกอบภาพทั้งหน้าจอ ----------
async function composeFullScreen(videoElement, canvasElement) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const scale = Math.min(window.devicePixelRatio || 1, 2);

  const out = document.createElement('canvas');
  out.width = Math.round(W * scale);
  out.height = Math.round(H * scale);
  const ctx = out.getContext('2d');
  ctx.scale(scale, scale);

  // 1) พื้นหลัง
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#121212';
  ctx.fillRect(0, 0, W, H);
  const bg = await getBodyBackground();
  if (bg) drawCover(ctx, bg, bg.naturalWidth, bg.naturalHeight, 0, 0, W, H);

  // 2) กล่องกล้อง (ภาพวิดีโอ + เส้นมือ กลับด้านเป็นกระจก)
  const box = document.querySelector('.container');
  if (box) {
    const r = box.getBoundingClientRect();
    ctx.save();
    roundRectPath(ctx, r.left, r.top, r.width, r.height, 16);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(r.left, r.top, r.width, r.height);
    ctx.translate(r.left + r.width, r.top);
    ctx.scale(-1, 1);
    drawCover(ctx, videoElement, videoElement.videoWidth, videoElement.videoHeight, 0, 0, r.width, r.height);
    drawCover(ctx, canvasElement, canvasElement.width, canvasElement.height, 0, 0, r.width, r.height);
    ctx.restore();
  }

  // 3) ป๊อปอัปวง (ถ้ากำลังแสดงอยู่)
  const popup = document.getElementById('band-popup');
  if (popup && popup.classList.contains('show') && popup.complete && popup.naturalWidth) {
    drawCover(ctx, popup, popup.naturalWidth, popup.naturalHeight, 0, 0, W, H);
  }

  // 4) การ์ดเพลงสไตล์ Glassmorphism (แบบที่ 1)
  const card = document.getElementById('status-card');
  if (card) {
    const r = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    const radius = parseFloat(cs.borderTopLeftRadius) || 28;

    // ตัวการ์ดพื้นหลังโปร่งแสง
    ctx.save();
    roundRectPath(ctx, r.left, r.top, r.width, r.height, radius);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 4.1 รูปปกอัลบั้ม
    const cover = document.getElementById('album-cover');
    if (cover && cover.complete && cover.naturalWidth) {
      const cr = cover.getBoundingClientRect();
      ctx.save();
      roundRectPath(ctx, cr.left, cr.top, cr.width, cr.height, 18);
      ctx.clip();
      ctx.drawImage(cover, cr.left, cr.top, cr.width, cr.height);
      ctx.restore();
    }

    // 4.2 ชื่อเพลง
    const songEl = document.getElementById('song-display');
    if (songEl) {
      const sr = songEl.getBoundingClientRect();
      ctx.font = 'bold 20px Kanit, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(songEl.innerText.trim(), sr.left, sr.top, r.width - 90);
    }

    // 4.3 ชื่อศิลปิน
    const bandEl = document.getElementById('band-display');
    if (bandEl) {
      const br = bandEl.getBoundingClientRect();
      ctx.font = '500 15px Kanit, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(bandEl.innerText.trim(), br.left, br.top, r.width - 90);
    }

    // 4.4 แผ่นเสียงไวนิลมุมขวาล่าง
    const vinylContainer = document.getElementById('vinyl-container');
    const discCenter = document.getElementById('disc-center-img');
    if (vinylContainer) {
      const vr = vinylContainer.getBoundingClientRect();
      const cx = vr.left + vr.width / 2;
      const cy = vr.top + vr.height / 2;
      const vRadius = vr.width / 2;

      // ตัวแผ่นสีดำไวนิล
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, vRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#222222';
      ctx.fill();
      ctx.strokeStyle = '#383838';
      ctx.lineWidth = 2;
      ctx.stroke();

      // ร่องแผ่นเสียง
      for (let ring = vRadius * 0.55; ring < vRadius * 0.95; ring += 7) {
        ctx.beginPath();
        ctx.arc(cx, cy, ring, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // รูปวงกลมตรงกลาง (Disc label)
      const labelRadius = vRadius * 0.48;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, labelRadius, 0, Math.PI * 2);
      ctx.clip();
      if (discCenter && discCenter.complete && discCenter.naturalWidth) {
        ctx.drawImage(discCenter, cx - labelRadius, cy - labelRadius, labelRadius * 2, labelRadius * 2);
      } else {
        ctx.fillStyle = '#111111';
        ctx.fill();
      }
      ctx.restore();

      // รูแกนกลาง
      ctx.beginPath();
      ctx.arc(cx, cy, vRadius * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(18, 18, 18, 0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  return out;
}

// ---------- อัปโหลดภาพขึ้น Cloud เพื่อสร้าง QR Code ที่ดาวน์โหลดได้จริง ----------
async function uploadToTmpFiles(blob) {
  const formData = new FormData();
  formData.append('file', blob, 'handsync-capture.png');
  const response = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: formData
  });
  if (!response.ok) throw new Error('tmpfiles failed');
  const result = await response.json();
  if (result && result.data && result.data.url) {
    // แปลงเป็น Direct download link: tmpfiles.org/dl/...
    return result.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  }
  throw new Error('invalid tmpfiles response');
}

async function uploadToFreeImage(blob) {
  const formData = new FormData();
  formData.append('key', '6d207e02198a847aa98d0a2a901485a5');
  formData.append('action', 'upload');
  formData.append('source', blob, 'handsync-capture.png');
  formData.append('format', 'json');
  const response = await fetch('https://freeimage.host/api/1/upload', {
    method: 'POST',
    body: formData
  });
  if (!response.ok) throw new Error('freeimage failed');
  const result = await response.json();
  if (result && result.image && result.image.url) {
    return result.image.url;
  }
  throw new Error('invalid freeimage response');
}

async function uploadToLitterbox(blob) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '24h');
  formData.append('fileToUpload', blob, 'handsync-capture.png');
  const response = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: formData
  });
  if (!response.ok) throw new Error('litterbox failed');
  const text = await response.text();
  if (text && text.startsWith('http')) {
    return text.trim();
  }
  throw new Error('invalid litterbox response');
}

async function uploadImageToCloud(blob) {
  // ลอง tmpfiles.org ก่อน (ความเร็วสูง ไม่ต้องใช้ key)
  try {
    const url = await uploadToTmpFiles(blob);
    if (url) return url;
  } catch (e1) {
    console.warn("Upload service 1 failed, trying service 2...", e1);
  }

  // ลอง freeimage.host สำรอง
  try {
    const url = await uploadToFreeImage(blob);
    if (url) return url;
  } catch (e2) {
    console.warn("Upload service 2 failed, trying service 3...", e2);
  }

  // ลอง litterbox.catbox.moe สำรอง
  try {
    const url = await uploadToLitterbox(blob);
    if (url) return url;
  } catch (e3) {
    console.warn("Upload service 3 failed:", e3);
  }

  throw new Error("ไม่สามารถอัปโหลดภาพขึ้นคลาวด์ได้");
}

// ---------- ระบบนับถอยหลัง 3 วินาที & แฟลชกล้อง ----------
function playCountdownSound(isSnap = false) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isSnap) {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(850, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    }
  } catch (e) {}
}

function startCountdown(seconds = 3) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('countdown-overlay');
    const numDisplay = document.getElementById('countdown-number');
    const btn = document.getElementById('btn-capture');

    if (!overlay || !numDisplay) {
      setTimeout(resolve, seconds * 1000);
      return;
    }

    let current = seconds;
    overlay.classList.add('active');

    function step() {
      if (current > 0) {
        numDisplay.innerText = current;
        numDisplay.classList.remove('pulse');
        void numDisplay.offsetWidth; // trigger reflow
        numDisplay.classList.add('pulse');
        playCountdownSound(false);

        if (btn) {
          btn.innerHTML = `
            <svg class="camera-icon" viewBox="0 0 24 24"><path d="M4 7h3.2L8.6 5h6.8l1.4 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm8 11a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0-2a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
            <span>นับ ${current}...</span>
          `;
        }

        current--;
        setTimeout(step, 1000);
      } else {
        // เมื่อนับถึง 0: เล่นเสียงแชะ + แฟลช
        playCountdownSound(true);
        overlay.classList.remove('active');

        const flash = document.getElementById('camera-flash');
        if (flash) {
          flash.classList.add('flash');
          setTimeout(() => flash.classList.remove('flash'), 350);
        }

        if (btn) {
          btn.innerHTML = `
            <svg class="camera-icon" viewBox="0 0 24 24"><path d="M4 7h3.2L8.6 5h6.8l1.4 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm8 11a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0-2a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
            <span>แคปหน้าจอ</span>
          `;
          btn.disabled = false;
        }

        setTimeout(resolve, 80);
      }
    }

    step();
  });
}

function initCapture(videoElement, canvasElement) {
  const btnCapture = document.getElementById('btn-capture');

  if (!btnCapture) return;

  let isCapturing = false;

  btnCapture.addEventListener('click', async () => {
    if (isCapturing) return;

    try {
      if (!videoElement || videoElement.readyState < 2) {
        alert("กล้องยังไม่พร้อมใช้งาน กรุณารอสักครู่");
        return;
      }

      isCapturing = true;
      btnCapture.disabled = true;

      // ⏳ 1. นับถอยหลัง 3 วินาที พร้อมเสียง Beep และเอฟเฟกต์แฟลช
      await startCountdown(3);

      // 2. ประกอบภาพเต็มหน้าจอ
      const fullCanvas = await composeFullScreen(videoElement, canvasElement);

      // 3. ภาพเต็มหน้าจอ สำหรับแสดงผลและดาวน์โหลดลงเครื่องคอมทันที
      const imageBase64 = fullCanvas.toDataURL('image/png');
      capturedImage.src = imageBase64;
      downloadLink.href = imageBase64;

      // 4. เปิด Modal ป๊อปอัปทันที
      photoModal.style.display = "flex";

      // 5. แสดงสถานะกำลังสร้าง QR Code
      qrcodeContainer.innerHTML = `
        <div class="qr-loading-state">
          <div class="qr-spinner"></div>
          <span style="color: #444; font-size: 0.85rem; font-weight: 500;">กำลังสร้าง QR Code สำหรับดาวน์โหลด...</span>
        </div>
      `;

      // 6. แปลงภาพเป็น Blob และอัปโหลดขึ้น Cloud เพื่อสร้าง QR Code ที่สแกนเปิดได้จริง
      fullCanvas.toBlob(async (blob) => {
        if (!blob) {
          qrcodeContainer.innerHTML = `<p class="qr-error-text">แปลงไฟล์รูปไม่สำเร็จ กรุณากดปุ่มดาวน์โหลดแทน</p>`;
          return;
        }

        try {
          const directUrl = await uploadImageToCloud(blob);
          qrcodeContainer.innerHTML = "";

          if (typeof QRCode !== "undefined") {
            new QRCode(qrcodeContainer, {
              text: directUrl,
              width: 220,
              height: 220,
              correctLevel: QRCode.CorrectLevel.M
            });

            const linkElem = document.createElement('div');
            linkElem.className = 'qr-success-link';
            linkElem.innerHTML = `
              <p style="margin: 10px 0 4px 0; color: #00aa88; font-size: 0.85rem; font-weight: 600;">✓ สแกนด้วยมือถือเพื่อดูและบันทึกภาพ HD</p>
              <a href="${directUrl}" target="_blank" style="color: #666; font-size: 0.78rem; text-decoration: underline;">หรือเปิดดูผ่านลิงก์ตรง ↗</a>
            `;
            qrcodeContainer.appendChild(linkElem);
          }
        } catch (uploadErr) {
          console.error("Cloud Upload Error:", uploadErr);
          qrcodeContainer.innerHTML = `
            <p class="qr-error-text">⚠️ ไม่สามารถสร้าง QR ได้ (อินเทอร์เน็ตขัดข้อง)<br>กรุณากดปุ่ม <b>ดาวน์โหลดรูปภาพ</b> ด้านล่างแทน</p>
          `;
        }
      }, 'image/png');

    } catch (err) {
      console.error("Capture Error:", err);
      alert("ไม่สามารถแคปภาพได้: " + err.message);
    } finally {
      isCapturing = false;
      btnCapture.disabled = false;
    }
  });

  if (closeModal) {
    closeModal.addEventListener('click', () => { photoModal.style.display = "none"; });
  }

  window.addEventListener('click', (e) => {
    if (e.target === photoModal) photoModal.style.display = "none";
  });
}