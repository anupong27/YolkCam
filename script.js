// =============================
// 🔹 ฟังก์ชันแปลง RGB → Lab และคำนวณ ΔE
// =============================
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
  _z = _z > 0.008856 ? Math.cbrt(_z) : 7.787 * _z + 16 / 116;
  return { L: 116 * _y - 16, a: 500 * (_x - _y), b: 200 * (_y - _z) };
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

// =============================
// 🔸 Roche YolkFan สีมาตรฐาน
// =============================
const rocheShades = [
  { name: "1", rgb: [245.5, 218.8, 101.8] }, { name: "2", rgb: [252.2, 216.2, 80.2] },
  { name: "3", rgb: [252.4, 212.1, 69.7] },  { name: "4", rgb: [254.7, 208.7, 48.7] },
  { name: "5", rgb: [253.6, 197.5, 29.3] },  { name: "6", rgb: [253.5, 191.1, 18] },
  { name: "7", rgb: [254.2, 185.9, 5.6] },   { name: "8", rgb: [255, 179, 3] },
  { name: "9", rgb: [253, 168, 1.1] },   { name: "10", rgb: [254, 155.8, 2.4] },
  { name: "11", rgb: [254.7, 141.9, 4.3] },  { name: "12", rgb: [254.2, 131.7, 7.5] },
  { name: "13", rgb: [253.8, 123.4, 16.1] },  { name: "14", rgb: [254.7, 105.7, 25.7] },
  { name: "15", rgb: [254, 94, 32.3] }, 
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

// =============================
// 🔸 การตั้งค่าภาพ / กล้อง
// =============================
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const imageInput = document.getElementById("imageInput");
const shadePreview = document.getElementById("shadePreview");
const colorResult = document.getElementById("colorResult");
const rocheResult = document.getElementById("rocheResult");
const errorMessage = document.getElementById("errorMessage");
const useCameraBtn = document.getElementById("useCamera");
const useImageBtn = document.getElementById("useImage");
const analyzeBtn = document.getElementById("analyzeYolk");
const zoomSlider = document.getElementById("zoomSlider");
const zoomValue = document.getElementById("zoomValue");

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

// =============================
// 🔹 Zoom Camera
// =============================
zoomSlider.addEventListener("input", async () => {
  const zoom = parseFloat(zoomSlider.value);
  zoomValue.textContent = `${zoom.toFixed(1)}×`;

  if (videoStream) {
    const [track] = videoStream.getVideoTracks();
    const capabilities = track.getCapabilities();
    if (capabilities.zoom) {
      try {
        await track.applyConstraints({ advanced: [{ zoom }] });
      } catch (err) {
        console.warn("ไม่สามารถซูมกล้องได้:", err);
      }
    }
  }
});

// =============================
// 🔹 ฟังก์ชันทั่วไป
// =============================
function resetCanvasState() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  loadedImage = null;
  selectedX = null;
  selectedY = null;
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
  videoElement.srcObject = null;
}

function getColorAtPoint(x, y) {
  const pixel = ctx.getImageData(x, y, 1, 1).data;
  return { r: pixel[0], g: pixel[1], b: pixel[2] };
}

function drawCircleAtSelected() {
  if (selectedX != null && selectedY != null) {
    ctx.beginPath();
    ctx.arc(selectedX, selectedY, 10, 0, 2 * Math.PI);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "orange";
    ctx.stroke();
  }
}

function updateColorAtSelected(color = null) {
  if (!color) color = getColorAtPoint(selectedX, selectedY);
  if (!color) return;
  const lab = rgbToLab(color.r, color.g, color.b);
  const { closestShade, minDistance } = findClosestRocheShade(lab);
  colorResult.textContent = `RGB: (${color.r}, ${color.g}, ${color.b}) | Lab: (${lab.L.toFixed(1)}, ${lab.a.toFixed(1)}, ${lab.b.toFixed(1)})`;
  rocheResult.textContent = `ระดับสีไข่แดง: ${closestShade.name} (ΔE=${minDistance.toFixed(2)})`;
  shadePreview.style.backgroundColor = `rgb(${closestShade.rgb.join(",")})`;
}

