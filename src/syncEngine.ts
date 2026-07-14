import { doc, getDoc, setDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { Tracklog, KmlLayer, OfflineRegion, SubAccount, FireMeasurement, UserProfile, ActiveOfficer } from './types';

// Helper function to merge an incoming list with existing remote list by ID
export const mergeList = (existingList: any[], newList: any[]) => {
  const merged = [...existingList];
  newList.forEach(item => {
    if (!item.id) {
      merged.push(item);
      return;
    }
    const idx = merged.findIndex(e => e.id === item.id);
    if (idx > -1) {
      merged[idx] = item; // Update existing
    } else {
      merged.push(item); // Add new
    }
  });
  return merged;
};

export const pushDataToCloud = async (
  email: string,
  tracklogsList: Tracklog[],
  kmlLayers: KmlLayer[],
  offlineRegions: OfflineRegion[],
  subAccounts: SubAccount[],
  savedFireMeasurements: FireMeasurement[],
  activePatrolOfficers: ActiveOfficer[],
  userProfile: UserProfile
) => {
  if (!email) return;

  const userDocRef = doc(db, 'users', email);
  
  // 1. Pre-fetch existing data to prevent sub-accounts from overwriting master account's data
  // Tracklogs
  const tracklogsRef = doc(db, 'users', email, 'data', 'tracklogs');
  const tracklogsSnap = await getDoc(tracklogsRef);
  const existingTracklogs = tracklogsSnap.exists() ? tracklogsSnap.data().list || [] : [];
  const mergedTracklogs = mergeList(existingTracklogs, tracklogsList);

  // KML Layers
  const kmlRef = doc(db, 'users', email, 'data', 'kmlLayers');
  const kmlSnap = await getDoc(kmlRef);
  const existingKml = kmlSnap.exists() ? kmlSnap.data().list || [] : [];
  const mergedKml = mergeList(existingKml, kmlLayers);

  // Offline Regions
  const regionsRef = doc(db, 'users', email, 'data', 'offlineRegions');
  const regionsSnap = await getDoc(regionsRef);
  const existingRegions = regionsSnap.exists() ? regionsSnap.data().list || [] : [];
  const mergedRegions = mergeList(existingRegions, offlineRegions);

  // Sub Accounts
  let mergedSubAccounts = subAccounts;
  if (userProfile.role === 'master') {
    const subsRef = doc(db, 'users', email, 'data', 'subAccounts');
    const subsSnap = await getDoc(subsRef);
    const existingSubs = subsSnap.exists() ? subsSnap.data().list || [] : [];
    mergedSubAccounts = mergeList(existingSubs, subAccounts);
  }

  // Fire Measurements
  const fireRef = doc(db, 'users', email, 'data', 'fireMeasurements');
  const fireSnap = await getDoc(fireRef);
  const existingFire = fireSnap.exists() ? fireSnap.data().list || [] : [];
  const mergedFire = mergeList(existingFire, savedFireMeasurements);

  // Active Patrol Officers
  const officersRef = doc(db, 'users', email, 'data', 'activePatrolOfficers');
  const officersSnap = await getDoc(officersRef);
  const existingOfficers = officersSnap.exists() ? officersSnap.data().list || [] : [];
  const mergedOfficers = mergeList(existingOfficers, activePatrolOfficers);


  // 2. Create a batch to push the merged data
  const batch = writeBatch(db);

  if (userProfile.role === 'master') {
    batch.set(userDocRef, { profile: userProfile, lastSync: Date.now() }, { merge: true });
    
    // Auto-sync all sub-accounts to global collection
    mergedSubAccounts.forEach(sub => {
      if (sub.email) {
        const subRef = doc(db, 'global_sub_accounts', sub.email.trim().toLowerCase());
        batch.set(subRef, { ...sub, email: sub.email.trim().toLowerCase(), masterEmail: email });
      }
    });
  }

  batch.set(tracklogsRef, { list: mergedTracklogs });
  batch.set(kmlRef, { list: mergedKml });
  batch.set(regionsRef, { list: mergedRegions });

  if (userProfile.role === 'master') {
    const subsRef = doc(db, 'users', email, 'data', 'subAccounts');
    batch.set(subsRef, { list: mergedSubAccounts });
  }

  batch.set(fireRef, { list: mergedFire });
  batch.set(officersRef, { list: mergedOfficers });

  await batch.commit();
};

export const pullDataFromCloud = async (email: string) => {
  if (!email) return null;

  try {
    const userDocRef = doc(db, 'users', email);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      return null; // No data found
    }

    const profile = userDoc.data()?.profile;

    const tracklogsRef = doc(db, 'users', email, 'data', 'tracklogs');
    const tracklogsSnap = await getDoc(tracklogsRef);
    const tracklogsList = tracklogsSnap.exists() ? tracklogsSnap.data().list : [];

    const kmlRef = doc(db, 'users', email, 'data', 'kmlLayers');
    const kmlSnap = await getDoc(kmlRef);
    const kmlLayers = kmlSnap.exists() ? kmlSnap.data().list : [];

    const regionsRef = doc(db, 'users', email, 'data', 'offlineRegions');
    const regionsSnap = await getDoc(regionsRef);
    const offlineRegions = regionsSnap.exists() ? regionsSnap.data().list : [];

    const subsRef = doc(db, 'users', email, 'data', 'subAccounts');
    const subsSnap = await getDoc(subsRef);
    const subAccounts = subsSnap.exists() ? subsSnap.data().list : [];

    const fireRef = doc(db, 'users', email, 'data', 'fireMeasurements');
    const fireSnap = await getDoc(fireRef);
    const savedFireMeasurements = fireSnap.exists() ? fireSnap.data().list : [];

    const officersRef = doc(db, 'users', email, 'data', 'activePatrolOfficers');
    const officersSnap = await getDoc(officersRef);
    const activePatrolOfficers = officersSnap.exists() ? officersSnap.data().list : [];

    return {
      profile,
      tracklogsList,
      kmlLayers,
      offlineRegions,
      subAccounts,
      savedFireMeasurements,
      activePatrolOfficers
    };
  } catch (error) {
    console.error("Error pulling data:", error);
    return null;
  }
};
