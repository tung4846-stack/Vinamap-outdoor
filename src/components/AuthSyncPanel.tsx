import React, { useState } from 'react';
import { 
  ShieldCheck, 
  User, 
  Mail, 
  Lock, 
  LogOut, 
  CloudLightning, 
  RefreshCw, 
  KeyRound, 
  Check,
  Users,
  UserPlus,
  Trash2,
  MapPin,
  UserCheck,
  ShieldAlert,
  FolderLock,
  Compass,
  Briefcase
} from 'lucide-react';
import { UserProfile, Tracklog, OfflineRegion, SubAccount } from '../types';
import { loginMaster, registerMaster, loginSubAccount, registerSubAccountGlobally } from '../authApi';
import { formatDateTime } from '../utils/geoUtils';

interface AuthSyncPanelProps {
  user: UserProfile;
  tracklogsList: Tracklog[];
  offlineRegions: OfflineRegion[];
  onLogin: (email: string, name: string, role?: 'master' | 'sub' | 'regular', assignedRegion?: string, masterEmail?: string) => void;
  onLogout: () => void;
  onSyncAll: () => Promise<void>;
  isSyncing: boolean;
  addToast: (message: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  subAccounts: SubAccount[];
  onUpdateSubAccounts: (newSubs: SubAccount[]) => void;
  securityPin: string | null;
  onSetSecurityPin: (pin: string | null) => void;
  onLockApp: () => void;
  onOptimizeData?: () => void;
}

export const AuthSyncPanel: React.FC<AuthSyncPanelProps> = ({
  user,
  tracklogsList,
  offlineRegions,
  onLogin,
  onLogout,
  onSyncAll,
  isSyncing,
  addToast,
  subAccounts,
  onUpdateSubAccounts,
  securityPin,
  onSetSecurityPin,
  onLockApp,
  onOptimizeData,
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  
  // PIN LOCK STATES
  const [pinSetup, setPinSetup] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinToDisable, setPinToDisable] = useState('');
  const [isSettingPin, setIsSettingPin] = useState(false);
  
  // LOGIN FORM STATES
  const [loginRole, setLoginRole] = useState<'master' | 'sub'>('master');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // REGISTER FORM STATES
  const [registerRole, setRegisterRole] = useState<'master' | 'regular'>('master');
  const [name, setName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // MASTER MANAGEMENT PANEL SUB-TABS
  const [masterSubTab, setMasterSubTab] = useState<'sync' | 'manage'>('sync');

  // CREATE SUB-ACCOUNT STATE
  const [newSubName, setNewSubName] = useState('');
  const [newSubEmail, setNewSubEmail] = useState('');
  const [newSubPassword, setNewSubPassword] = useState('');
  const [newSubRegion, setNewSubRegion] = useState('');
  const [newSubPhone, setNewSubPhone] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      addToast('Vui lòng điền đầy đủ email và mật khẩu.', 'warning');
      return;
    }
    if (activeTab === 'register' && !name.trim()) {
      addToast('Vui lòng nhập tên hiển thị của bạn.', 'warning');
      return;
    }

    setAuthLoading(true);

    try {
      if (activeTab === 'login') {
        if (loginRole === 'sub') {
          // Firebase login for Sub Account
          const sub = await loginSubAccount(email, password);
          localStorage.setItem('vinamap_current_master_email', sub.masterEmail);
          onLogin(sub.email, sub.displayName, 'sub', sub.assignedRegion, sub.masterEmail);
          addToast(`[Cán bộ Ngoại nghiệp] Đăng nhập thành công! Phân khu: ${sub.assignedRegion}`, 'success');
          setEmail('');
          setPassword('');
        } else {
          // Firebase login for Master Account
          const profile = await loginMaster(email, password);
          localStorage.setItem('vinamap_current_master_email', email);
          onLogin(email, profile.displayName, 'master', profile.assignedRegion, email);
          addToast(`[Phòng Kỹ Thuật] Đăng nhập tài khoản chủ thành công.`, 'success');
          setEmail('');
          setPassword('');
        }
      } else {
        // Firebase register
        if (registerRole === 'master') {
          await registerMaster(email, password, name);
          localStorage.setItem('vinamap_current_master_email', email);
          onLogin(email, name, 'master', undefined, email);
          addToast(`Đăng ký Tài khoản chủ thành công! Chào ${name}.`, 'success');
          setEmail('');
          setPassword('');
          setName('');
        } else {
          addToast('Chỉ Tài khoản chủ mới được đăng ký. Tài khoản con do Phòng Kỹ Thuật cấp.', 'warning');
        }
      }
    } catch (error: any) {
      addToast(error.message || 'Có lỗi xảy ra', 'error');
    }
    setAuthLoading(false);
  };

