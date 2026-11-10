// ============================================================================
// إعدادات الربط مع شيت جوجل (Google Apps Script Web App URL)
// ضع رابط الـ Web App الذي نسخته من Google Apps Script بين علامتي التنصيص بالأسفل:
// ============================================================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw8o1AJw6bkfeQAUkZ59Byco4q35LJXBJiaNgKYbIelnTQqmUDF8q2CoP4f6tUhZkVnCw/exec";

// قائمة الجوائز والعروض المتاحة في المعمل
const PRIZES_LIST = [
  "تحليل نقرس مجاني",
  "تحليل سكر مجاني",
  "تحليل كالسيوم مجاني",
  "تحليل وظائف الكلي creat مجاني",
  "تحليل انزيمات الكبد Alt مجاني",
  "خصم 50% علي تحليل صورة دم كاملة",
  "خصم 50% علي تحليل فيتامين د",
  "خصم 10% علي أي تحليل",
  "خصم 15% علي اي تحليل",
  "خصم 20% علي اي تحليل"
];

const REQUIRED_SCRATCH_PERCENT = 75;
const STORAGE_KEY = "red_friday_registered_phones_v2";

// عناصر الصفحة
const claimBtn = document.getElementById("claimBtn");
const shuffleStage = document.getElementById("shuffleStage");
const scratchStage = document.getElementById("scratchStage");
const scratchCanvas = document.getElementById("scratchCanvas");
const scratchContainer = document.getElementById("scratchContainer");
const scratchPercentText = document.getElementById("scratchPercentText");
const scratchProgressBar = document.getElementById("scratchProgressBar");
const scratchInstruction = document.getElementById("scratchInstruction");
const hiddenPrizeTitle = document.getElementById("hiddenPrizeTitle");
const winnerSection = document.getElementById("winnerSection");
const finalPrizeName = document.getElementById("finalPrizeName");
const prizeInput = document.getElementById("prizeInput");
const claimForm = document.getElementById("claimForm");
const userNameInput = document.getElementById("userName");
const userPhoneInput = document.getElementById("userPhone");
const formMessage = document.getElementById("formMessage");
const submitBtn = document.getElementById("submitBtn");
const submitBtnText = document.getElementById("submitBtnText");

let selectedPrize = "";
let isDrawing = false;
let isPrizeUnlocked = false;
let isSubmitting = false;
let ctx = null;
let memoryUsedPhones = [];

// دالة توحيد صيغة رقم التليفون (تحويل الأرقام العربية إلى إنجليزية، إزالة أي مسافات أو رموز، وضمان وجود الـ 0 في البداية)
function normalizePhone(value) {
  if (!value) return "";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  let str = String(value);
  for (let i = 0; i < 10; i++) {
    str = str.replace(new RegExp(arabicDigits[i], "g"), String(i));
  }
  // إزالة أي حرف غير رقمي (مثل المسافات أو + أو ' أو -)
  let digits = str.replace(/[^0-9]/g, "");

  // لو الرقم مكتوب بكود مصر 2010... نحوله إلى 010...
  if (digits.length === 12 && digits.startsWith("201")) {
    digits = digits.substring(1);
  }
  // لو الرقم مكون من 10 أرقام ويبدأ بـ 1 (بدون صفر)، نضيف الصفر في البداية
  if (digits.length === 10 && digits.startsWith("1")) {
    digits = "0" + digits;
  }
  return digits;
}

// استرجاع الأرقام المسجلة من (localStorage + window.name + الذاكرة) لضمان العمل حتى لو الملف مفتوح محلياً file://
function getLocalUsedPhones() {
  const combined = new Set(memoryUsedPhones);

  try {
    const rawLocal = localStorage.getItem(STORAGE_KEY);
    if (rawLocal) {
      JSON.parse(rawLocal).forEach((p) => combined.add(normalizePhone(p)));
    }
  } catch (e) {}

  try {
    if (window.name && window.name.startsWith("RF_PHONES:")) {
      const list = JSON.parse(window.name.replace("RF_PHONES:", ""));
      list.forEach((p) => combined.add(normalizePhone(p)));
    }
  } catch (e) {}

  return Array.from(combined).filter(Boolean);
}

