import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Lock, Unlock, Delete, AlertTriangle, RefreshCw } from 'lucide-react';

interface LockScreenProps {
  correctPin: string;
  onUnlock: () => void;
  onSelfDestruct: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({
  correctPin,
  onUnlock,
  onSelfDestruct,
}) => {
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<number>(0);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [lockoutTimeLeft, setLockoutTimeLeft] = useState<number>(0);
  const [shake, setShake] = useState<boolean>(false);

  const MAX_ATTEMPTS_BEFORE_TIMEOUT = 5;
  const MAX_ATTEMPTS_BEFORE_DESTRUCT = 10;
  const TIMEOUT_SECONDS = 30;

  // Handle Lockout timer
  useEffect(() => {
    if (lockoutTimeLeft > 0) {
      const timer = setInterval(() => {
        setLockoutTimeLeft((prev) => {
          if (prev <= 1) {
            setIsLockedOut(false);
            setAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockoutTimeLeft]);

  const handleKeyPress = (num: string) => {
    if (isLockedOut) return;
    if (enteredPin.length >= 6) return;
    setError(null);
    setEnteredPin((prev) => prev + num);
  };

  const handleDelete = () => {
    if (isLockedOut) return;
    setEnteredPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (isLockedOut) return;
    setEnteredPin('');
  };

  useEffect(() => {
    // Automatically verify when the entered PIN matches the length of the correct PIN
    if (enteredPin.length === correctPin.length) {
      if (enteredPin === correctPin) {
        // Correct PIN!
        onUnlock();
        setEnteredPin('');
        setAttempts(0);
        setError(null);
      } else {
        // Incorrect PIN
        setShake(true);
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setEnteredPin('');
        
        setTimeout(() => setShake(false), 500);

        if (newAttempts >= MAX_ATTEMPTS_BEFORE_DESTRUCT) {
          setError('Hệ thống phát hiện xâm nhập trái phép! Tự động hủy toàn bộ dữ liệu cục bộ.');
          setTimeout(() => {
            onSelfDestruct();
          }, 2000);
        } else if (newAttempts >= MAX_ATTEMPTS_BEFORE_TIMEOUT) {
          setIsLockedOut(true);
          setLockoutTimeLeft(TIMEOUT_SECONDS);
          setError(`Nhập sai quá nhiều lần. Thiết bị bị khóa tạm thời trong ${TIMEOUT_SECONDS} giây để chống Hack.`);
        } else {
          setError(`Mã bảo mật không chính xác. Còn lại ${MAX_ATTEMPTS_BEFORE_DESTRUCT - newAttempts} lần thử trước khi tự động xóa dữ liệu.`);
        }
      }
    }
  }, [enteredPin, correctPin, attempts, onUnlock, onSelfDestruct]);

  return (
    <div className="fixed inset-0 bg-[#07080A] flex flex-col items-center justify-center z-[99999] overflow-hidden select-none">
      {/* Background Matrix/Rays design for technical high-security feel */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,215,0,0.03)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-[#FFD700] to-red-500 animate-pulse" />

      <div className="max-w-md w-full px-8 flex flex-col items-center justify-between h-[90vh]">
        {/* Header Security Status */}
        <div className="flex flex-col items-center text-center mt-6">
          <motion.div
            animate={isLockedOut ? { scale: [1, 1.1, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className={`w-20 h-20 rounded-3xl flex items-center justify-center border-2 mb-4 shadow-lg ${
              isLockedOut
                ? 'bg-red-500/10 border-red-500/40 text-red-500 shadow-red-500/10'
                : 'bg-[#FFD700]/5 border-[#FFD700]/30 text-[#FFD700] shadow-[#FFD700]/10'
            }`}
          >
            {isLockedOut ? (
              <AlertTriangle className="w-10 h-10 text-red-500 animate-bounce" />
            ) : (
              <Lock className="w-9 h-9 text-[#FFD700]" />
            )}
          </motion.div>

          <h2 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
            {isLockedOut ? 'MÁY CHỦ BỊ KHÓA' : 'XÁC THỰC MÃ BẢO MẬT'}
          </h2>
          <p className="text-[11px] text-white/40 mt-1 font-mono tracking-wider">
            VINAMAP OUTDOOR MILITARY SECURITY PROTOCOL
          </p>
        </div>

        {/* Pin Dots Visualizer with Shake effect on error */}
        <div className="w-full flex flex-col items-center my-6">
          <motion.div
            animate={shake ? { x: [-10, 10, -10, 10, -5, 5, 0] } : {}}
            transition={{ duration: 0.4 }}
            className="flex items-center justify-center gap-5 h-8 mb-4"
          >
            {Array.from({ length: correctPin.length }).map((_, index) => {
              const isActive = index < enteredPin.length;
              return (
                <div
                  key={index}
                  className={`w-4 h-4 rounded-full border transition-all duration-200 ${
                    isActive
                      ? 'bg-[#FFD700] border-[#FFD700] shadow-[0_0_8px_rgba(255,215,0,0.6)] scale-110'
                      : 'bg-black/40 border-white/20'
                  }`}
                />
              );
            })}
          </motion.div>

          {/* Feedback message */}
          <div className="h-10 text-center px-4">
            <AnimatePresence mode="wait">
              {error ? (
                <motion.p
                  key="error"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className={`text-[11px] leading-relaxed font-bold ${
                    isLockedOut || attempts >= 7 ? 'text-red-400' : 'text-[#FFD700]'
                  }`}
                >
                  {error}
                </motion.p>
              ) : (
                <motion.p
                  key="normal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[11px] text-white/30"
                >
                  {correctPin === '123456' ? (
                    <span className="text-emerald-400 font-bold block animate-pulse">💡 Mã bảo mật mặc định: 123456 (Cấu hình đổi trong tab ĐỒNG BỘ)</span>
                  ) : (
                    'Nhập mã PIN để mở khóa ứng dụng và giải mã dữ liệu ranh giới kiểm lâm'
                  )}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Lockout Timer Overlay if locked out */}
        {isLockedOut && (
          <div className="flex flex-col items-center justify-center bg-red-950/20 border border-red-500/20 rounded-2xl p-5 mb-8 w-full">
            <RefreshCw className="w-6 h-6 text-red-400 animate-spin mb-2" />
            <span className="text-white/60 text-xs">Vui lòng thử lại sau</span>
            <span className="text-2xl font-black text-red-500 font-mono mt-1">{lockoutTimeLeft}s</span>
          </div>
        )}

        {/* Numeric Keypad layout */}
        {!isLockedOut && (
          <div className="grid grid-cols-3 gap-x-6 gap-y-4 max-w-[280px] w-full mb-10">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                onClick={() => handleKeyPress(num)}
                className="w-16 h-16 rounded-full bg-white/5 border border-white/5 hover:border-[#FFD700]/30 text-white font-mono font-bold text-xl flex items-center justify-center transition-all active:scale-90 active:bg-[#FFD700]/10 hover:bg-white/10 cursor-pointer shadow-sm"
              >
                {num}
              </button>
            ))}
            
            {/* Delete/Clear button */}
            <button
              onClick={handleClear}
              className="w-16 h-16 rounded-full text-white/30 hover:text-white flex items-center justify-center text-[11px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
            >
              XÓA
            </button>

            {/* Zero button */}
            <button
              onClick={() => handleKeyPress('0')}
              className="w-16 h-16 rounded-full bg-white/5 border border-white/5 hover:border-[#FFD700]/30 text-white font-mono font-bold text-xl flex items-center justify-center transition-all active:scale-90 active:bg-[#FFD700]/10 hover:bg-white/10 cursor-pointer"
            >
              0
            </button>

            {/* Backspace button */}
            <button
              onClick={handleDelete}
              className="w-16 h-16 rounded-full text-white/30 hover:text-[#FFD700] flex items-center justify-center transition-colors active:scale-90 cursor-pointer"
              title="Xóa chữ số vừa nhập"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Footer info showing security status */}
        <div className="flex items-center gap-1.5 py-1.5 px-3 bg-white/5 border border-white/5 rounded-full mb-4">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] text-white/50 uppercase font-black font-mono tracking-widest">
            {attempts > 0 ? `Nhập sai: ${attempts} / ${MAX_ATTEMPTS_BEFORE_DESTRUCT} lần` : 'BẢO MẬT QUÂN SỰ KHÉP KÍN'}
          </span>
        </div>
      </div>
    </div>
  );
};
