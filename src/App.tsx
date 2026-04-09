import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, User, MapPin, Calendar, GraduationCap, X, Info, Filter, Briefcase, Plus, List, Trash2, ChevronRight, ArrowLeft, GripVertical, Check, RefreshCw, Edit3, Download, ExternalLink, LogIn, LogOut } from 'lucide-react';
import { Profile, ApiResponse, PoliticalCareer, PoliticalCareerResponse, CustomList, ServerData, ProfileGroup } from './types';
import { auth, db, signInWithGoogle, logOut, handleRedirectResult } from './firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const API_URL = '/api/proxy/api/profiles/get/items?offset=0&limit=250&ids=7%2C149%2C759%2C13394%2C212%2C272%2C13409%2C12618%2C247%2C10147%2C13291%2C237%2C317%2C12348%2C360%2C400%2C10294%2C26934%2C13438%2C12040%2C60%2C13054%2C13052%2C12117%2C65%2C12250%2C785%2C101%2C188%2C13294%2C10237%2C175%2C111%2C10403%2C344%2C258%2C309%2C331%2C66%2C28%2C12347%2C165%2C186%2C10279%2C148%2C12136%2C12156%2C388%2C12083%2C30%2C190%2C121%2C284%2C139%2C10425%2C391%2C110%2C166%2C10324%2C98%2C12065%2C310%2C320%2C359%2C155%2C10309%2C157%2C398%2C116%2C274%2C10387%2C73%2C12041%2C193%2C233%2C11%2C13199%2C164%2C203%2C378%2C13068%2C17062%2C12793%2C12043%2C107%2C9%2C128%2C12567%2C10327%2C94%2C395%2C10175%2C87%2C185%2C10369%2C13422%2C26938%2C12918%2C240%2C12646%2C26939%2C12307%2C10208%2C10719%2C26940%2C26941%2C19604%2C26942%2C281%2C26944%2C17573%2C298%2C115%2C88%2C42%2C342%2C97%2C118%2C26948%2C45%2C329%2C71%2C216%2C275%2C198%2C59%2C184%2C12148%2C75%2C26950%2C64%2C189%2C140%2C213%2C187%2C26951%2C12143%2C249%2C296%2C26952%2C232%2C390%2C104%2C26954%2C150%2C195%2C126%2C220%2C251%2C222%2C238%2C12312%2C409%2C10%2C16%2C228%2C48%2C12367%2C117%2C14463%2C327%2C43%2C26957%2C26958%2C26962%2C225%2C26965%2C18890%2C25036%2C20295%2C353%2C341%2C13766%2C26966%2C141%2C26967%2C18013%2C206%2C26968%2C343%2C119%2C26969%2C26959%2C10367%2C12138%2C168%2C181%2C10153%2C10262%2C12135%2C370%2C231%2C259%2C127%2C12075%2C147%2C26960%2C26963%2C178%2C316';
const CAREER_API_URL = '/api/proxy/api/profiles/get/political-career?profileId=';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}


