import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  deleteObject,
  ref,
  getDownloadURL,
  getStorage,
  uploadBytes,
} from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCRyWMQLIWiXi4ie0LeUufewPU-6lqxlbU",
  authDomain: "campus-hub-e8311.firebaseapp.com",
  projectId: "campus-hub-e8311",
  storageBucket: "campus-hub-e8311.appspot.com",
  messagingSenderId: "879112545117",
  appId: "1:879112545117:web:3ef1c576ee23fab588feb4",
  measurementId: "G-1XHR8RYP6H",
};

export const app = initializeApp(firebaseConfig);
export const googleAuth = getAuth(app);

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  deleteObject,
  ref,
  getDownloadURL,
  storage: getStorage(app),
  uploadBytes,
};