// =============================
// 🔹 ใช้กล้อง
// =============================
useCameraBtn.addEventListener("click", async () => {
  resetCanvasState();
  isCameraMode = true;
  imageInput.style.display = "none";

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    videoElement.srcObject = videoStream;

    const [track] = videoStream.getVideoTracks();
    const capabilities = track.getCapabilities();

    if (capabilities.zoom) {
      zoomSlider.min = capabilities.zoom.min;
      zoomSlider.max = capabilities.zoom.max;
      zoomSlider.step = capabilities.zoom.step || 0.1;
      zoomSlider.value = capabilities.zoom.min;
      zoomSlider.disabled = false;
    } else {
      zoomSlider.disabled = true;
      zoomValue.textContent = "ไม่รองรับ";
    }

    videoElement.onloadedmetadata = () => {
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      function draw() {
        if (isCameraMode) {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          drawCircleAtSelected();
          requestAnimationFrame(draw);
        }
      }
      draw();
    };
  } catch (err) {
    errorMessage.textContent = "ไม่สามารถเปิดกล้องได้: " + err.message;
    errorMessage.style.display = "block";
  }
});

// =============================
// 🔹 โหลดภาพนิ่ง
// =============================
useImageBtn.addEventListener("click", () => {
  resetCanvasState();
  isCameraMode = false;
  imageInput.click();
});

imageInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    loadedImage = img;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
  };
  img.src = URL.createObjectURL(file);
});

// =============================
// 🔹 คลิกเลือกจุด
// =============================
canvas.addEventListener("click", e => {
  const rect = canvas.getBoundingClientRect();
  selectedX = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
  selectedY = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
  drawCircleAtSelected();
  updateColorAtSelected();
});

// =============================
// 🔸 วิเคราะห์ไข่แดงด้วย OpenCV.js
// =============================
async function detectYolkWithOpenCV() {
  if (typeof cv === "undefined") {
    alert("⏳ กำลังโหลด OpenCV.js กรุณารอสักครู่...");
    return;
  }

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let src = cv.matFromImageData(imgData);
  let hsv = new cv.Mat();
  let mask = new cv.Mat();
  let kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5,5));

  cv.cvtColor(src, hsv, cv.COLOR_RGBA2HSV);
  let lower = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [10, 60, 80, 0]);
  let upper = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [35, 255, 255, 255]);
  cv.inRange(hsv, lower, upper, mask);

  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
  cv.GaussianBlur(mask, mask, new cv.Size(9,9), 2, 2);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let maxArea = 0, c = null;
  for (let i = 0; i < contours.size(); i++) {
    const area = cv.contourArea(contours.get(i));
    if (area > maxArea) {
      maxArea = area;
      c = contours.get(i);
    }
  }

  if (c && maxArea > 0) {
    let roiMask = new cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1);
    let cntVector = new cv.MatVector();
    cntVector.push_back(c);
    cv.drawContours(roiMask, cntVector, 0, new cv.Scalar(255), -1);

    let meanColor = cv.mean(src, roiMask);
    selectedX = Math.floor(cv.moments(c).m10 / cv.moments(c).m00);
    selectedY = Math.floor(cv.moments(c).m01 / cv.moments(c).m00);
    drawCircleAtSelected();
    updateColorAtSelected({r: meanColor[0], g: meanColor[1], b: meanColor[2]});
    rocheResult.textContent += " 🟡 (ตรวจจับอัตโนมัติ)";

    roiMask.delete(); cntVector.delete();
  } else {
    errorMessage.textContent = "ไม่พบบริเวณไข่แดง";
    errorMessage.style.display = "block";
  }

  src.delete(); hsv.delete(); mask.delete(); lower.delete(); upper.delete(); contours.delete(); hierarchy.delete(); kernel.delete();
}

analyzeBtn.addEventListener("click", detectYolkWithOpenCV);