export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [politicalCareers, setPoliticalCareers] = useState<Record<number, PoliticalCareer[]>>({});
  const [loadingCareer, setLoadingCareer] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Custom Lists State
  const [customLists, setCustomLists] = useState<CustomList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [editingList, setEditingList] = useState<CustomList | null>(null);
  const [viewingList, setViewingList] = useState<CustomList | null>(null);
  
  const [newListName, setNewListName] = useState('');
  const [selectedGroupsForNewList, setSelectedGroupsForNewList] = useState<ProfileGroup[]>([{ id: 'default', name: 'Chưa phân nhóm', profileIds: [] }]);
  const [activeGroupIdForNewList, setActiveGroupIdForNewList] = useState<string>('default');
  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

  const handleLogin = async () => {
    try {
      setAuthError(null);
      await signInWithGoogle();
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Đã xảy ra lỗi khi đăng nhập.");
    }
  };

  useEffect(() => {
    handleRedirectResult().then((result) => {
      if (result) {
        setCurrentUser(result.user);
      }
    });

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Fetch profiles from Firestore instead of API
  useEffect(() => {
    const q = query(collection(db, 'profiles'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const firestoreProfiles: Profile[] = [];
        snapshot.forEach((doc) => {
          firestoreProfiles.push(doc.data() as Profile);
        });
        setProfiles(firestoreProfiles);
        setLoading(false);
      } else {
        // If Firestore is empty, we still need to load from API for the first time
        fetchFromApi();
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'profiles');
    });

    return () => unsubscribe();
  }, []);

  const fetchFromApi = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error('Failed to fetch profiles');
      }
      const result: ApiResponse = await response.json();
      setProfiles(result.data);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncToFirebase = async () => {
    if (!currentUser || profiles.length === 0) return;
    setIsSyncing(true);
    setSyncProgress({ current: 0, total: profiles.length });

    try {
      const CHUNK_SIZE = 20;
      let completed = 0;

      for (let i = 0; i < profiles.length; i += CHUNK_SIZE) {
        const chunk = profiles.slice(i, i + CHUNK_SIZE);
        
        await Promise.all(chunk.map(async (profile) => {
          let newAvatarUrl = profile.avatar_url;

          // Upload image to Firebase Storage
          if (profile.avatar_url && !profile.avatar_url.includes('firebasestorage')) {
            try {
              // Fetch image via proxy to avoid CORS
              const urlObj = new URL(profile.avatar_url);
              let proxyImageUrl = profile.avatar_url;
              if (urlObj.hostname === 'cdn.daihoidangtoanquoc.vn') {
                proxyImageUrl = `/api/proxy-cdn${urlObj.pathname}`;
              } else if (urlObj.hostname === 'api.daihoidangtoanquoc.vn') {
                proxyImageUrl = `/api/proxy${urlObj.pathname}`;
              }

              const imgResponse = await fetch(proxyImageUrl);
              if (imgResponse.ok) {
                const blob = await imgResponse.blob();
                const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
                const { storage } = await import('./firebase');
                const imageRef = ref(storage, `avatars/${profile.id}.jpg`);
                await uploadBytes(imageRef, blob);
                newAvatarUrl = await getDownloadURL(imageRef);
              } else {
                console.error(`Failed to fetch image for profile ${profile.id}: ${imgResponse.status}`);
              }
            } catch (imgErr) {
              console.error(`Failed to upload image for profile ${profile.id}`, imgErr);
            }
          }

          // Save profile to Firestore
          const profileToSave = { ...profile, avatar_url: newAvatarUrl };
          await setDoc(doc(db, 'profiles', profile.id.toString()), profileToSave);
          
          completed++;
          // Use functional state update to avoid stale closures if needed, but since we await Promise.all, it's fine.
          // However, since they resolve concurrently, we should use functional update to be safe:
          setSyncProgress(prev => ({ ...prev, current: prev.current + 1 }));
        }));
      }
      alert('Đồng bộ dữ liệu thành công!');
    } catch (err) {
      console.error('Sync failed', err);
      alert('Đồng bộ thất bại. Vui lòng thử lại.');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      setCustomLists([]);
      return;
    }

    const q = query(collection(db, 'custom_lists'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lists: CustomList[] = [];
      snapshot.forEach((doc) => {
        lists.push(doc.data() as CustomList);
      });
      setCustomLists(lists);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'custom_lists');
    });

    return () => unsubscribe();
  }, [currentUser]);

  const saveListToFirestore = async (list: CustomList) => {
    try {
      await setDoc(doc(db, 'custom_lists', list.id), list);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `custom_lists/${list.id}`);
    }
  };

  const deleteListFromFirestore = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'custom_lists', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `custom_lists/${id}`);
    }
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error('Refresh failed');
      const data: ApiResponse = await response.json();
      setProfiles(data.data);
      setLastUpdated(new Date().toISOString());
      setError(null);
    } catch (err) {
      setError('Không thể làm mới dữ liệu. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchCareer = async () => {
      if (!selectedProfile || politicalCareers[selectedProfile.id]) return;

      try {
        setLoadingCareer(true);
        const response = await fetch(`${CAREER_API_URL}${selectedProfile.id}`);
        if (!response.ok) throw new Error('Không thể tải tiểu sử chính trị');
        const result: PoliticalCareerResponse = await response.json();
        setPoliticalCareers(prev => ({
          ...prev,
          [selectedProfile.id]: result.data
        }));
      } catch (err) {
        console.error('Error fetching career:', err);
      } finally {
        setLoadingCareer(false);
      }
    };

    fetchCareer();
  }, [selectedProfile, politicalCareers]);

  const activeList = useMemo(() => {
    if (!activeListId) return null;
    return customLists.find(l => l.id === activeListId) || null;
  }, [activeListId, customLists]);

  const displayProfiles = useMemo(() => {
    let base = profiles;
    if (activeList) {
      // Map profileIds to actual profile objects in the order they appear in the list
      base = activeList.profileIds
        .map(id => profiles.find(p => p.id === id))
        .filter((p): p is Profile => !!p);
      return base; // Don't apply ABC sort to custom list if user wants custom order
    }

    const filtered = base.filter(profile => 
      profile.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      profile.main_title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Sắp xếp theo tên (từ cuối cùng của họ tên) cho danh sách tổng
    return filtered.sort((a, b) => {
      const nameA = a.name.trim().split(' ').pop() || '';
      const nameB = b.name.trim().split(' ').pop() || '';
      return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
    });
  }, [profiles, searchTerm, activeList]);

  const handleCreateList = async () => {
    if (!newListName.trim() || !currentUser) return;
    const allProfileIds = selectedGroupsForNewList.flatMap(g => g.profileIds);
    const newList: CustomList = {
      id: Date.now().toString(),
      name: newListName.trim(),
      profileIds: allProfileIds,
      groups: selectedGroupsForNewList,
      userId: currentUser.uid,
      createdAt: new Date().toISOString()
    };
    await saveListToFirestore(newList);
    setNewListName('');
    setSelectedGroupsForNewList([{ id: 'default', name: 'Chưa phân nhóm', profileIds: [] }]);
    setActiveGroupIdForNewList('default');
    setIsCreatingList(false);
  };

  const handleUpdateList = async () => {
    if (!editingList || !newListName.trim() || !currentUser) return;
    const allProfileIds = selectedGroupsForNewList.flatMap(g => g.profileIds);
    const updatedList = { 
      ...editingList, 
      name: newListName.trim(), 
      profileIds: allProfileIds,
      groups: selectedGroupsForNewList
    };
    await saveListToFirestore(updatedList);
    setEditingList(null);
    setNewListName('');
    setSelectedGroupsForNewList([{ id: 'default', name: 'Chưa phân nhóm', profileIds: [] }]);
    setActiveGroupIdForNewList('default');
  };

  const startEditing = (list: CustomList, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingList(list);
    setNewListName(list.name);
    if (list.groups && list.groups.length > 0) {
      setSelectedGroupsForNewList(list.groups);
      setActiveGroupIdForNewList(list.groups[0].id);
    } else {
      setSelectedGroupsForNewList([{ id: 'default', name: 'Chưa phân nhóm', profileIds: list.profileIds }]);
      setActiveGroupIdForNewList('default');
    }
  };

  const exportToHtml = (list: CustomList) => {
    const listProfiles = list.profileIds
      .map(id => profiles.find(p => p.id === id))
      .filter((p): p is Profile => !!p);

    const profilesData = JSON.stringify(listProfiles);
    const careersData = JSON.stringify(politicalCareers);

    const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${list.name}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .career-table { width: 100%; border-collapse: collapse; }
        .career-table tr:hover { background-color: rgba(254, 242, 242, 0.5); }
        .career-table td { padding: 16px 0; border-bottom: 1px solid #f9fafb; }
        .time-cell { white-space: nowrap; padding-right: 32px; font-weight: 700; color: #111827; vertical-align: top; }
        .content-cell { color: #4b5563; line-height: 1.625; vertical-align: top; }
        .marker { width: 6px; height: 6px; background-color: #ef4444; border-radius: 9999px; flex-shrink: 0; margin-top: 6px; }
        
        /* Modal Styles */
        #modal-overlay { display: none; position: fixed; inset: 0; z-index: 50; background-color: rgba(0,0,0,0.4); backdrop-filter: blur(4px); align-items: center; justify-content: center; padding: 16px; }
        #modal-content { background: white; width: 100%; max-width: 896px; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; position: relative; }
        .modal-body { flex: 1; overflow-y: auto; padding: 24px; }
        @media (min-width: 640px) { .modal-body { padding: 40px; } }
        
        .line-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
    </style>
</head>
<body class="bg-gray-50 text-gray-900">
    <div class="min-h-screen flex flex-col">
        <header class="bg-white border-b border-gray-200 py-12 px-4 text-center">
            <h1 class="text-4xl font-extrabold text-red-600">${list.name}</h1>
        </header>

        <main class="flex-1 max-w-7xl mx-auto w-full p-6 md:p-12">
            ${(list.groups && list.groups.length > 0) ? list.groups.map(group => `
                <div class="mb-12">
                    <h2 class="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b-2 border-red-600 inline-block">${group.name}</h2>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
                        ${group.profileIds.map(id => {
                            const p = listProfiles.find(prof => prof.id === id);
                            if (!p) return '';
                            return `
                            <div class="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group p-5" onclick="openModal(${p.id})">
                                <div class="mb-4 text-center">
                                    <h3 class="font-black text-lg text-gray-900 uppercase line-clamp-1">${p.name}</h3>
                                </div>
                                <div class="aspect-[4/5] relative overflow-hidden bg-gray-100 rounded-2xl">
                                    <img src="${p.avatar_url}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                                    <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                        <span class="text-white text-sm font-medium">Xem chi tiết</span>
                                    </div>
                                </div>
                                <div class="mt-4 text-center">
                                    <p class="text-[11px] text-red-600 font-bold">${p.main_title}</p>
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `).join('') : `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
                ${listProfiles.map(p => `
                    <div class="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group p-5" onclick="openModal(${p.id})">
                        <div class="mb-4 text-center">
                            <h3 class="font-black text-lg text-gray-900 uppercase line-clamp-1">${p.name}</h3>
                        </div>
                        <div class="aspect-[4/5] relative overflow-hidden bg-gray-100 rounded-2xl">
                            <img src="${p.avatar_url}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                            <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                <span class="text-white text-sm font-medium">Xem chi tiết</span>
                            </div>
                        </div>
                        <div class="mt-4 text-center">
                            <p class="text-[11px] text-red-600 font-bold">${p.main_title}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
            `}
        </main>
    </div>

    <!-- Modal Structure -->
    <div id="modal-overlay" onclick="closeModal(event)">
        <div id="modal-content" onclick="event.stopPropagation()">
            <button onclick="closeModal()" class="absolute top-4 right-4 z-10 p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div id="modal-body-content" class="modal-body">
                <!-- Content will be injected here -->
            </div>
            <div class="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button onclick="closeModal()" class="px-8 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-100 transition-all shadow-sm">Đóng cửa sổ</button>
            </div>
        </div>
    </div>

    <script>
        const profiles = ${profilesData};
        const careers = ${careersData};

        function openModal(id) {
            const profile = profiles.find(p => p.id === id);
            if (!profile) return;

            const profileCareers = careers[id] || [];
            const careerHtml = profileCareers.length > 0 
                ? \`<div class="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                    <table class="career-table">
                        <tbody class="divide-y divide-gray-50">
                            \${profileCareers.map(c => {
                                const clean = c.description.replace(/<[^>]*>/g, '').trim();
                                const colon = clean.indexOf(':');
                                const time = colon > 0 && colon < 35 ? clean.slice(0, colon+1) : '';
                                const text = colon > 0 && colon < 35 ? clean.slice(colon+1) : clean;
                                return \`<tr>
                                    <td class="time-cell">
                                        <div class="flex items-start gap-3">
                                            <div class="marker"></div>
                                            <span>\${time}</span>
                                        </div>
                                    </td>
                                    <td class="content-cell">\${text}</td>
                                </tr>\`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>\`
                : '<div class="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200"><p class="text-sm text-gray-400 italic">Không có dữ liệu tiểu sử.</p></div>';

            const content = \`
                <div class="flex flex-col md:flex-row gap-8 mb-10">
                    <div class="w-32 h-40 sm:w-48 sm:h-60 flex-shrink-0 mx-auto md:mx-0">
                        <img src="\${profile.avatar_url}" alt="\${profile.name}" class="w-full h-full object-contain bg-gray-50 rounded-2xl shadow-sm border border-gray-100">
                    </div>
                    <div class="flex-1">
                        <div class="mb-6 text-center md:text-left">
                            <h2 class="text-3xl font-extrabold text-gray-900 mb-2 uppercase">\${profile.name}</h2>
                            <p class="text-red-600 font-bold text-lg leading-snug mb-4">\${profile.main_title}</p>
                        </div>
                        <section>
                            <h4 class="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 text-center md:text-left">Thông tin cơ bản</h4>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                                <div class="flex items-center gap-3">
                                    <div class="p-2 bg-red-50 rounded-lg text-red-600">📍</div>
                                    <div>
                                        <p class="text-[10px] text-gray-400 font-bold uppercase">Quê quán</p>
                                        <p class="text-sm font-bold text-gray-700">\${profile.hometown || 'N/A'}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="p-2 bg-red-50 rounded-lg text-red-600">📅</div>
                                    <div>
                                        <p class="text-[10px] text-gray-400 font-bold uppercase">Ngày sinh</p>
                                        <p class="text-sm font-bold text-gray-700">\${profile.birth_day ? profile.birth_day.toString().slice(6,8)+'/'+profile.birth_day.toString().slice(4,6)+'/'+profile.birth_day.toString().slice(0,4) : 'N/A'}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="p-2 bg-red-50 rounded-lg text-red-600">🎓</div>
                                    <div>
                                        <p class="text-[10px] text-gray-400 font-bold uppercase">Trình độ</p>
                                        <p class="text-sm font-bold text-gray-700">\${profile.profession_level || 'N/A'}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="p-2 bg-red-50 rounded-lg text-red-600">👤</div>
                                    <div>
                                        <p class="text-[10px] text-gray-400 font-bold uppercase">Dân tộc</p>
                                        <p class="text-sm font-bold text-gray-700">\${profile.ethnicity || 'Kinh'}</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
                <div class="space-y-10">
                    \${profile.intro ? \`<section class="bg-gray-50 p-6 rounded-2xl border border-gray-100"><h4 class="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Giới thiệu</h4><p class="text-gray-600 text-sm leading-relaxed italic">"\${profile.intro}"</p></section>\` : ''}
                    <section>
                        <div class="flex items-center gap-3 mb-6">
                            <div class="h-px flex-1 bg-gray-100"></div>
                            <h4 class="text-xs font-bold uppercase tracking-widest text-gray-400">Tóm tắt quá trình công tác</h4>
                            <div class="h-px flex-1 bg-gray-100"></div>
                        </div>
                        \${careerHtml}
                    </section>
                </div>
            \`;

            document.getElementById('modal-body-content').innerHTML = content;
            document.getElementById('modal-overlay').style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function closeModal(e) {
            document.getElementById('modal-overlay').style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });
    </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${list.name}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteList = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteListFromFirestore(id);
    if (activeListId === id) setActiveListId(null);
    if (viewingList?.id === id) setViewingList(null);
  };

  const toggleProfileInNewList = (profileId: number) => {
    setSelectedGroupsForNewList(prev => {
      const newGroups = [...prev];
      const activeGroupIndex = newGroups.findIndex(g => g.id === activeGroupIdForNewList);
      if (activeGroupIndex === -1) return prev;

      let isInActiveGroup = newGroups[activeGroupIndex].profileIds.includes(profileId);
      
      // Remove from all groups first
      for (let i = 0; i < newGroups.length; i++) {
        newGroups[i] = { ...newGroups[i], profileIds: newGroups[i].profileIds.filter(id => id !== profileId) };
      }

      // If it was NOT in the active group, we add it to the active group.
      if (!isInActiveGroup) {
        newGroups[activeGroupIndex].profileIds.push(profileId);
      }

      return newGroups;
    });
  };

  const formatDate = (dateNum: number | null) => {
    if (!dateNum) return 'N/A';
    const str = dateNum.toString();
    if (str.length !== 8) return str;
    return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
  };

  const normalizeCareerDescription = (description: string) => {
    const timeClass = "whitespace-nowrap py-4 pr-8 font-bold text-gray-900 align-top";
    const contentClass = "py-4 text-gray-600 leading-relaxed";
    const marker = '<span class="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5"></span>';

    // Nếu đã có cấu trúc tr/td, ta cố gắng trích xuất nội dung để bọc lại theo style của mình
    if (description.includes('<tr') && description.includes('<td')) {
      const cells = description.match(/<td[^>]*>(.*?)<\/td>/gs);
      if (cells && cells.length >= 2) {
        const time = cells[0].replace(/<[^>]*>/g, '').trim();
        const content = cells[1].replace(/<\/?td>|<\/?p>/g, '').trim();
        return `<td class="${timeClass}"><div class="flex items-start gap-3">${marker}<span>${time}</span></div></td><td class="${contentClass}">${content}</td>`;
      }
      // Nếu chỉ có 1 cell hoặc không khớp, lấy hết text bọc lại
      const text = description.replace(/<[^>]*>/g, '').trim();
      return `<td class="${timeClass}"></td><td class="${contentClass}">${text}</td>`;
    }

    // Nếu là text thuần hoặc có thẻ p, thử tách theo dấu hai chấm đầu tiên
    const cleanText = description.replace(/<[^>]*>/g, '').trim();
    const firstColonIndex = cleanText.indexOf(':');
    
    // Kiểm tra xem phần trước dấu hai chấm có giống mốc thời gian không (độ dài ngắn)
    if (firstColonIndex > 0 && firstColonIndex < 35) {
      const time = cleanText.slice(0, firstColonIndex + 1).trim();
      const content = cleanText.slice(firstColonIndex + 1).trim();
      return `<td class="${timeClass}"><div class="flex items-start gap-3">${marker}<span>${time}</span></div></td><td class="${contentClass}">${content}</td>`;
    }

    return `<td class="${timeClass}"></td><td class="${contentClass}">${cleanText}</td>`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600 font-medium">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <X size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Lỗi tải dữ liệu</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Auth Error Modal */}
      <AnimatePresence>
        {authError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            onClick={() => setAuthError(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-red-50">
                <h3 className="text-xl font-bold text-red-800">Lỗi đăng nhập</h3>
                <button 
                  onClick={() => setAuthError(null)}
                  className="p-2 hover:bg-red-100 rounded-full transition-colors text-red-600"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <p className="text-gray-700 mb-4">{authError}</p>
                <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm mb-6">
                  <p className="font-semibold mb-2">Cách khắc phục:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Đảm bảo bạn đã thêm domain của ứng dụng vào danh sách <strong>Authorized domains</strong> trong Firebase Console (Authentication &gt; Settings &gt; Authorized domains).</li>
                    <li>Domain cần thêm: <br/><code className="bg-blue-100 px-1 rounded break-all">ais-dev-ze3gjlijro6bw4ouhwa7n5-572380466730.asia-southeast1.run.app</code> <br/>và<br/> <code className="bg-blue-100 px-1 rounded break-all">ais-pre-ze3gjlijro6bw4ouhwa7n5-572380466730.asia-southeast1.run.app</code></li>
                    <li>Kiểm tra xem Google Sign-In đã được bật trong Firebase Authentication chưa.</li>
                  </ul>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setAuthError(null)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
                  <User size={20} />
                </div>
                <h1 className="text-lg font-bold tracking-tight text-gray-900 hidden sm:block">Hồ sơ nhân sự</h1>
              </div>
              
              <nav className="flex items-center gap-1">
                {currentUser ? (
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => {
                        setActiveListId(null);
                        setSearchTerm('');
                      }}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${!activeListId ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                      Tất cả nhân sự
                    </button>
                    
                    <div className="relative group">
                      <button className="px-4 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                        Danh sách của tôi
                        <ChevronRight size={14} className="rotate-90 text-gray-400 group-hover:text-blue-600 transition-colors" />
                      </button>
                      <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 py-2">
                        <div className="px-4 py-2 border-b border-gray-50 flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Danh sách tùy chỉnh</span>
                          <button 
                            onClick={() => setIsCreatingList(true)}
                            className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Tạo mới"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <div className="max-h-80 overflow-y-auto px-2">
                          {customLists.map(list => (
                            <div 
                              key={list.id}
                              onClick={() => setViewingList(list)}
                              className="group flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-3 truncate">
                                <div className={`w-1.5 h-1.5 rounded-full ${activeListId === list.id ? 'bg-blue-600' : 'bg-gray-300'}`} />
                                <span className={`text-sm truncate ${activeListId === list.id ? 'text-blue-700 font-bold' : 'text-gray-600'}`}>
                                  {list.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button 
                                  onClick={(e) => startEditing(list, e)}
                                  className="p-1 text-gray-400 hover:text-blue-500"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button 
                                  onClick={(e) => handleDeleteList(list.id, e)}
                                  className="p-1 text-gray-400 hover:text-red-500"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {customLists.length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-6 italic">Chưa có danh sách nào</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={logOut}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      <LogOut size={16} />
                      Đăng xuất
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleLogin}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <LogIn size={16} />
                    Đăng nhập để tạo danh sách
                  </button>
                )}
              </nav>
            </div>

            <div className="flex items-center gap-3">
              {currentUser && (
                <button
                  onClick={handleSyncToFirebase}
                  disabled={isSyncing}
                  className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-xl hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  title="Đồng bộ dữ liệu và ảnh lên Firebase"
                >
                  <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">
                    {isSyncing ? `Đang đồng bộ (${syncProgress.current}/${syncProgress.total})` : 'Đồng bộ dữ liệu'}
                  </span>
                </button>
              )}
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Tìm kiếm nhân sự..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-100 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 rounded-xl text-sm outline-none transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                onClick={handleRefresh}
                disabled={loading}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-all disabled:opacity-50"
                title="Làm mới dữ liệu"
              >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col">
        {/* Main Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 w-full">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-extrabold text-gray-900">
                {activeList ? activeList.name : 'Tất cả nhân sự'}
              </h2>
              <p className="text-sm text-gray-500 font-medium mt-1">
                Hiển thị <span className="text-blue-600 font-bold">{displayProfiles.length}</span> nhân sự
              </p>
            </div>
            {!activeListId && (
              <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-500 shadow-sm">
                <Filter size={16} className="text-blue-500" />
                <span className="font-medium">Sắp xếp: Tên (A-Z)</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
            <AnimatePresence mode="popLayout">
              {displayProfiles.map((profile) => (
                <motion.div
                  key={profile.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={{ y: -4 }}
                  className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => setSelectedProfile(profile)}
                >
                  <div className="aspect-[4/5] relative overflow-hidden bg-gray-100">
                    <img
                      src={profile.avatar_url}
                      alt={profile.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=random`;
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                      <span className="text-white text-sm font-medium flex items-center gap-2">
                        <Info size={16} /> Xem chi tiết
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-lg text-gray-900 mb-1 line-clamp-1">{profile.name}</h3>
                    <p className="text-sm text-blue-600 font-medium mb-3 line-clamp-2 h-10">
                      {profile.main_title}
                    </p>
                    <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <MapPin size={14} />
                        <span className="line-clamp-1">{profile.hometown || 'Chưa cập nhật'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar size={14} />
                        <span>{formatDate(profile.birth_day)}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {displayProfiles.length === 0 && (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search size={32} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Không tìm thấy kết quả</h3>
              <p className="text-gray-500">Thử tìm kiếm với từ khóa khác</p>
            </div>
          )}
        </main>

        {/* Footer */}
        {/* Removed redundant footer */}
      </div>

      {/* Create/Edit List Modal */}
      <AnimatePresence>
        {(isCreatingList || editingList) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsCreatingList(false);
                setEditingList(null);
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xl font-bold">{editingList ? 'Sửa danh sách' : 'Tạo danh sách mới'}</h2>
                <button onClick={() => {
                  setIsCreatingList(false);
                  setEditingList(null);
                }} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Tên danh sách</label>
                  <input 
                    type="text"
                    placeholder="VD: Ban Thường vụ, Nhóm công tác..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-bold text-gray-700">Các nhóm nhân sự</label>
                    <button 
                      onClick={() => {
                        const newId = Date.now().toString();
                        setSelectedGroupsForNewList(prev => [...prev, { id: newId, name: 'Nhóm mới', profileIds: [] }]);
                        setActiveGroupIdForNewList(newId);
                      }}
                      className="text-sm text-blue-600 font-bold hover:underline flex items-center gap-1"
                    >
                      <Plus size={14} /> Thêm nhóm
                    </button>
                  </div>
                  
                  <div className="space-y-4 mb-6">
                    {selectedGroupsForNewList.map((group, groupIndex) => (
                      <div key={group.id} className={`border rounded-2xl p-4 transition-all ${activeGroupIdForNewList === group.id ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center gap-3 mb-3">
                          <input 
                            type="text"
                            value={group.name}
                            onChange={(e) => {
                              setSelectedGroupsForNewList(prev => {
                                const newGroups = [...prev];
                                newGroups[groupIndex] = { ...newGroups[groupIndex], name: e.target.value };
                                return newGroups;
                              });
                            }}
                            onClick={() => setActiveGroupIdForNewList(group.id)}
                            className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => {
                                if (groupIndex === 0) return;
                                setSelectedGroupsForNewList(prev => {
                                  const newGroups = [...prev];
                                  [newGroups[groupIndex-1], newGroups[groupIndex]] = [newGroups[groupIndex], newGroups[groupIndex-1]];
                                  return newGroups;
                                });
                              }}
                              className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500"
                            >
                              <ChevronRight size={16} className="-rotate-90" />
                            </button>
                            <button 
                              onClick={() => {
                                if (groupIndex === selectedGroupsForNewList.length - 1) return;
                                setSelectedGroupsForNewList(prev => {
                                  const newGroups = [...prev];
                                  [newGroups[groupIndex], newGroups[groupIndex+1]] = [newGroups[groupIndex+1], newGroups[groupIndex]];
                                  return newGroups;
                                });
                              }}
                              className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500"
                            >
                              <ChevronRight size={16} className="rotate-90" />
                            </button>
                            <button 
                              onClick={() => {
                                if (selectedGroupsForNewList.length <= 1) return;
                                setSelectedGroupsForNewList(prev => prev.filter(g => g.id !== group.id));
                                if (activeGroupIdForNewList === group.id) {
                                  setActiveGroupIdForNewList(selectedGroupsForNewList[0].id === group.id ? selectedGroupsForNewList[1].id : selectedGroupsForNewList[0].id);
                                }
                              }}
                              className="p-1.5 hover:bg-red-100 hover:text-red-600 rounded-lg text-gray-500"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {/* Profiles in group */}
                        <div className="space-y-2">
                          {group.profileIds.length === 0 ? (
                            <div className="text-sm text-gray-400 italic py-2 text-center border-2 border-dashed border-gray-200 rounded-xl cursor-pointer" onClick={() => setActiveGroupIdForNewList(group.id)}>
                              Chưa có nhân sự. Chọn ở danh sách bên dưới để thêm vào nhóm này.
                            </div>
                          ) : (
                            group.profileIds.map((id, index) => {
                              const p = profiles.find(prof => prof.id === id);
                              if (!p) return null;
                              return (
                                <div key={id} className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                                  <div className="flex flex-col gap-1">
                                    <button 
                                      onClick={() => {
                                        if (index === 0) return;
                                        setSelectedGroupsForNewList(prev => {
                                          const newGroups = [...prev];
                                          const newProfileIds = [...newGroups[groupIndex].profileIds];
                                          [newProfileIds[index-1], newProfileIds[index]] = [newProfileIds[index], newProfileIds[index-1]];
                                          newGroups[groupIndex] = { ...newGroups[groupIndex], profileIds: newProfileIds };
                                          return newGroups;
                                        });
                                      }}
                                      className="p-0.5 hover:bg-gray-100 rounded text-gray-400"
                                    >
                                      <ChevronRight size={14} className="-rotate-90" />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        if (index === group.profileIds.length - 1) return;
                                        setSelectedGroupsForNewList(prev => {
                                          const newGroups = [...prev];
                                          const newProfileIds = [...newGroups[groupIndex].profileIds];
                                          [newProfileIds[index], newProfileIds[index+1]] = [newProfileIds[index+1], newProfileIds[index]];
                                          newGroups[groupIndex] = { ...newGroups[groupIndex], profileIds: newProfileIds };
                                          return newGroups;
                                        });
                                      }}
                                      className="p-0.5 hover:bg-gray-100 rounded text-gray-400"
                                    >
                                      <ChevronRight size={14} className="rotate-90" />
                                    </button>
                                  </div>
                                  <img src={p.avatar_url} className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                                  <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
                                  <button 
                                    onClick={() => toggleProfileInNewList(id)}
                                    className="p-1.5 text-gray-400 hover:text-red-500"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-bold text-gray-700">Chọn nhân sự bổ sung</label>
                    <div className="relative w-48">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                      <input 
                        type="text"
                        placeholder="Lọc tên..."
                        className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500"
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase();
                          const items = document.querySelectorAll('.selection-item');
                          items.forEach(item => {
                            const name = item.getAttribute('data-name')?.toLowerCase() || '';
                            (item as HTMLElement).style.display = name.includes(val) ? 'flex' : 'none';
                          });
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-1">
                    {profiles.map(p => {
                      const isSelected = selectedGroupsForNewList.some(g => g.profileIds.includes(p.id));
                      return (
                        <div 
                          key={p.id}
                          data-name={p.name}
                          onClick={() => toggleProfileInNewList(p.id)}
                          className={`selection-item flex items-center gap-3 p-2 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:border-gray-300'}`}
                        >
                          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                            <img src={p.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{p.name}</p>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center text-white">
                              <Check size={12} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
                <button 
                  onClick={() => {
                    setIsCreatingList(false);
                    setEditingList(null);
                  }}
                  className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-100 transition-colors"
                >
                  Hủy
                </button>
                <button 
                  onClick={editingList ? handleUpdateList : handleCreateList}
                  disabled={!newListName.trim() || selectedGroupsForNewList.flatMap(g => g.profileIds).length === 0}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingList ? 'Cập nhật' : 'Tạo danh sách'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View List Modal (New Window Feel) */}
      <AnimatePresence>
        {viewingList && (
          <div className="fixed inset-0 z-50 flex flex-col bg-gray-50">
            <header className="bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setViewingList(null)}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
                >
                  <ArrowLeft size={24} />
                </button>
                <div>
                  <h2 className="text-2xl font-extrabold text-gray-900">{viewingList.name}</h2>
                  <p className="text-xs text-gray-500 font-medium">Danh sách tùy chỉnh • {viewingList.profileIds.length} nhân sự</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    const newWindow = window.open('', '_blank', 'width=1200,height=900');
                    if (newWindow) {
                      newWindow.document.write(`
                        <html>
                          <head>
                            <title>${viewingList.name}</title>
                            <script src="https://cdn.tailwindcss.com"></script>
                            <style>
                              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap');
                              body { font-family: 'Inter', sans-serif; }
                            </style>
                          </head>
                          <body class="bg-gray-50 p-6 md:p-12">
                            <div class="max-w-7xl mx-auto">
                              <h1 class="text-4xl font-extrabold text-gray-900 mb-12 text-center">${viewingList.name}</h1>
                              
                              ${(viewingList.groups || []).map(group => `
                                <div class="mb-12 flex flex-col items-center">
                                  <h3 class="text-xl font-bold text-gray-900 mb-6 pb-2 border-b-2 border-blue-500 inline-block text-center">${group.name}</h3>
                                  <div class="flex flex-wrap justify-center gap-8 w-full">
                                    ${group.profileIds.map(id => {
                                      const profile = profiles.find(p => p.id === id);
                                      if (!profile) return '';
                                      return `
                                        <div class="w-full max-w-sm bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-xl transition-all p-6 flex flex-col items-center text-center">
                                          <div class="aspect-[4/5] w-full relative overflow-hidden bg-gray-100 rounded-2xl mb-4">
                                            <img src="${profile.avatar_url}" alt="${profile.name}" class="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                          </div>
                                          <h3 class="font-bold text-xl text-gray-900 mb-2">${profile.name}</h3>
                                          <p class="text-sm text-blue-600 font-bold mb-4">${profile.main_title}</p>
                                        </div>
                                      `;
                                    }).join('')}
                                  </div>
                                </div>
                              `).join('')}
                            </div>
                          </body>
                        </html>
                      `);
                      newWindow.document.close();
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-sm"
                >
                  <ExternalLink size={18} />
                  <span className="hidden sm:inline">Mở trang mới</span>
                </button>
                <button 
                  onClick={() => setViewingList(null)}
                  className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
                >
                  <X size={24} />
                </button>
              </div>
            </header>

            <main className="flex-1 overflow-y-auto p-6 md:p-12">
              <div className="max-w-full mx-auto space-y-12">
                {(viewingList.groups && viewingList.groups.length > 0) ? (
                  viewingList.groups.map(group => (
                      <div key={group.id} className="flex flex-col items-center w-full">
                        <h3 className="text-xl font-bold text-gray-900 mb-6 pb-2 border-b-2 border-blue-500 inline-block text-center">{group.name}</h3>
                        <div className="flex flex-wrap justify-center gap-8 w-full max-w-7xl mx-auto">
                        {group.profileIds.map(id => {
                          const profile = profiles.find(p => p.id === id);
                          if (!profile) return null;
                          return (
                            <motion.div
                              key={profile.id}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              whileHover={{ y: -8 }}
                              className="w-full max-w-sm bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group flex flex-col"
                              onClick={() => setSelectedProfile(profile)}
                            >
                              <div className="aspect-[4/5] relative overflow-hidden bg-gray-100">
                                <img
                                  src={profile.avatar_url}
                                  alt={profile.name}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                                  <span className="text-white text-sm font-bold flex items-center gap-2">
                                    <Info size={18} /> Xem chi tiết
                                  </span>
                                </div>
                              </div>
                              <div className="p-6 flex flex-col items-center text-center">
                                <h3 className="font-bold text-xl text-gray-900 mb-2 line-clamp-1">{profile.name}</h3>
                                <p className="text-sm text-blue-600 font-bold mb-4 line-clamp-2 h-10">
                                  {profile.main_title}
                                </p>
                                <div className="flex flex-col gap-3 pt-4 border-t border-gray-100">
                                  <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                                    <MapPin size={14} className="text-blue-500" />
                                    <span className="truncate">{profile.hometown || 'N/A'}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                                    <Calendar size={14} className="text-blue-500" />
                                    <span>{formatDate(profile.birth_day)}</span>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8 justify-items-center">
                    {viewingList.profileIds.map(id => {
                      const profile = profiles.find(p => p.id === id);
                      if (!profile) return null;
                      return (
                        <motion.div
                          key={profile.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ y: -8 }}
                          className="w-full max-w-sm bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-xl transition-all cursor-pointer group"
                          onClick={() => setSelectedProfile(profile)}
                        >
                          <div className="aspect-[4/5] relative overflow-hidden bg-gray-100">
                            <img
                              src={profile.avatar_url}
                              alt={profile.name}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                              <span className="text-white text-sm font-bold flex items-center gap-2">
                                <Info size={18} /> Xem chi tiết
                              </span>
                            </div>
                          </div>
                          <div className="p-6 flex flex-col items-center text-center">
                            <h3 className="font-bold text-xl text-gray-900 mb-2 line-clamp-1">{profile.name}</h3>
                            <p className="text-sm text-blue-600 font-bold mb-4 line-clamp-2 h-10">
                              {profile.main_title}
                            </p>
                            <div className="flex flex-col gap-3 pt-4 border-t border-gray-100">
                              <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                                <MapPin size={14} className="text-blue-500" />
                                <span className="truncate">{profile.hometown || 'N/A'}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                                <Calendar size={14} className="text-blue-500" />
                                <span>{formatDate(profile.birth_day)}</span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </main>

            <footer className="bg-white border-t border-gray-200 py-6 px-4 sm:px-6 lg:px-8 mt-auto">
              <div className="text-center text-sm text-gray-500">
                <p>© 2026 Hồ sơ nhân sự. Dữ liệu được cung cấp bởi Đại hội Đảng toàn quốc.</p>
              </div>
            </footer>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Detail Modal */}
      <AnimatePresence>
        {selectedProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProfile(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <button
                onClick={() => setSelectedProfile(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 hover:text-gray-900 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex-1 overflow-y-auto p-6 sm:p-10">
                {/* Top Section: Avatar + Basic Info */}
                <div className="flex flex-col items-center w-full gap-8 mb-10">
                  <div className="w-32 h-40 sm:w-48 sm:h-60 flex-shrink-0 mx-auto">
                    <img
                      src={selectedProfile.avatar_url}
                      alt={selectedProfile.name}
                      className="w-full h-full object-contain bg-gray-50 rounded-2xl shadow-sm border border-gray-100"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  
                  <div className="flex-1 w-full flex flex-col items-center">
                    <div className="mb-6 text-center">
                      <h2 className="text-3xl font-extrabold text-gray-900 mb-2">{selectedProfile.name}</h2>
                      <p className="text-blue-600 font-bold text-lg leading-snug">
                        {selectedProfile.main_title}
                      </p>
                    </div>

                    <section>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 text-center md:text-left">Thông tin cơ bản</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <Calendar size={16} />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Ngày sinh</p>
                            <p className="text-sm font-bold text-gray-700">{formatDate(selectedProfile.birth_day)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <MapPin size={16} />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Quê quán</p>
                            <p className="text-sm font-bold text-gray-700">{selectedProfile.hometown || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <GraduationCap size={16} />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Trình độ</p>
                            <p className="text-sm font-bold text-gray-700">{selectedProfile.profession_level || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <User size={16} />
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">Dân tộc</p>
                            <p className="text-sm font-bold text-gray-700">{selectedProfile.ethnicity || 'Kinh'}</p>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>

                <div className="space-y-10">
                  {selectedProfile.intro && (
                    <section className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Giới thiệu</h4>
                      <p className="text-gray-600 text-sm leading-relaxed italic">
                        "{selectedProfile.intro}"
                      </p>
                    </section>
                  )}

                  <section>
                    <div className="flex items-center gap-3 mb-6">
                      <div className="h-px flex-1 bg-gray-100"></div>
                      <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">Tóm tắt quá trình công tác</h4>
                      <div className="h-px flex-1 bg-gray-100"></div>
                    </div>
                    
                    {loadingCareer ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm text-gray-400 font-medium tracking-wide">Đang tải tiểu sử...</span>
                      </div>
                    ) : politicalCareers[selectedProfile.id] && politicalCareers[selectedProfile.id].length > 0 ? (
                      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full border-collapse">
                          <tbody className="divide-y divide-gray-50">
                            {politicalCareers[selectedProfile.id].map((career) => (
                              <tr 
                                key={career.id} 
                                className="hover:bg-gray-50/50 transition-colors"
                                dangerouslySetInnerHTML={{ 
                                  __html: normalizeCareerDescription(career.description) 
                                }} 
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                        <p className="text-sm text-gray-400 italic">Không có dữ liệu tiểu sử.</p>
                      </div>
                    )}
                  </section>
                </div>
              </div>

              <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button 
                  onClick={() => setSelectedProfile(null)}
                  className="px-8 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-100 transition-all shadow-sm"
                >
                  Đóng cửa sổ
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-500">
            © 2026 Hồ sơ nhân sự. Dữ liệu được cung cấp bởi Đại hội Đảng toàn quốc.
          </p>
        </div>
      </footer>
    </div>
    </>
  );
}
