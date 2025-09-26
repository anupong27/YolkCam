// ฟังก์ชันแปลง RGB → Lab และคำนวณ ΔE
function rgbToXyz(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  return { x: x * 100, y: y * 100, z: z * 100 };
}

function xyzToLab(x, y, z) {
  const refX = 95.047, refY = 100.0, refZ = 108.883;
  let _x = x / refX, _y = y / refY, _z = z / refZ;
  _x = _x > 0.008856 ? Math.cbrt(_x) : 7.787 * _x + 16 / 116;
  _y = _y > 0.008856 ? Math.cbrt(_y) : 7.787 * _y + 16 / 116;
  _z = _z > 0.008856 ? Math.cbrt(_z) : 7.787 * _z + 2 / 116;
  return {
    L: 116 * _y - 16,
    a: 500 * (_x - _y),
    b: 200 * (_y - _z)
  };
}

function rgbToLab(r, g, b) {
  const { x, y, z } = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

function deltaE(lab1, lab2) {
  return Math.sqrt(
    Math.pow(lab1.L - lab2.L, 2) +
    Math.pow(lab1.a - lab2.a, 2) +
    Math.pow(lab1.b - lab2.b, 2)
  );
}

// เฉด Roche YolkFan
const rocheShades = [
{ name: "1",  rgb: [241, 202, 107] },
  { name: "2",  rgb: [247, 198,  89] },
  { name: "3",  rgb: [252, 198,  83] },
  { name: "4",  rgb: [255, 197,  68] },
  { name: "5",  rgb: [255, 187,  40] },
  { name: "6",  rgb: [255, 183,  26] },
  { name: "7",  rgb: [255, 182,   0] },
  { name: "8",  rgb: [255, 180,   0] },
  { name: "9",  rgb: [255, 172,   0] },
  { name: "10", rgb: [255, 165,   0] },
  { name: "11", rgb: [255, 157,   0] },
  { name: "12", rgb: [255, 144,   0] },
  { name: "13", rgb: [255, 140,   0] },
  { name: "14", rgb: [255, 129,   9] },
  { name: "15", rgb: [253, 116,  25] },
  { name: "16", rgb: [239,  95,  30] },
].map(s => ({ ...s, lab: rgbToLab(...s.rgb) }));

function findClosestRocheShade(labSample) {
  let minDistance = Infinity, closestShade = null;
  for (const shade of rocheShades) {
    const dist = deltaE(labSample, shade.lab);
    if (dist < minDistance) {
      minDistance = dist;
      closestShade = shade;
    }
  }
  return { closestShade, minDistance };
}

// DOM
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const imageInput = document.getElementById("imageInput");
const shadePreview = document.getElementById("shadePreview");
const colorResult = document.getElementById("colorResult");
const rocheResult = document.getElementById("rocheResult");
const errorMessage = document.getElementById("errorMessage");
const useCameraBtn = document.getElementById("useCamera");
const useImageBtn = document.getElementById("useImage");

let loadedImage = null;
let videoStream = null;
let selectedX = null;
let selectedY = null;
let isCameraMode = false;

const videoElement = document.createElement("video");
videoElement.autoplay = true;
videoElement.playsInline = true;
videoElement.style.display = "none";
document.body.appendChild(videoElement);

// ฟังก์ชันรีเซ็ต
function resetCanvasState() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  loadedImage = null;
  selectedX = null;
  selectedY = null;

  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
    videoStream = null;
  }

  videoElement.srcObject = null;
}

