import {
  db,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy
} from "./firebase.js";

/* ------------------ ELEMENTOS ------------------ */
const tabs = document.querySelectorAll(".tab");
const screens = document.querySelectorAll(".screen");

const statusEl = document.getElementById("status");
const mentalDump = document.getElementById("mentalDump");
const micBtn = document.getElementById("micBtn");
const saveBtn = document.getElementById("saveBtn");
const processBtn = document.getElementById("processBtn");
const processedOutput = document.getElementById("processedOutput");
const confirmBox = document.getElementById("confirmBox");

const tasksList = document.getElementById("tasksList");
const historyList = document.getElementById("historyList");

const voiceReplyToggle = document.getElementById("voiceReplyToggle");
const langSelect = document.getElementById("langSelect");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

const tasksCountEl = document.getElementById("tasksCount");
const historyCountEl = document.getElementById("historyCount");

const settingsShortcutBtn = document.querySelector("[data-screen-target='settings']");

/* ------------------ CONFIG LOCAL ------------------ */
const settings = {
  voiceReply: localStorage.getItem("aura_voiceReply") !== "false",
  lang: localStorage.getItem("aura_lang") || "es-ES"
};

let pendingCapture = null;
let isListening = false;
let finalTranscript = "";

if (voiceReplyToggle) voiceReplyToggle.checked = settings.voiceReply;
if (langSelect) langSelect.value = settings.lang;

voiceReplyToggle?.addEventListener("change", () => {
  settings.voiceReply = voiceReplyToggle.checked;
  localStorage.setItem("aura_voiceReply", settings.voiceReply);
});

langSelect?.addEventListener("change", () => {
  settings.lang = langSelect.value;
  localStorage.setItem("aura_lang", settings.lang);
});

/* ------------------ FIRESTORE ------------------ */
const tasksRef = collection(db, "tasks");
const historyRef = collection(db, "history");

/* ------------------ NAVEGACIÓN ------------------ */
function openScreen(screenId) {
  screens.forEach(screen => {
    screen.classList.toggle("active", screen.id === screenId);
  });

  tabs.forEach(tab => {
    tab.classList.toggle("active", tab.dataset.screen === screenId);
  });
}

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    const screenId = tab.dataset.screen;
    if (!screenId) return;
    openScreen(screenId);
  });
});

settingsShortcutBtn?.addEventListener("click", () => {
  openScreen("settings");
});

/* ------------------ VOZ ------------------ */
function speak(text) {
  if (!settings.voiceReply) return;
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = settings.lang;
  utterance.rate = 0.95;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function speakHuman(list) {
  speak(randomItem(list));
}

const humanReplies = {
  captured: [
    "Listo, ya capturé tu mensaje.",
    "Perfecto, ya lo tengo.",
    "Bien, ya te entendí."
  ],
  processed: [
    "Listo, ya organicé tu mensaje.",
    "Perfecto, ya entendí.",
    "Bien, ya lo ordené."
  ],
  savedOne: [
    "Listo, lo guardé.",
    "Anotado.",
    "Perfecto, ya lo agregué."
  ],
  savedMany: [
    "Perfecto. Ya guardé varias tareas.",
    "Listo. Organicé y guardé todo.",
    "Muy bien. Ya quedó registrado."
  ],
  completed: [
    "Bien hecho.",
    "Excelente. Una cosa menos.",
    "Buen progreso.",
    "Perfecto. Seguimos."
  ],
  reopened: [
    "La reabrí.",
    "Listo. Vuelve a estar pendiente.",
    "Hecha la reapertura."
  ],
  deleted: [
    "La eliminé.",
    "Listo. Ya no está en tu lista."
  ],
  historyCleared: [
    "Historial borrado.",
    "Listo. Limpié el historial.",
    "Ya quedó vacío."
  ],
  cancelled: [
    "Cancelado.",
    "No lo guardé.",
    "Entendido, no se registró."
  ]
};

/* ------------------ RECONOCIMIENTO DE VOZ ------------------ */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = settings.lang;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  micBtn?.addEventListener("click", () => {
    if (isListening) return;

    recognition.lang = settings.lang;
    finalTranscript = "";
    mentalDump.value = "";
    statusEl.textContent = "Estado: escuchando...";
    isListening = true;

    try {
      recognition.start();
    } catch (error) {
      console.error("Error iniciando reconocimiento:", error);
      statusEl.textContent = "Estado: listo";
      isListening = false;
    }
  });

  recognition.onresult = event => {
    let interimTranscript = "";
    let currentFinal = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        currentFinal += transcript + " ";
      } else {
        interimTranscript += transcript;
      }
    }

    finalTranscript += currentFinal;
    mentalDump.value = (finalTranscript + interimTranscript).trim();

    if (mentalDump.value.trim()) {
      statusEl.textContent = "Estado: transcribiendo...";
    }
  };

  recognition.onerror = event => {
    console.error("Error de voz:", event.error);
    statusEl.textContent = `Error de voz: ${event.error}`;
    isListening = false;
  };

  recognition.onend = () => {
    isListening = false;

    const text = mentalDump.value.trim();

    if (!text) {
      statusEl.textContent = "Estado: listo";
      return;
    }

    statusEl.textContent = "Estado: mensaje capturado";
    prepareConfirmationFromText(text, "voice_capture");
  };
} else {
  if (statusEl) statusEl.textContent = "Tu navegador no soporta reconocimiento de voz.";
  if (micBtn) micBtn.disabled = true;
}