function isPhoneAlreadyUsedLocally(phone) {
  const norm = normalizePhone(phone);
  if (!norm) return false;
  const usedList = getLocalUsedPhones();
  return usedList.includes(norm);
}

function saveLocalUsedPhone(phone) {
  const norm = normalizePhone(phone);
  if (!norm) return;

  if (!memoryUsedPhones.includes(norm)) {
    memoryUsedPhones.push(norm);
  }

  const allPhones = getLocalUsedPhones();
  if (!allPhones.includes(norm)) {
    allPhones.push(norm);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allPhones));
  } catch (e) {}

  try {
    window.name = "RF_PHONES:" + JSON.stringify(allPhones);
  } catch (e) {}
}

// تحويل الأرقام العربية تلقائياً أثناء الكتابة في خانة التليفون
userPhoneInput.addEventListener("input", () => {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  let val = userPhoneInput.value;
  for (let i = 0; i < 10; i++) {
    val = val.replace(new RegExp(arabicDigits[i], "g"), String(i));
  }
  userPhoneInput.value = val.replace(/[^0-9]/g, "").slice(0, 11);
});

// 1. الضغط على زرار "استلم هديتك"
claimBtn.addEventListener("click", () => {
  claimBtn.disabled = true;

  const randomIndex = Math.floor(Math.random() * PRIZES_LIST.length);
  selectedPrize = PRIZES_LIST[randomIndex];

  shuffleStage.classList.remove("hidden");
  shuffleStage.scrollIntoView({ behavior: "smooth", block: "center" });

  setTimeout(() => {
    shuffleStage.classList.add("hidden");
    scratchStage.classList.remove("hidden");
    hiddenPrizeTitle.textContent = selectedPrize;
    initScratchCanvas();
    scratchStage.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 2200);
});

// 2. تجهيز طبقة الخربشة الذهبية على الكانفاس
function initScratchCanvas() {
  const rect = scratchContainer.getBoundingClientRect();
  scratchCanvas.width = rect.width || 440;
  scratchCanvas.height = rect.height || 210;
  ctx = scratchCanvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, scratchCanvas.width, scratchCanvas.height);
  grad.addColorStop(0, "#d4af37");
  grad.addColorStop(0.5, "#ffd700");
  grad.addColorStop(1, "#b8860b");

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, scratchCanvas.width, scratchCanvas.height);

  ctx.fillStyle = "#4a0303";
  ctx.font = "bold 20px Cairo, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("✨ اخربش هنا لاكتشاف هديتك ✨", scratchCanvas.width / 2, scratchCanvas.height / 2 - 8);
  ctx.font = "bold 14px Cairo, sans-serif";
  ctx.fillText("(يجب خربشة 75% لاحتساب الجائزة)", scratchCanvas.width / 2, scratchCanvas.height / 2 + 22);
}

function getPointerPos(e) {
  const rect = scratchCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function scratchAt(e) {
  if (!isDrawing || isPrizeUnlocked || !ctx) return;
  if (e.cancelable) e.preventDefault();

  const pos = getPointerPos(e);
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 26, 0, Math.PI * 2);
  ctx.fill();

  checkScratchPercentage();
}

function checkScratchPercentage() {
  if (!ctx || isPrizeUnlocked) return;

  const imageData = ctx.getImageData(0, 0, scratchCanvas.width, scratchCanvas.height);
  const pixels = imageData.data;
  let transparentPixels = 0;
  let sampledTotal = 0;

  for (let i = 3; i < pixels.length; i += 16) {
    sampledTotal++;
    if (pixels[i] < 128) {
      transparentPixels++;
    }
  }

  const percent = Math.min(100, Math.round((transparentPixels / sampledTotal) * 100));
  scratchPercentText.textContent = `نسبة الخربشة: ${percent}% (المطلوب ${REQUIRED_SCRATCH_PERCENT}%)`;
  scratchProgressBar.style.width = `${percent}%`;

  if (percent >= REQUIRED_SCRATCH_PERCENT) {
    unlockPrize();
  }
}

