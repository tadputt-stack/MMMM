// (ลบบรรทัด import ออกให้หมด)

const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// เรียกใช้งานฟังก์ชันที่โหลดมาจาก capture.js
initCapture(videoElement, canvasElement);

// ... (โค้ด MediaPipe และการเล่นเพลงเดิมทั้งหมด)
const bandDisplay = document.getElementById('band-display');
const songDisplay = document.getElementById('song-display');

let currentBand = "";
let currentSongIndex = 0;

// ==========================================
// ระบบนับเฟรม (Hold Counter) 50 เฟรม ≈ 3-4 วินาที
// ==========================================
const HOLD_TARGET = 40; 

let counters = {
  CARABAO: 0,
  THREEMANDOWN: 0,
  SLOTMACHINE: 0,
  Z9: 0,
  SILLYFOOLS: 0,
  FIST: 0,
  PAUSE_ONE_FINGER: 0,
  RESUME_TWO_FINGERS: 0
};

let isCooldown = false;
const currentAudio = new Audio();

// คลังเพลงของแต่ละวง
const bandPlaylist = {
  CARABAO: {
    bandName: "คาราบาว (Carabao)",
    songs: [
      { songName: "วณิพก", audioUrl: "songs/carabao1-full.mp3" },
      { songName: "ราชาเงินผ่อน", audioUrl: "songs/carabao2-full.mp3" },
      { songName: "เมดอินไทยแลนด์", audioUrl: "songs/carabao3-full.mp3" }
    ]
  },
  THREEMANDOWN: {
    bandName: "Three Man Down",
    songs: [
      { songName: "ฝนตกไหม", audioUrl: "songs/tmd3-full1.mp3" },
      { songName: "ถ้าเธอรักใครจริง", audioUrl: "songs/tmd3-full2.mp3" },
      { songName: "ข้างกัน", audioUrl: "songs/tmd3-full3.mp3" }
    ]
  },
  SLOTMACHINE: {
    bandName: "Slot Machine",
    songs: [
      { songName: "ผ่าน", audioUrl: "songs/sm1-full.mp3" },
      { songName: "จันทร์เจ้า", audioUrl: "songs/sm2-full.mp3" },
      { songName: "เคลิ้ม", audioUrl: "songs/sm3-full.mp3" }
    ]
  },
  Z9: {
    bandName: "Z9",
    songs: [
      { songName: "ทำใจไม่ได้", audioUrl: "songs/z9-full1.mp3" },
      { songName: "รักใครไม่เป็น", audioUrl: "songs/z9-full2.mp3" },
      { songName: "บทสรุปสุดท้าย", audioUrl: "songs/z9-full3.mp3" }
    ]
  },
  SILLYFOOLS: {
    bandName: "Silly Fools",
    songs: [
      { songName: "เพียงรัก", audioUrl: "songs/sf-full1.mp3" },
      { songName: "อย่าบอกว่ารัก", audioUrl: "songs/sf-full2.mp3" },
      { songName: "ไหนว่าไม่หลอกกัน", audioUrl: "songs/sf-full3.mp3" }
    ]
  }
};

// ==========================================
// ป๊อปอัปรูปวง (เต็มจอ ค้างไว้ตลอดที่เพลงเล่น)
// ==========================================
const POPUP_FOLDER = 'image'; // ชื่อโฟลเดอร์รูป

const popupImages = {
  CARABAO: `${POPUP_FOLDER}/pop_up_carabao.png`,
  THREEMANDOWN: `${POPUP_FOLDER}/pop_up_three_man_down.png`,
  SLOTMACHINE: `${POPUP_FOLDER}/pop_up_slot_machine.png`,
  Z9: `${POPUP_FOLDER}/pop_up_z9.png`,
  SILLYFOOLS: `${POPUP_FOLDER}/pop_up_silly_fools.png`
};

const bandPopup = document.getElementById('band-popup');
let popupBand = null; // วงที่ป๊อปอัปกำลังแสดงอยู่

function showBandPopup(band) {
  const src = popupImages[band];
  if (!src) return;

  // วงเดิม แค่เปลี่ยนเพลง -> ค้างไว้เฉยๆ ไม่ต้องขึ้นใหม่
  if (popupBand === band && bandPopup.classList.contains('show')) return;

  popupBand = band;
  bandPopup.src = src;
  bandPopup.classList.remove('show');
  void bandPopup.offsetWidth;        // รีเซ็ตให้เอฟเฟกต์เล่นใหม่
  bandPopup.classList.add('show');
}

function hideBandPopup() {
  popupBand = null;
  bandPopup.classList.remove('show');
}

// เพลงจบแล้วให้ป๊อปอัปหายไป
currentAudio.addEventListener('ended', hideBandPopup);