/* ------------------ PROCESAR TEXTO ------------------ */
function processMentalText(text) {
  if (!text.trim()) return [];

  const rawParts = text
    .split(/\n|,|\.| y /gi)
    .map(t => t.trim())
    .filter(Boolean);

  return rawParts
    .map(part => {
      let clean = part;

      clean = clean.replace(/^aura[, ]*/i, "");
      clean = clean.replace(/^mañana\s+/i, "");
      clean = clean.replace(/^hoy\s+/i, "");
      clean = clean.replace(/^recuérdame\s+/i, "");
      clean = clean.replace(/^recordarme\s+/i, "");
      clean = clean.replace(/^tengo que\s+/i, "");
      clean = clean.replace(/^debo\s+/i, "");
      clean = clean.replace(/^agrega(r)?\s+/i, "");
      clean = clean.replace(/^anota(r)?\s+/i, "");
      clean = clean.replace(/^por favor\s+/i, "");
      clean = clean.trim();

      if (!clean) return "";

      return clean.charAt(0).toUpperCase() + clean.slice(1);
    })
    .filter(Boolean);
}

/* ------------------ FECHA Y HORA ------------------ */
function extractDateTime(text) {
  const now = new Date();
  let date = null;
  let time = null;

  if (/mañana/i.test(text)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    date = tomorrow.toISOString().split("T")[0];
  }

  if (/\bhoy\b/i.test(text)) {
    date = now.toISOString().split("T")[0];
  }

  const hourMatch = text.match(/a las\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);

  if (hourMatch) {
    let hour = parseInt(hourMatch[1], 10);
    const minutes = hourMatch[2] ? hourMatch[2] : "00";
    const period = hourMatch[3] ? hourMatch[3].toLowerCase() : null;

    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;

    if (hour >= 0 && hour <= 23) {
      time = `${String(hour).padStart(2, "0")}:${minutes}`;
    }
  }

  return { date, time };
}

function buildHumanReply(taskCount, dateInfo) {
  if (taskCount > 1 && dateInfo.date && dateInfo.time) {
    return `He guardado ${taskCount} tareas para ${dateInfo.date} a las ${dateInfo.time}.`;
  }

  if (taskCount > 1 && dateInfo.date) {
    return `He guardado ${taskCount} tareas para esa fecha.`;
  }

  if (taskCount > 1) {
    return `He guardado ${taskCount} tareas.`;
  }

  if (dateInfo.date && dateInfo.time) {
    return "He guardado tu recordatorio con fecha y hora.";
  }

  if (dateInfo.date) {
    return "He guardado tu recordatorio.";
  }

  return "He guardado tu tarea.";
}