function unlockPrize() {
  if (isPrizeUnlocked) return;
  isPrizeUnlocked = true;
  ctx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
  scratchPercentText.textContent = "تمت الخربشة بنجاح (100%) - مبروك!";
  scratchProgressBar.style.width = "100%";
  scratchInstruction.textContent = "🎉 مبروك! تم احتساب جائزتك بنجاح، سجل بياناتك بالأسفل الآن.";

  finalPrizeName.textContent = selectedPrize;
  prizeInput.value = selectedPrize;
  winnerSection.classList.remove("hidden");
  setTimeout(() => {
    winnerSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 200);
}

scratchCanvas.addEventListener("mousedown", (e) => { isDrawing = true; scratchAt(e); });
scratchCanvas.addEventListener("mousemove", scratchAt);
window.addEventListener("mouseup", () => { isDrawing = false; });

scratchCanvas.addEventListener("touchstart", (e) => { isDrawing = true; scratchAt(e); }, { passive: false });
scratchCanvas.addEventListener("touchmove", scratchAt, { passive: false });
window.addEventListener("touchend", () => { isDrawing = false; });

// 3. إرسال البيانات إلى شيت جوجل مع منع تكرار الرقم نهائياً والحفاظ على الصفر
claimForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isSubmitting) return; // منع الضغط المزدوج السريع على الزر

  formMessage.classList.add("hidden");

  const name = userNameInput.value.trim();
  const normalizedPhone = normalizePhone(userPhoneInput.value);

  if (name.length < 3) {
    showMessage("من فضلك أدخل اسمك بالكامل بشكل صحيح.", "error");
    return;
  }

  if (!/^01[0125][0-9]{8}$/.test(normalizedPhone)) {
    showMessage("من فضلك أدخل رقم موبايل مصري صحيح مكون من 11 رقم ويبدأ بـ 01", "error");
    return;
  }

  // الفحص الأول (محلياً على المتصفح قبل الإرسال للشيت)
  if (isPhoneAlreadyUsedLocally(normalizedPhone)) {
    showMessage("⚠️ عفواً! رقم التليفون (" + normalizedPhone + ") قام باستلام هدية مسبقاً ولا يُسمح بتكرار نفس الرقم مرتين.", "error");
    return;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const timeStr = now.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });

  isSubmitting = true;
  submitBtn.disabled = true;
  submitBtnText.textContent = "جاري التحقق من عدم تكرار الرقم وحفظ الهدية...";

  try {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === "PUT_YOUR_GOOGLE_SCRIPT_WEB_APP_URL_HERE") {
      throw new Error("يرجى وضع رابط Google Apps Script في ملف script.js أولاً.");
    }

    const payload = {
      name: name,
      phone: String(normalizedPhone), // يبدأ بـ 0 دائماً
      prize: selectedPrize,
      date: dateStr,
      time: timeStr
    };

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    const textResult = await response.text();
    let result = null;
    try {
      result = JSON.parse(textResult);
    } catch (parseErr) {
      throw new Error("تأكد من عمل New Deployment لملف Code.gs في Google Apps Script واختيار Anyone.");
    }

    if (result.status === "duplicate") {
      // حفظ الرقم محلياً أيضاً لمنع أي محاولة أخرى
      saveLocalUsedPhone(normalizedPhone);
      showMessage("⚠️ عفواً! رقم التليفون (" + normalizedPhone + ") مسجل لدينا مسبقاً في الشيت ولا يُسمح بتكرار نفس الرقم مرتين!", "error");
      submitBtn.disabled = false;
      submitBtnText.textContent = "تأكيد وحفظ الهدية الآن";
      isSubmitting = false;
      return;
    }

    if (result.status === "success") {
      saveLocalUsedPhone(normalizedPhone);
      showMessage(`✅ تم تسجيل هديتك (${selectedPrize}) بنجاح باسم ${name} ورقم ${normalizedPhone}! تفضل بزيارة فرع البيطاش الجديد لاستلامها.`, "success");
      submitBtnText.textContent = "تم حفظ هديتك بنجاح ✔";
      userNameInput.disabled = true;
      userPhoneInput.disabled = true;
    } else {
      throw new Error(result.message || "حدث خطأ غير متوقع أثناء الحفظ.");
    }
  } catch (err) {
    showMessage("تنبيه: " + err.message, "error");
    submitBtn.disabled = false;
    submitBtnText.textContent = "تأكيد وحفظ الهدية الآن";
    isSubmitting = false;
  }
});

function showMessage(text, type) {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`;
  formMessage.classList.remove("hidden");
}
