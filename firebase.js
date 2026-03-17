// IMPORTAR FIREBASE DESDE CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ------------------ CONFIG DE TU PROYECTO ------------------ */
const firebaseConfig = {
  apiKey: "AIzaSyD7TL0Xb2plH1EMHEPM1kdojc0k6eMkPiE",
  authDomain: "aura-app-a5920.firebaseapp.com",
  projectId: "aura-app-a5920",
  storageBucket: "aura-app-a5920.firebasestorage.app",
  messagingSenderId: "566562119584",
  appId: "1:566562119584:web:adf6e708a0cc611e554ec5"
};

/* ------------------ INICIALIZAR ------------------ */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ------------------ EXPORTAR PARA app.js ------------------ */
export {
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
};