function getTodayDateString() {
  const now = new Date();
  return now.toDateString();
}

/* ------------------ CONFIRMACIÓN ------------------ */
function prepareConfirmationFromText(text, source = "manual") {
  const processedTasks = processMentalText(text);
  const dateInfo = extractDateTime(text);

  if (!processedTasks.length) {
    processedOutput.classList.remove("hidden");
    processedOutput.textContent = "No pude detectar tareas válidas.";
    speakHuman(humanReplies.captured);
    return;
  }

  pendingCapture = {
    originalText: text,
    tasks: processedTasks,
    date: dateInfo.date || null,
    time: dateInfo.time || null,
    source
  };

  renderPreview(processedTasks, dateInfo);
  renderConfirmBox();
}

function renderPreview(tasks, dateInfo) {
  if (!processedOutput) return;

  let preview = "Tareas detectadas:\n\n";
  preview += tasks.map((t, i) => `${i + 1}. ${t}`).join("\n");

  if (dateInfo.date || dateInfo.time) {
    preview += "\n\n";
    preview += `Fecha: ${dateInfo.date || "No detectada"}\n`;
    preview += `Hora: ${dateInfo.time || "No detectada"}`;
  }

  processedOutput.classList.remove("hidden");
  processedOutput.textContent = preview;
}

function renderConfirmBox() {
  if (!confirmBox || !pendingCapture) return;

  const { originalText, tasks, date, time } = pendingCapture;

  const taskLabel = tasks.length === 1 ? "tarea" : "tareas";
  const dateLine = date ? `<div class="confirm-meta">📅 ${escapeHtml(date)}</div>` : "";
  const timeLine = time ? `<div class="confirm-meta">⏰ ${escapeHtml(time)}</div>` : "";

  confirmBox.innerHTML = `
    <div class="confirm-content">
      <p class="mini-label">Confirmación</p>
      <h3>Entendí esto</h3>
      <div class="confirm-quote">"${escapeHtml(originalText)}"</div>

      <div class="confirm-list">
        <strong>Voy a guardar ${tasks.length} ${taskLabel}:</strong>
        <ul>
          ${tasks.map(task => `<li>${escapeHtml(task)}</li>`).join("")}
        </ul>
      </div>

      ${dateLine}
      ${timeLine}

      <div class="actions">
        <button id="confirmSaveBtn" class="primary-btn" type="button">Confirmar</button>
        <button id="editCaptureBtn" class="secondary-btn" type="button">Editar</button>
        <button id="cancelCaptureBtn" class="danger-btn" type="button">Cancelar</button>
      </div>
    </div>
  `;

  confirmBox.classList.remove("hidden");

  document.getElementById("confirmSaveBtn")?.addEventListener("click", confirmPendingSave);
  document.getElementById("editCaptureBtn")?.addEventListener("click", editPendingCapture);
  document.getElementById("cancelCaptureBtn")?.addEventListener("click", cancelPendingCapture);
}

function hideConfirmBox() {
  if (!confirmBox) return;
  confirmBox.classList.add("hidden");
  confirmBox.innerHTML = "";
}

function editPendingCapture() {
  if (!pendingCapture) return;
  mentalDump.value = pendingCapture.originalText;
  hideConfirmBox();
  statusEl.textContent = "Estado: puedes editar el texto";
  mentalDump.focus();
}

function cancelPendingCapture() {
  pendingCapture = null;
  hideConfirmBox();
  processedOutput.classList.add("hidden");
  statusEl.textContent = "Estado: guardado cancelado";
  speakHuman(humanReplies.cancelled);
}