// อ่านค่าสี
function getColorAtPoint(x, y) {
  if (!ctx || x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  return { r: pixel[0], g: pixel[1], b: pixel[2] };
}

function drawCircleAtSelected() {
  if (selectedX === null || selectedY === null) return;

  if (isCameraMode && videoStream) {
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  } else if (loadedImage) {
    ctx.drawImage(loadedImage, 0, 0);
  }

  const radius = Math.min(10, canvas.width / 20);
  ctx.beginPath();
  ctx.arc(selectedX, selectedY, radius, 0, 2 * Math.PI);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "orange";
  ctx.stroke();
}

// เก็บผลการวิเคราะห์ล่าสุดไว้ในตัวแปร global
let latestAnalysis = {
  rgb: null,
  lab: null,
  roche: null,
  deltaE: null,
};

// แก้ไขฟังก์ชัน updateColorAtSelected ให้เก็บค่าใน latestAnalysis ด้วย
function updateColorAtSelected() {
  if (selectedX === null || selectedY === null) {
    colorResult.textContent = "🖱️ กรุณาเลือกจุดบนภาพหรือวิดีโอ";
    rocheResult.textContent = "📊 ระดับสีไข่แดง: -";
    shadePreview.style.backgroundColor = "";
    latestAnalysis = { rgb: null, lab: null, roche: null, deltaE: null };
    return;
  }

  const color = getColorAtPoint(selectedX, selectedY);
  if (!color) {
    colorResult.textContent = "🖱️ ไม่สามารถอ่านค่าสีได้";
    rocheResult.textContent = "📊 ระดับสีไข่แดง: -";
    shadePreview.style.backgroundColor = "";
    latestAnalysis = { rgb: null, lab: null, roche: null, deltaE: null };
    return;
  }

  const lab = rgbToLab(color.r, color.g, color.b);
  const { closestShade, minDistance } = findClosestRocheShade(lab);

  colorResult.textContent = `🖱️ RGB: (${color.r}, ${color.g}, ${color.b}) | Lab: (L*${lab.L.toFixed(2)}, a*${lab.a.toFixed(2)}, b*${lab.b.toFixed(2)})`;
  rocheResult.textContent = `📊 ระดับสีไข่แดง: ${closestShade.name} (ΔE = ${minDistance.toFixed(2)})`;
  shadePreview.style.backgroundColor = `rgb(${closestShade.rgb.join(",")})`;

  // บันทึกผลล่าสุด
  latestAnalysis.rgb = color;
  latestAnalysis.lab = lab;
  latestAnalysis.roche = closestShade.name;
  latestAnalysis.deltaE = minDistance;
}


// เรียกกล้องหลัง (ถ้ามี)
useCameraBtn.addEventListener("click", async () => {
  errorMessage.style.display = "none";
  resetCanvasState();
  isCameraMode = true;
  imageInput.style.display = "none";

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    videoElement.srcObject = videoStream;

    videoElement.onloadedmetadata = () => {
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      selectedX = Math.floor(canvas.width / 2);
      selectedY = Math.floor(canvas.height / 2);

      function drawVideo() {
        if (isCameraMode && videoStream) {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          drawCircleAtSelected();
          updateColorAtSelected();
          requestAnimationFrame(drawVideo);
        }
      }

      drawVideo();
    };
  } catch (err) {
    errorMessage.textContent = "ไม่สามารถเข้าถึงกล้องได้: " + err.message;
    errorMessage.style.display = "block";
    isCameraMode = false;
  }
});

// โหลดภาพ
useImageBtn.addEventListener("click", () => {
  errorMessage.style.display = "none";
  resetCanvasState();
  isCameraMode = false;
  imageInput.style.display = "block";
  imageInput.click();
});

imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  errorMessage.style.display = "none";

  if (!file || !file.type.startsWith("image/")) {
    errorMessage.textContent = "กรุณาเลือกไฟล์ภาพเท่านั้น";
    errorMessage.style.display = "block";
    return;
  }

  const img = new Image();
  img.onload = () => {
    loadedImage = img;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    selectedX = Math.floor(img.width / 2);
    selectedY = Math.floor(img.height / 2);

    drawCircleAtSelected();
    updateColorAtSelected();
  };
  img.onerror = () => {
    errorMessage.textContent = "ไม่สามารถโหลดภาพได้";
    errorMessage.style.display = "block";
  };
  img.src = URL.createObjectURL(file);
});

// 🖱️ รองรับการคลิกบนคอมพิวเตอร์
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  selectedX = Math.floor(x);
  selectedY = Math.floor(y);
  drawCircleAtSelected();
  updateColorAtSelected();
});

// 📱 รองรับการแตะบนมือถือ
canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length > 0) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
    selectedX = Math.floor(x);
    selectedY = Math.floor(y);
    drawCircleAtSelected();
    updateColorAtSelected();
    }
});