// ฟังก์ชันคำนวณระยะห่างระหว่างจุด 2 จุด
function getDistance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// 1. ตรวจจับสัญลักษณ์มือเดี่ยว
function detectSingleHandGesture(landmarks) {
  // ป้องกัน Error กรณี MediaPipe ส่งจุด Landmarks มาไม่ครบ
  if (!landmarks || landmarks.length < 21) return "UNKNOWN";
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringTip = landmarks[16];
  const pinkyTip = landmarks[20];

  const indexPip = landmarks[6];
  const middlePip = landmarks[10];
  const ringPip = landmarks[14];
  const pinkyPip = landmarks[18];

  const isIndexUp = indexTip.y < indexPip.y;
  const isMiddleUp = middleTip.y < middlePip.y;
  const isRingUp = ringTip.y < ringPip.y;
  const isPinkyUp = pinkyTip.y < pinkyPip.y;

  const isIndexDown = indexTip.y > indexPip.y;
  const isMiddleDown = middleTip.y > middlePip.y;
  const isRingDown = ringTip.y > ringPip.y;
  const isPinkyDown = pinkyTip.y > pinkyPip.y;

  // ☝️ 1.1 ชู 1 นิ้ว (นิ้วชี้) -> หยุดเพลง (Pause)
  if (isIndexUp && isMiddleDown && isRingDown && isPinkyDown) {
    return "PAUSE_ONE_FINGER";
  }

  // ✌️ 1.2 ชู 2 นิ้ว (ชี้ + กลาง) -> เล่นเพลงต่อ (Resume)
  // ตรวจสอบหลักๆ คือ นิ้วชี้กับนิ้วกลางตั้งขึ้น ส่วนนิ้วนางกับนิ้วก้อยพับลง
  if (isIndexUp && isMiddleUp && isRingDown && isPinkyDown) {
    return "RESUME_TWO_FINGERS";
  }

  // ✊ 1.3 กำมือ (Fist) -> ข้ามเพลง (ใช้มือข้างไหนก็ได้)
  if (isIndexDown && isMiddleDown && isRingDown && isPinkyDown) {
    return "FIST";
  }

  // 🤘 1.4 Silly Fools (Rock Sign: ชี้ + ก้อย)
  if (isIndexUp && isPinkyUp && isMiddleDown && isRingDown) return "SILLYFOOLS";

  // 👌 1.5 Z9 (โป้งแตะชี้เป็นวงกลมแน่นขึ้น < 0.045)
  const thumbIndexDist = getDistance(thumbTip, indexTip);
  if (thumbIndexDist < 0.045 && isMiddleUp && isRingUp && isPinkyUp) return "Z9";

  // 🤟 1.6 Three Man Down (ชู 3 นิ้ว: ชี้+กลาง+นาง)
  if (isIndexUp && isMiddleUp && isRingUp && isPinkyDown) return "THREEMANDOWN";

  // 🤙 1.7 Carabao (Shaka: โป้ง+ก้อย)
  const isThumbOut = Math.abs(thumbTip.x - indexPip.x) > 0.12;
  if (isThumbOut && isPinkyUp && isIndexDown && isMiddleDown) return "CARABAO";

  return "UNKNOWN";
}

// 2. ตรวจจับสัญลักษณ์ Slot Machine (รูปสามเหลี่ยม 🔺 2 มือ)
function detectTriangleGesture(hand1, hand2) {
  // ป้องกัน Array หลุด Scope
  if (!hand1 || hand1.length < 21 || !hand2 || hand2.length < 21) return "UNKNOWN";

  const h1IndexTip = hand1[8];
  const h1ThumbTip = hand1[4];
  const h1IndexPip = hand1[6];

  const h2IndexTip = hand2[8];
  const h2ThumbTip = hand2[4];
  const h2IndexPip = hand2[6];

  const indexDistance = getDistance(h1IndexTip, h2IndexTip);
  const thumbDistance = getDistance(h1ThumbTip, h2ThumbTip);

  const isH1IndexUp = h1IndexTip.y < h1IndexPip.y;
  const isH2IndexUp = h2IndexTip.y < h2IndexPip.y;

  if (indexDistance < 0.07 && thumbDistance < 0.08 && isH1IndexUp && isH2IndexUp) {
    return "SLOTMACHINE";
  }

  return "UNKNOWN";
}