async function confirmPendingSave() {
  if (!pendingCapture) return;

  try {
    const { originalText, tasks, date, time, source } = pendingCapture;

    for (const task of tasks) {
      await addDoc(tasksRef, {
        text: task,
        date: date || null,
        time: time || null,
        done: false,
        source,
        createdAt: serverTimestamp()
      });
    }

    await addDoc(historyRef, {
      text: originalText,
      type: source,
      taskCount: tasks.length,
      date: date || null,
      time: time || null,
      createdAt: serverTimestamp()
    });

    mentalDump.value = "";
    pendingCapture = null;
    hideConfirmBox();
    processedOutput.classList.add("hidden");
    statusEl.textContent = "Estado: tarea guardada";

    if (date || time) {
      speak(buildHumanReply(tasks.length, { date, time }));
    } else if (tasks.length > 1) {
      speakHuman(humanReplies.savedMany);
    } else {
      speakHuman(humanReplies.savedOne);
    }

    await loadTasks();
    await loadHistory();
    await updateDashboardCounts();
  } catch (error) {
    console.error("Error guardando en Firebase:", error);
    alert("Error guardando en Firebase.");
  }
}

/* ------------------ BOTONES PRINCIPALES ------------------ */
processBtn?.addEventListener("click", () => {
  const text = mentalDump.value.trim();

  if (!text) {
    alert("Escribe o dicta algo primero.");
    return;
  }

  const tasks = processMentalText(text);
  const dateInfo = extractDateTime(text);

  if (!tasks.length) {
    processedOutput.classList.remove("hidden");
    processedOutput.textContent = "No pude detectar tareas.";
    return;
  }

  renderPreview(tasks, dateInfo);
  speakHuman(humanReplies.processed);
});

saveBtn?.addEventListener("click", () => {
  const text = mentalDump.value.trim();

  if (!text) {
    alert("No hay nada para guardar.");
    return;
  }

  prepareConfirmationFromText(text, "voice_or_text");
});

/* ------------------ CARGA DE TAREAS ------------------ */
async function loadTasks() {
  if (!tasksList) return;

  tasksList.innerHTML = "Cargando tareas...";

  try {
    const q = query(tasksRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      tasksList.innerHTML = "<p>No hay tareas todavía.</p>";
      return;
    }

    tasksList.innerHTML = "";

    snapshot.forEach(taskDoc => {
      const data = taskDoc.data();

      const item = document.createElement("div");
      item.className = "item";

      const extraDate = data.date ? `<small>Fecha: ${escapeHtml(data.date)}</small>` : "";
      const extraTime = data.time ? `<small>Hora: ${escapeHtml(data.time)}</small>` : "";

      item.innerHTML = `
        <div class="item-top">
          <div class="item-text">${escapeHtml(data.text || "")}</div>
        </div>
        <small>Estado: ${data.done ? "Completada" : "Pendiente"}</small>
        ${extraDate}
        ${extraTime}
        <div class="item-actions">
          <button class="complete-btn" type="button">${data.done ? "↩️ Reabrir" : "✅ Completar"}</button>
          <button class="delete-btn danger-btn" type="button">🗑️ Eliminar</button>
        </div>
      `;

      const completeBtn = item.querySelector(".complete-btn");
      const deleteBtn = item.querySelector(".delete-btn");

      completeBtn?.addEventListener("click", async () => {
        try {
          await updateDoc(doc(db, "tasks", taskDoc.id), {
            done: !data.done
          });

          await addDoc(historyRef, {
            text: `${data.done ? "Reabierta" : "Completada"}: ${data.text}`,
            type: "task_update",
            createdAt: serverTimestamp()
          });

          if (data.done) {
            speakHuman(humanReplies.reopened);
          } else {
            speakHuman(humanReplies.completed);
          }

          await loadTasks();
          await loadHistory();
          await updateDashboardCounts();
        } catch (error) {
          console.error("Error actualizando tarea:", error);
        }
      });

      deleteBtn?.addEventListener("click", async () => {
        try {
          await deleteDoc(doc(db, "tasks", taskDoc.id));

          await addDoc(historyRef, {
            text: `Eliminada: ${data.text}`,
            type: "task_delete",
            createdAt: serverTimestamp()
          });

          speakHuman(humanReplies.deleted);

          await loadTasks();
          await loadHistory();
          await updateDashboardCounts();
        } catch (error) {
          console.error("Error eliminando tarea:", error);
        }
      });

      tasksList.appendChild(item);
    });
  } catch (error) {
    console.error(error);
    tasksList.innerHTML = "<p>Error cargando tareas.</p>";
  }
}