  // CREATE SUB ACCOUNT HANDLER
  const handleCreateSubAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim() || !newSubEmail.trim() || !newSubPassword.trim() || !newSubRegion.trim() || !newSubPhone.trim()) {
      addToast('Vui lòng điền đầy đủ thông tin để cấp tài khoản con.', 'warning');
      return;
    }

    if (subAccounts.some((sub) => sub.email?.trim().toLowerCase() === newSubEmail.trim().toLowerCase())) {
      addToast('Email này đã được cấp phát tài khoản trước đó.', 'error');
      return;
    }

    setAuthLoading(true);
    try {
      const newSub: SubAccount = {
        id: `sub-${Date.now()}`,
        displayName: newSubName.trim(),
        email: newSubEmail.trim().toLowerCase(),
        password: newSubPassword.trim(),
        assignedRegion: newSubRegion.trim(),
        phone: newSubPhone.trim(),
        createdAt: Date.now(),
        syncCount: 0,
      };

      await registerSubAccountGlobally(newSub, user.email);

      const updated = [...subAccounts, newSub];
      onUpdateSubAccounts(updated);
      
      // Force immediate sync to cloud so other devices see the update instantly
      addToast(`Đang đồng bộ danh sách cán bộ lên hệ thống...`, 'info');
      await onSyncAll();
      
      addToast(`Cấp tài khoản con thành công cho cán bộ: ${newSubName}!`, 'success');

      setNewSubName('');
      setNewSubEmail('');
      setNewSubPassword('');
      setNewSubRegion('');
      setNewSubPhone('');
    } catch (err: any) {
      addToast(err.message || 'Không thể tạo tài khoản con.', 'error');
    }
    setAuthLoading(false);
  };

  // REVOKE SUB ACCOUNT HANDLER
  const handleDeleteSubAccount = async (id: string, name: string) => {
    if (confirm(`Bạn có chắc chắn muốn thu hồi tài khoản của cán bộ "${name}" không?`)) {
      const updated = subAccounts.filter((sub) => sub.id !== id);
      onUpdateSubAccounts(updated);
      
      addToast(`Đang cập nhật thay đổi lên hệ thống...`, 'info');
      await onSyncAll();
      
      addToast(`Đã khóa và thu hồi quyền truy cập của cán bộ ${name}.`, 'info');
    }
  };

  const handleEnablePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pinSetup)) {
      addToast('Mã bảo mật phải là số và có độ dài từ 4 đến 6 ký tự.', 'warning');
      return;
    }
    if (pinSetup !== pinConfirm) {
      addToast('Xác nhận mã bảo mật không khớp.', 'error');
      return;
    }
    onSetSecurityPin(pinSetup);
    setPinSetup('');
    setPinConfirm('');
    addToast('Kích hoạt mã khóa bảo mật thành công! Ứng dụng sẽ tự động khóa khi khởi động hoặc nhấn Khóa ngay.', 'success');
  };

  const handleDisablePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinToDisable !== securityPin) {
      addToast('Mã PIN xác thực không chính xác. Không thể hủy kích hoạt!', 'error');
      return;
    }
    onSetSecurityPin(null);
    setPinToDisable('');
    addToast('Đã vô hiệu hóa mã bảo mật thành công.', 'info');
  };

  const handleSyncClick = () => {
    if (!user.isLoggedIn) {
      addToast('Vui lòng đăng nhập để đồng bộ dữ liệu đám mây Firebase.', 'warning');
      return;
    }
    onSyncAll();
  };

  const unsyncedTracksCount = tracklogsList.filter((t) => !t.isSynced).length;

  return (
    <div className="flex flex-col gap-5 h-full">
      {user.isLoggedIn ? (
        /* ================== SIGNED IN USER INTERFACE ================== */
        <div className="flex flex-col gap-4 h-full">
          
          {/* SECURE USER ROLE CARD */}
          <div className="bg-black/60 border border-white/10 rounded-2xl p-4 flex flex-col gap-3.5 shadow-xl relative overflow-hidden">
            {/* Background design accents */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#FFD700]/5 rounded-full filter blur-xl pointer-events-none" />
            
            <div className="flex items-center gap-3.5">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-black text-lg shrink-0 ${
                user.role === 'master' ? 'bg-[#FFD700]' : 'bg-[#00FF41]'
              }`}>
                {user.displayName?.substring(0, 2).toUpperCase() || 'CB'}
              </div>
              
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-black text-white text-sm leading-tight truncate">{user.displayName}</h3>
                  
                  {/* ROLE BADGE */}
                  {user.role === 'master' ? (
                    <span className="text-[8px] bg-red-600/90 text-white font-black px-1.5 py-0.5 rounded tracking-widest uppercase">
                      Chủ Phòng KT
                    </span>
                  ) : (
                    <span className="text-[8px] bg-green-600/90 text-white font-black px-1.5 py-0.5 rounded tracking-widest uppercase">
                      Ngoại Nghiệp
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-white/40 font-mono truncate mt-0.5">{user.email}</p>
                
                {user.assignedRegion && (
                  <div className="flex items-center gap-1 text-[10px] text-[#FFD700] font-bold mt-1">
                    <MapPin className="w-3 h-3 text-[#FFD700] shrink-0" />
                    <span className="truncate">{user.assignedRegion}</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-between items-center bg-black/40 px-3 py-2 rounded-xl border border-white/5">
              <span className="text-[10px] text-white/40 uppercase font-black tracking-wider">Trạng thái bảo mật</span>
              <div className="flex items-center gap-1">
                <FolderLock className="w-3.5 h-3.5 text-[#00FF41]" />
                <span className="text-[10px] text-[#00FF41] font-mono font-black uppercase">Đã mã hóa dữ liệu</span>
              </div>
            </div>
          </div>

          {/* MASTER ROLE MANAGEMENT TABS */}
          {user.role === 'master' && (
            <div className="flex bg-black/80 p-1 rounded-xl border border-white/10 shrink-0">
              <button
                onClick={() => setMasterSubTab('sync')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  masterSubTab === 'sync' ? 'bg-[#FFD700] text-black font-black' : 'text-white/40 hover:text-white'
                }`}
              >
                <CloudLightning className="w-3.5 h-3.5" />
                ĐỒNG BỘ ĐÁM MÂY
              </button>
              <button
                onClick={() => setMasterSubTab('manage')}
                className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 relative ${
                  masterSubTab === 'manage' ? 'bg-[#FFD700] text-black font-black' : 'text-white/40 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                CẤP TÀI KHOẢN CON
                {subAccounts.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-mono text-[8px] px-1 rounded-full scale-90 border border-[#0B0C10]">
                    {subAccounts.length}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* MASTER SUB-TABS CONTENT RENDERING */}
          {user.role === 'master' && masterSubTab === 'manage' ? (
            /* ================== SUB ACCOUNTS MANAGEMENT DASHBOARD ================== */
            <div className="flex-1 flex flex-col gap-4">
              {/* CREATE SUB ACCOUNT FORM */}
              <form onSubmit={handleCreateSubAccount} className="bg-black/35 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
                <h4 className="text-[10px] font-black text-[#FFD700] uppercase tracking-wider flex items-center gap-1.5 border-b border-white/5 pb-1.5">
                  <UserPlus className="w-4 h-4 text-[#FFD700]" /> Cấp mới tài khoản ngoại nghiệp
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-white/30 font-black uppercase">Họ & Tên Cán Bộ</label>
                    <input
                      type="text"
                      required
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      className="w-full h-8 px-2.5 bg-black border border-white/10 focus:border-[#FFD700] text-white rounded-lg text-[10px] font-bold outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-white/30 font-black uppercase">Khu Vực Phụ Trách</label>
                    <input
                      type="text"
                      required
                      value={newSubRegion}
                      onChange={(e) => setNewSubRegion(e.target.value)}
                      placeholder="Cát Lộc - Tiểu khu 3"
                      className="w-full h-8 px-2.5 bg-black border border-white/10 focus:border-[#FFD700] text-white rounded-lg text-[10px] font-bold outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-white/30 font-black uppercase">Email đăng nhập</label>
                    <input
                      type="email"
                      required
                      value={newSubEmail}
                      onChange={(e) => setNewSubEmail(e.target.value)}
                      placeholder="canbo@domain.com"
                      className="w-full h-8 px-2.5 bg-black border border-white/10 focus:border-[#FFD700] text-white rounded-lg text-[10px] font-bold outline-none font-mono"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-white/30 font-black uppercase">Mật khẩu cấp</label>
                    <input
                      type="text"
                      required
                      value={newSubPassword}
                      onChange={(e) => setNewSubPassword(e.target.value)}
                      placeholder="Mật khẩu khởi tạo"
                      className="w-full h-8 px-2.5 bg-black border border-white/10 focus:border-[#FFD700] text-white rounded-lg text-[10px] font-bold outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] text-white/30 font-black uppercase">Số điện thoại liên lạc</label>
                    <input
                      type="tel"
                      required
                      value={newSubPhone}
                      onChange={(e) => setNewSubPhone(e.target.value)}
                      placeholder="09xx..."
                      className="w-full h-8 px-2.5 bg-black border border-white/10 focus:border-[#FFD700] text-white rounded-lg text-[10px] font-bold outline-none font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full h-9 bg-[#FFD700] hover:brightness-110 text-black rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Tạo & kích hoạt tài khoản
                </button>
              </form>

              {/* ACTIVE SUB ACCOUNTS LIST */}
              <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-y-auto">
                <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest pl-1">
                  Cán bộ hoạt động ({subAccounts.length})
                </h4>

                {subAccounts.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-2">
                    <Users className="w-8 h-8 text-white/20" />
                    <p className="text-[10px] text-white/30 max-w-[200px] leading-relaxed">
                      Chưa có tài khoản con nào được cấp phát. Sử dụng form phía trên để khởi tạo tài khoản ngoại nghiệp.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {subAccounts.map((sub) => (
                      <div key={sub.id} className="bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col gap-2">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                              <h5 className="font-bold text-white text-xs truncate">{sub.displayName}</h5>
                            </div>
                            <p className="text-[9px] text-white/40 font-mono truncate">{sub.email}</p>
                          </div>
                          
                          <button
                            onClick={() => handleDeleteSubAccount(sub.id, sub.displayName)}
                            className="p-1 text-white/20 hover:text-red-500 rounded transition-colors cursor-pointer"
                            title="Xóa / Thu hồi tài khoản"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[9px] font-mono border-t border-white/5 pt-2 text-white/40">
                          <div className="flex items-center gap-1 truncate col-span-2">
                            <MapPin className="w-3 h-3 text-[#FFD700] shrink-0" />
                            <span className="truncate text-white/60">Khu vực: {sub.assignedRegion}</span>
                          </div>
                          {sub.phone && (
                            <div className="flex items-center gap-1 truncate col-span-2">
                              <span className="text-[#FF4444] shrink-0 font-bold">📞</span>
                              <span className="truncate text-white/60">SĐT: {sub.phone}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 col-span-2">
                            <Compass className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>Đã đồng bộ dữ liệu: <b className="text-emerald-400">{sub.syncCount} lần</b></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ================== STANDARD CLOUD SYNC & STATS (Available to Sub & Master) ================== */
            <div className="flex-1 flex flex-col gap-4">
              
              {/* SYNC STATISTICS */}
              <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
                <h4 className="text-xs font-black text-[#FFD700] uppercase tracking-widest border-b border-b-white/5 pb-1.5">
                  Thống Kê Đồng Bộ Đám Mây
                </h4>

                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex justify-between font-mono">
                    <span className="text-white/40">Tuyến đường Tracklog:</span>
                    <span className="text-gray-200 font-bold">{tracklogsList.length}</span>
                  </div>
                  <div className="flex justify-between font-mono pl-3 border-l border-white/5">
                    <span className="text-white/30">Chưa đồng bộ cục bộ:</span>
                    <span className={`font-bold ${unsyncedTracksCount > 0 ? 'text-[#FFD700]' : 'text-white/40'}`}>
                      {unsyncedTracksCount}
                    </span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-white/40">Bản đồ offline đã lưu:</span>
                    <span className="text-gray-200 font-bold">{offlineRegions.length}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-white/40">Tổng số lần đã đồng bộ:</span>
                    <span className="text-[#00FF41] font-black">{user.syncCount} lần</span>
                  </div>
                  {user.lastSyncTime && (
                    <div className="flex justify-between font-mono pt-1.5 border-t border-white/5">
                      <span className="text-white/30">Đồng bộ lần cuối:</span>
                      <span className="text-gray-300 font-bold">{formatDateTime(user.lastSyncTime)}</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* TỐI ƯU DUNG LƯỢNG & BỘ NHỚ */}
              <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4 text-[#00FF41]" />
                    <h4 className="text-xs font-black text-white uppercase tracking-widest">
                      TỐI ƯU DUNG LƯỢNG & BỘ NHỚ
                    </h4>
                  </div>
                </div>
                <p className="text-[10px] text-white/40 leading-relaxed font-sans">
                  Ghi nhận quá nhiều tọa độ thực địa (tracklogs) sẽ khiến thiết bị quá tải. Kích hoạt thuật toán nén và loại bỏ dữ liệu dư thừa để tăng tốc bản đồ lên tối đa, giảm tải ứng dụng xuống mức thấp nhất.
                </p>
                <button
                  onClick={onOptimizeData}
                  className="w-full h-9 bg-[#00FF41]/10 hover:bg-[#00FF41]/20 text-[#00FF41] border border-[#00FF41]/30 font-black text-[10px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer font-sans"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} /> TỐI ƯU HÓA HÀNH TRÌNH (GIẢM TẢI)
                </button>
              </div>

              {/* DEVICE PIN SECURITY SYSTEM (ANTI-HACK / ANTI-THEFT) */}
              <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <div className="flex items-center gap-1.5">
                    <FolderLock className={`w-4 h-4 ${securityPin ? 'text-[#FFD700]' : 'text-white/30'}`} />
                    <h4 className="text-xs font-black text-white uppercase tracking-widest">
                      BẢO MẬT CHỐNG XÂM NHẬP (PIN LOCK)
                    </h4>
                  </div>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded tracking-wide uppercase ${
                    securityPin ? 'bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/20 animate-pulse' : 'bg-white/5 text-white/30'
                  }`}>
                    {securityPin ? 'ĐANG BẬT' : 'CHƯA BẬT'}
                  </span>
                </div>

                {securityPin ? (
                  /* PIN is configured. Allow quick lock or disable */
                  <div className="flex flex-col gap-3.5">
                    <div className="flex gap-2">
                      <button
                        onClick={onLockApp}
                        className="flex-1 h-9 bg-red-600 hover:bg-red-700 text-white font-black text-[10px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5" /> KHÓA ỨNG DỤNG NGAY
                      </button>
                    </div>

                    <form onSubmit={handleDisablePin} className="border-t border-white/5 pt-3 flex flex-col gap-2">
                      <p className="text-[10px] text-white/40 leading-relaxed">
                        Để hủy kích hoạt mã PIN, vui lòng xác nhận mã bảo mật hiện tại của thiết bị:
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          required
                          maxLength={6}
                          value={pinToDisable}
                          onChange={(e) => setPinToDisable(e.target.value.replace(/\D/g, ''))}
                          placeholder="Mã PIN hiện tại"
                          className="flex-1 h-8 px-2.5 bg-black border border-white/10 focus:border-red-500 text-white rounded-lg text-center font-mono font-black text-xs outline-none"
                        />
                        <button
                          type="submit"
                          className="h-8 px-3 bg-white/10 hover:bg-red-500/20 hover:text-red-400 text-white font-extrabold text-[10px] uppercase rounded-lg border border-white/10 transition-colors cursor-pointer"
                        >
                          TẮT KHÓA PIN
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  /* PIN is NOT configured. Show setup form */
                  <form onSubmit={handleEnablePin} className="flex flex-col gap-2.5">
                    <p className="text-[10px] text-white/40 leading-relaxed">
                      Thiết lập mã bảo mật 4-6 số để bảo mật dữ liệu tracklogs, ranh giới rừng KML & bản đó offline trong máy, tránh người lạ xâm nhập và đánh cắp.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] text-white/30 font-black uppercase">Nhập mã PIN mới</label>
                        <input
                          type="password"
                          required
                          maxLength={6}
                          value={pinSetup}
                          onChange={(e) => setPinSetup(e.target.value.replace(/\D/g, ''))}
                          placeholder="4-6 chữ số"
                          className="w-full h-8 px-2.5 bg-black border border-white/10 focus:border-[#FFD700] text-white rounded-lg text-center font-mono font-black text-xs outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] text-white/30 font-black uppercase">Xác nhận mã PIN</label>
                        <input
                          type="password"
                          required
                          maxLength={6}
                          value={pinConfirm}
                          onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                          placeholder="Nhập lại mã PIN"
                          className="w-full h-8 px-2.5 bg-black border border-white/10 focus:border-[#FFD700] text-white rounded-lg text-center font-mono font-black text-xs outline-none"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full h-8 bg-[#FFD700] hover:brightness-110 text-black font-black text-[10px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer mt-1"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> KÍCH HOẠT MÃ BẢO MẬT
                    </button>
                  </form>
                )}
              </div>

              {/* SECURITY NOTE FOR SUB-ACCOUNTS */}
              {user.role === 'sub' && (
                <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4 flex items-start gap-3 text-xs leading-normal">
                  <ShieldCheck className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                  <div className="flex-1 text-white/70">
                    <h5 className="font-bold text-green-400 mb-0.5">Kênh Bảo Mật Nội Bộ</h5>
                    Thiết bị của bạn hoạt động bằng tài khoản nghiệp vụ được Phòng Kỹ Thuật cấp phát. Toàn bộ dữ liệu đo ranh giới đám cháy & tracklog tuần tra sẽ tự động chuyển tiếp an toàn tới tài khoản quản trị Phòng Kỹ Thuật.
                  </div>
                </div>
              )}

              {/* ACTIVE SYNC MODULE */}
              <div className="bg-[#FFD700]/5 border border-[#FFD700]/30 rounded-2xl p-5 flex flex-col gap-4 text-center mt-auto">
                {isSyncing ? (
                  <div className="py-2 flex flex-col items-center gap-3">
                    <RefreshCw className="w-10 h-10 text-[#FFD700] animate-spin" />
                    <div>
                      <h4 className="text-sm font-black text-[#FFD700] uppercase tracking-widest mb-1">
                        ĐANG ĐỒNG BỘ FIRESTORE
                      </h4>
                      <p className="text-xs text-gray-200">Đang sao lưu tuyến đường & cấu hình offline...</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <CloudLightning className="w-10 h-10 text-[#FFD700] mx-auto mb-2" />
                      <h4 className="text-sm font-black text-white uppercase tracking-wider mb-1">
                        Đồng Bộ Cơ Sở Dữ Liệu
                      </h4>
                      <p className="text-xs text-white/40 leading-relaxed">
                        Đồng bộ hóa an toàn mọi tuyến đường di chuyển ngoại nghiệp và bản đồ ngoại tuyến lên cơ sở dữ liệu để phòng kỹ thuật tổng hợp.
                      </p>
                    </div>

                    <button
                      onClick={handleSyncClick}
                      className="w-full h-14 bg-[#FFD700] hover:brightness-110 text-black rounded-xl font-black text-base uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-lg transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-5 h-5 text-black animate-spin-slow" /> ĐỒNG BỘ NGAY BÂY GIỜ
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* LOGOUT */}
          <button
            onClick={onLogout}
            className="w-full h-12 border-2 border-white/10 hover:border-[#FF4444]/30 text-white/50 hover:text-[#FF4444] rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors mt-auto cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" /> ĐĂNG XUẤT TÀI KHOẢN
          </button>
        </div>
      ) : (
        /* ================== SIGN IN / SIGN UP FORMS ================== */
        <div className="bg-black/50 border border-white/10 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-1 border-b border-white/10 pb-3">
            <ShieldCheck className="w-6 h-6 text-[#FFD700]" />
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Hệ thống đồng bộ bảo mật</h3>
              <p className="text-[10px] text-white/40 font-mono">XÁC THỰC PHÒNG KỸ THUẬT & NGOẠI NGHIỆP</p>
            </div>
          </div>

          {/* TAB TOGGLE */}
          <div className="flex bg-black/80 p-1.5 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab('login')}
              className={`flex-1 h-10 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === 'login' ? 'bg-[#FFD700] text-black' : 'text-white/40 hover:text-white'
              }`}
            >
              ĐĂNG NHẬP
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`flex-1 h-10 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === 'register' ? 'bg-[#FFD700] text-black' : 'text-white/40 hover:text-white'
              }`}
            >
              ĐĂNG KÝ CHỦ
            </button>
          </div>

          {/* ROLE SELECTOR FOR LOGIN */}
          {activeTab === 'login' && (
            <div className="grid grid-cols-2 bg-black/45 p-1 rounded-lg border border-white/5 gap-1">
              <button
                type="button"
                onClick={() => setLoginRole('master')}
                className={`py-1.5 rounded text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  loginRole === 'master'
                    ? 'bg-[#FFD700]/20 text-[#FFD700] border border-[#FFD700]/40'
                    : 'text-white/40 border border-transparent'
                }`}
              >
                <Briefcase className="w-3 h-3" /> Tài khoản Chủ
              </button>
              <button
                type="button"
                onClick={() => setLoginRole('sub')}
                className={`py-1.5 rounded text-[10px] font-black transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  loginRole === 'sub'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                    : 'text-white/40 border border-transparent'
                }`}
              >
                <Compass className="w-3 h-3" /> Cán Bộ Con
              </button>
            </div>
          )}

          {/* ROLE SELECTOR FOR REGISTER */}
          {activeTab === 'register' && (
            <div className="bg-[#FFD700]/5 border border-[#FFD700]/20 p-3 rounded-xl flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-[#FFD700] shrink-0 mt-0.5" />
              <div className="text-[10px] text-white/60 leading-normal">
                <span className="font-bold text-[#FFD700] block mb-0.5">Phân quyền Tài khoản chủ (Master)</span>
                Tài khoản chủ sau khi đăng ký sẽ có toàn quyền tạo, quản lý và thu hồi các tài khoản con của kiểm lâm ngoại nghiệp.
              </div>
            </div>
          )}

          {/* AUTH FORM */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {activeTab === 'register' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-extrabold text-white/40 uppercase tracking-widest">Tên đơn vị / Họ tên chủ</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Phòng Kỹ Thuật Hạt Kiểm Lâm..."
                    className="w-full h-11 pl-10 pr-4 bg-black border-2 border-white/10 focus:border-[#FFD700] text-gray-100 font-bold rounded-xl text-xs outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold text-white/40 uppercase tracking-widest">Địa chỉ Email đăng nhập</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full h-11 pl-10 pr-4 bg-black border-2 border-white/10 focus:border-[#FFD700] text-gray-100 font-bold rounded-xl text-xs outline-none transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-extrabold text-white/40 uppercase tracking-widest">Mật khẩu bảo mật</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 pl-10 pr-4 bg-black border-2 border-white/10 focus:border-[#FFD700] text-gray-100 font-bold rounded-xl text-xs outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full h-14 bg-[#FFD700] hover:brightness-110 disabled:bg-[#FFD700]/30 text-black font-black rounded-xl text-base uppercase tracking-widest flex items-center justify-center gap-2 mt-2 shadow-lg transition-all cursor-pointer"
            >
              {authLoading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : activeTab === 'login' ? (
                <>
                  <KeyRound className="w-5 h-5" /> 
                  {loginRole === 'master' ? 'Đăng nhập TK Chủ' : 'Đăng nhập Cán Bộ Con'}
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" /> KÍCH HOẠT TÀI KHOẢN CHỦ
                </>
              )}
            </button>
          </form>

          <p className="text-[10px] text-center text-white/30 leading-normal max-w-[260px] mx-auto mt-1">
            {activeTab === 'login' && loginRole === 'sub'
              ? 'Tài khoản cán bộ ngoại nghiệp (tài khoản con) được khởi tạo và kiểm soát hoàn toàn bởi tài khoản quản trị Phòng Kỹ Thuật.'
              : 'Dữ liệu được lưu trữ bảo mật cục bộ và mã hóa truyền dẫn đồng bộ an toàn qua kết nối Firebase Firestore.'}
          </p>
        </div>
      )}
    </div>
  );
};
