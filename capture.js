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

  // 4) การ์ดสถานะเพลง (มุมขวาบน)
  const card = document.getElementById('status-card');
  if (card) {
    const r = card.getBoundingClientRect();
    const cs = getComputedStyle(card);
    roundRectPath(ctx, r.left, r.top, r.width, r.height, parseFloat(cs.borderTopLeftRadius) || 12);
    ctx.fillStyle = cs.backgroundColor;
    ctx.fill();
    ctx.strokeStyle = cs.borderTopColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    drawElementText(ctx, card.firstElementChild);          // "วงที่ตรวจพบ:"
    drawElementText(ctx, document.getElementById('band-display'));
    drawElementText(ctx, document.getElementById('song-display'));

    const btn = document.getElementById('btn-capture');    // ปุ่มแคป
    if (btn) {
      const br = btn.getBoundingClientRect();
      const bcs = getComputedStyle(btn);
      roundRectPath(ctx, br.left, br.top, br.width, br.height, parseFloat(bcs.borderTopLeftRadius) || 2);
      ctx.fillStyle = bcs.backgroundColor;
      ctx.fill();
      drawElementText(ctx, btn);
    }
  }

  return out;
}

// ย่อภาพให้เล็กพอจะใส่ใน QR ได้ (ลดขนาด/คุณภาพทีละขั้นจนข้อมูลสั้นพอ)
function makeQrData(srcCanvas) {
  const MAX_CHARS = 1200;                 // ยิ่งสั้น QR ยิ่งหยาบ สแกนง่าย
  const widths = [160, 128, 112, 96, 80, 64, 48, 32];
  const qualities = [0.2, 0.1];
  for (const w of widths) {
    const h = Math.max(1, Math.round(w * srcCanvas.height / srcCanvas.width));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(srcCanvas, 0, 0, w, h);
    for (const q of qualities) {
      const data = c.toDataURL('image/jpeg', q);
      if (data.length <= MAX_CHARS) return data;
    }
  }
  return null;
}

function initCapture(videoElement, canvasElement) {
  const btnCapture = document.getElementById('btn-capture');

  if (!btnCapture) return;

  btnCapture.addEventListener('click', async () => {
    try {
      if (!videoElement || videoElement.readyState < 2) {
        alert("กล้องยังไม่พร้อมใช้งาน กรุณารอสักครู่");
        return;
      }

      const fullCanvas = await composeFullScreen(videoElement, canvasElement);

      // 1. ภาพเต็มหน้าจอ สำหรับแสดงผลและดาวน์โหลด
      const imageBase64 = fullCanvas.toDataURL('image/png');
      capturedImage.src = imageBase64;
      downloadLink.href = imageBase64;

      // 2. QR Code (ถ้าสร้างไม่ได้ ก็ยังแสดงภาพและดาวน์โหลดได้ตามปกติ)
      qrcodeContainer.innerHTML = "";
      try {
        const qrData = makeQrData(fullCanvas);
        if (qrData && typeof QRCode !== "undefined") {
          new QRCode(qrcodeContainer, {
            text: qrData,
            width: 280,
            height: 280,
            correctLevel: QRCode.CorrectLevel.L // Error Correction ต่ำสุด ลายหยาบ สแกนง่าย
          });
        } else {
          qrcodeContainer.textContent = "ภาพละเอียดเกินกว่าจะทำ QR ได้ กรุณากดดาวน์โหลดแทน";
        }
      } catch (qrErr) {
        console.warn("QR Error:", qrErr);
        qrcodeContainer.textContent = "สร้าง QR ไม่ได้ กรุณากดดาวน์โหลดแทน";
      }

      photoModal.style.display = "flex";
    } catch (err) {
      console.error("Capture Error:", err);
      alert("ไม่สามารถแคปภาพได้: " + err.message);
    }
  });

  if (closeModal) {
    closeModal.addEventListener('click', () => { photoModal.style.display = "none"; });
  }

  window.addEventListener('click', (e) => {
    if (e.target === photoModal) photoModal.style.display = "none";
  });
}