/* ------------------ CARGA DE HISTORIAL ------------------ */
async function loadHistory() {
  if (!historyList) return;

  historyList.innerHTML = "Cargando historial...";

  try {
    const q = query(historyRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      historyList.innerHTML = "<p>No hay historial todavía.</p>";
      return;
    }

    historyList.innerHTML = "";

    snapshot.forEach(historyDoc => {
      const data = historyDoc.data();

      const dateLine = data.date ? `<small>Fecha: ${escapeHtml(data.date)}</small>` : "";
      const timeLine = data.time ? `<small>Hora: ${escapeHtml(data.time)}</small>` : "";

      const item = document.createElement("div");
      item.className = "item";

      item.innerHTML = `
        <div class="item-text">${escapeHtml(data.text || "")}</div>
        <small>Tipo: ${escapeHtml(data.type || "general")}</small>
        ${dateLine}
        ${timeLine}
      `;

      historyList.appendChild(item);
    });
  } catch (error) {
    console.error(error);
    historyList.innerHTML = "<p>Error cargando historial.</p>";
  }
}

/* ------------------ CONTADORES ------------------ */
async function updateDashboardCounts() {
  try {
    const tasksSnapshot = await getDocs(query(tasksRef, orderBy("createdAt", "desc")));
    const historySnapshot = await getDocs(query(historyRef, orderBy("createdAt", "desc")));

    const pendingTasks = tasksSnapshot.docs.filter(docItem => !docItem.data().done).length;
    const historyCount = historySnapshot.size;

    if (tasksCountEl) tasksCountEl.textContent = String(pendingTasks);
    if (historyCountEl) historyCountEl.textContent = String(historyCount);
  } catch (error) {
    console.error("Error actualizando contadores:", error);
  }
}

/* ------------------ LIMPIAR HISTORIAL ------------------ */
clearHistoryBtn?.addEventListener("click", async () => {
  const ok = confirm("¿Seguro que quieres borrar el historial?");
  if (!ok) return;

  try {
    const snapshot = await getDocs(historyRef);

    const deletions = [];
    snapshot.forEach(item => {
      deletions.push(deleteDoc(doc(db, "history", item.id)));
    });

    await Promise.all(deletions);
    speakHuman(humanReplies.historyCleared);
    await loadHistory();
    await updateDashboardCounts();
  } catch (error) {
    console.error(error);
    alert("No se pudo borrar el historial.");
  }
});

/* ------------------ SALUDO DIARIO ------------------ */
async function greetOncePerDay() {
  const today = getTodayDateString();
  const lastGreeting = localStorage.getItem("aura_lastGreeting");

  if (lastGreeting === today) return;

  try {
    const snapshot = await getDocs(query(tasksRef, orderBy("createdAt", "desc")));
    const pendingTasks = snapshot.docs.filter(docItem => !docItem.data().done);

    let message = "";

    if (pendingTasks.length === 0) {
      message = "Buenos días. Hoy tu agenda está tranquila. Aprovecha el día.";
    } else if (pendingTasks.length === 1) {
      message = "Buenos días, Jacinto. Hoy tienes una tarea pendiente. ¿Quieres revisarla?";
    } else {
      message = `Buenos días, Jacinto. Hoy tienes ${pendingTasks.length} pendientes. ¿Quieres escucharlos?`;
    }

    speak(message);
    localStorage.setItem("aura_lastGreeting", today);
  } catch (error) {
    console.error("Error en saludo diario:", error);
  }
}

/* ------------------ UTILIDAD ------------------ */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ------------------ INICIO ------------------ */
(async function initAura() {
  openScreen("home");
  await loadTasks();
  await loadHistory();
  await updateDashboardCounts();
  await greetOncePerDay();
})();