// 3. ประมวลผลแต่ละเฟรมจากกล้อง
function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  let detectedGesture = "UNKNOWN";

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const landmarks = results.multiHandLandmarks[i];
      
      // 📌 เช็กความพร้อมของ HAND_CONNECTIONS ก่อนวาด
      if (typeof HAND_CONNECTIONS !== 'undefined' && window.drawConnectors) {
        drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#eff3f2', lineWidth: 3 });
        drawLandmarks(canvasCtx, landmarks, { color: '#1eff00', lineWidth: 1, radius: 4 });
      }
    }

    if (results.multiHandLandmarks.length === 2) {
      detectedGesture = detectTriangleGesture(
        results.multiHandLandmarks[0],
        results.multiHandLandmarks[1]
      );
    }

    if (detectedGesture === "UNKNOWN") {
      detectedGesture = detectSingleHandGesture(results.multiHandLandmarks[0]);
    }
  }

  handleGestureWithDelay(detectedGesture);
  canvasCtx.restore();
}
// 4. จัดการระบบนับเวลาค้างมือ 3-4 วินาที
function handleGestureWithDelay(gesture) {
  for (const key in counters) {
    if (key === gesture) {
      counters[key]++;
    } else {
      counters[key] = 0;
    }
  }

  if (counters[gesture] >= HOLD_TARGET) {
    counters[gesture] = 0;

    // --- ☝️ 4.1 ชู 1 นิ้วเพื่อหยุดเพลงชั่วคราว (Pause) ---
    if (gesture === "PAUSE_ONE_FINGER") {
      if (currentBand !== "") {
        currentAudio.pause();
        hideBandPopup();
        const bandData = bandPlaylist[currentBand];
        const songData = bandData.songs[currentSongIndex];
        songDisplay.innerText = `หยุดเพลงชั่วคราว: ${songData.songName}`;
      }
      return;
    }

// --- ✌️ 4.2 ชู 2 นิ้วเพื่อเล่นเพลงต่อ (Resume) ---
    if (gesture === "RESUME_TWO_FINGERS") {
      // ถ้ายังไม่มีการเลือกวง ให้ตั้งเป็นวงแรกชั่วคราว
      if (!currentBand) {
        currentBand = "CARABAO"; // หรือวงตั้งต้นที่คุณต้องการ
        currentSongIndex = 0;
      }

      if (currentBand && bandPlaylist[currentBand]) {
        const bandData = bandPlaylist[currentBand];
        const songData = bandData.songs[currentSongIndex];

        // ถ้ายังไม่มี src ให้ใส่เพลงปัจจุบันเข้าไปก่อน
        if (!currentAudio.src || currentAudio.src === "") {
          currentAudio.src = songData.audioUrl;
        }

        currentAudio.play().then(() => {
          bandDisplay.innerText = bandData.bandName;
          songDisplay.innerText = `กำลังเล่น (${currentSongIndex + 1}/${bandData.songs.length}): ${songData.songName}`;
          if (!bandPopup.classList.contains('show')) showBandPopup(currentBand);
        }).catch(err => {
          console.log("Audio Playback Error:", err);
          // หากโดน Autoplay Policy ของเบราว์เซอร์บล็อก ให้แจ้งผู้ใช้
          songDisplay.innerText = "คลิกที่หน้าจอ 1 ครั้งเพื่ออนุญาตให้เล่นเสียง";
        });
      }
      return;
    }

    // --- ✊ 4.3 กำมือเปลี่ยนเพลง (ข้ามไปเพลงถัดไป - ใช้มือข้างไหนก็ได้) ---
    if (gesture === "FIST") {
      if (!isCooldown && currentBand && bandPlaylist[currentBand]) {
        isCooldown = true;
        const songsList = bandPlaylist[currentBand].songs;
        currentSongIndex = (currentSongIndex + 1) % songsList.length;
        playCurrentSong();

        setTimeout(() => { isCooldown = false; }, 1500);
      }
      return;
    }

    // --- 4.4 สลับวงดนตรี ---
    if (gesture !== "UNKNOWN" && gesture !== currentBand) {
      currentBand = gesture;
      currentSongIndex = 0;
      playCurrentSong();
    }
  }
}

// 5. สั่งเล่น Audio
function playCurrentSong() {
  if (!currentBand || !bandPlaylist[currentBand]) return;

  const bandData = bandPlaylist[currentBand];
  const songData = bandData.songs[currentSongIndex];

  bandDisplay.innerText = bandData.bandName;
  songDisplay.innerText = `กำลังเล่น (${currentSongIndex + 1}/${bandData.songs.length}): ${songData.songName}`;

  currentAudio.src = songData.audioUrl;
  currentAudio.play().catch(err => console.log("Audio Playback Error:", err));

  showBandPopup(currentBand);
}

// 6. ตั้งค่า MediaPipe Hands
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({ image: videoElement });
  },
  width: 1280,
  height: 720
});

camera.start().catch(err => console.error("เปิดกล้องไม่ได้:", err));