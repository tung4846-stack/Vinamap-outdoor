import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBbp4k-CNK4WxsftGJGwc8deJkLYZX_dok",
  authDomain: "mesmerizing-hour-b7c1c.firebaseapp.com",
  projectId: "mesmerizing-hour-b7c1c",
  storageBucket: "mesmerizing-hour-b7c1c.firebasestorage.app",
  messagingSenderId: "88549402397",
  appId: "1:88549402397:web:6baa1b9b213b9dc160e3f4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-vinamapoutdoorkm-309a1ff6-af66-45fb-850b-acc007567f83");

// Enable offline persistence
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Persistence is not available in this browser');
    }
  });
}
