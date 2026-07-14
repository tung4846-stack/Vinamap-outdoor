import { doc, getDoc, setDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile, SubAccount } from './types';

export const registerMaster = async (email: string, password: string, displayName: string) => {
  const emailLower = email.trim().toLowerCase();
  
  // Check if already a master
  const userDocRef = doc(db, 'users', emailLower);
  const snap = await getDoc(userDocRef);
  if (snap.exists()) {
    throw new Error('Tài khoản chủ đã tồn tại. Vui lòng đăng nhập.');
  }

  // Check if already a sub-account
  const subDocRef = doc(db, 'global_sub_accounts', emailLower);
  const subSnap = await getDoc(subDocRef);
  if (subSnap.exists()) {
    throw new Error('Email này đã được cấp phát tài khoản ngoại nghiệp. Không thể đăng ký làm tài khoản chủ.');
  }

  await setDoc(userDocRef, {
    password,
    profile: {
      email: emailLower,
      isLoggedIn: false,
      displayName,
      syncCount: 0,
      role: 'master',
      masterEmail: emailLower
    }
  });
};

export const loginMaster = async (email: string, password: string) => {
  const emailLower = email.trim().toLowerCase();
  const userDocRef = doc(db, 'users', emailLower);
  const snap = await getDoc(userDocRef);
  if (!snap.exists()) {
    throw new Error('Tài khoản chủ chưa được đăng ký. Vui lòng đăng ký mới!');
  }
  const data = snap.data();
  if (data.password !== password) {
    throw new Error('Sai mật khẩu tài khoản chủ.');
  }
  return data.profile;
};

export const registerSubAccountGlobally = async (sub: SubAccount, masterEmail: string) => {
  const subDocRef = doc(db, 'global_sub_accounts', sub.email.toLowerCase());
  await setDoc(subDocRef, {
    ...sub,
    masterEmail
  });
};

export const loginSubAccount = async (email: string, password: string) => {
  const subDocRef = doc(db, 'global_sub_accounts', email.toLowerCase());
  const snap = await getDoc(subDocRef);
  if (!snap.exists()) {
    throw new Error('Tài khoản ngoại nghiệp không tồn tại. Vui lòng báo Phòng Kỹ Thuật cấp lại.');
  }
  const data = snap.data();
  if (data.password !== password) {
    throw new Error('Sai mật khẩu tài khoản ngoại nghiệp.');
  }
  return data as (SubAccount & { masterEmail: string });
};
