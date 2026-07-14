import React, { useState } from 'react';
import { Bot, Send, Loader2, WifiOff, AlertTriangle } from 'lucide-react';

interface AIAssistantProps {
  onAnalyzeData?: (query: string) => Promise<string>;
  addToast: (message: string, type: 'success' | 'warning' | 'error' | 'info') => void;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ addToast }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([
    { role: 'ai', content: 'Chào bạn! Tôi là Trợ lý AI của VinaMap. Tôi có thể giúp bạn phân tích lộ trình tuần tra, đánh giá nguy cơ cháy rừng hoặc giải đáp các thắc mắc về thực địa. Bạn cần hỗ trợ gì?' }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    // OFFLINE CHECK
    if (!navigator.onLine) {
      addToast('Tính năng AI yêu cầu kết nối mạng để xử lý dữ liệu.', 'error');
      setMessages(prev => [...prev, 
        { role: 'user', content: input },
        { role: 'ai', content: '⚠️ Lỗi: Không có kết nối internet. Vui lòng kết nối mạng để sử dụng trợ lý AI.' }
      ]);
      setInput('');
      return;
    }

    const userMessage = input;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setIsLoading(true);

    try {
      // Simulate AI call for now or integrate with Gemini API
      // Since GEMINI_API_KEY is not configured yet in this example, we show the try/catch logic
      const response = await simulateAICall(userMessage);
      setMessages(prev => [...prev, { role: 'ai', content: response }]);
    } catch (err) {
      console.error('AI Error:', err);
      addToast('Lỗi hệ thống AI. Vui lòng thử lại sau.', 'error');
      setMessages(prev => [...prev, { role: 'ai', content: '❌ Rất tiếc, đã có lỗi xảy ra khi xử lý yêu cầu của bạn.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <div className="w-10 h-10 rounded-xl bg-[#FFD700] flex items-center justify-center">
          <Bot className="w-6 h-6 text-black" />
        </div>
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Trợ Lý AI Thực Địa</h3>
          <p className="text-[10px] text-white/40 font-bold">Phân tích & Hỗ trợ tuần tra rừng</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-[300px]">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
              m.role === 'user' 
                ? 'bg-[#FFD700] text-black font-bold rounded-tr-none' 
                : 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-none'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-[#FFD700] animate-spin" />
              <span className="text-[10px] text-white/40 font-bold uppercase animate-pulse">Đang suy nghĩ...</span>
            </div>
          </div>
        )}
      </div>

      <div className="relative mt-auto">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder={navigator.onLine ? "Nhập câu hỏi cho AI..." : "Mất kết nối mạng - AI Offline"}
          disabled={isLoading || !navigator.onLine}
          className={`w-full h-12 bg-black border border-white/10 rounded-xl px-4 pr-12 text-xs font-bold text-white outline-none focus:border-[#FFD700] transition-all ${
            !navigator.onLine ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim() || !navigator.onLine}
          className="absolute right-2 top-1.5 w-9 h-9 bg-[#FFD700] rounded-lg flex items-center justify-center text-black hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {!navigator.onLine && (
        <div className="flex items-center gap-2 text-[10px] text-amber-400 font-bold bg-amber-400/10 p-2 rounded-lg border border-amber-400/20">
          <WifiOff className="w-3.5 h-3.5" />
          TÍNH NĂNG AI YÊU CẦU MẠNG INTERNET
        </div>
      )}
    </div>
  );
};

// SIMULATED AI RESPONSE FOR DEMONSTRATION
async function simulateAICall(query: string): Promise<string> {
  await new Promise(r => setTimeout(r, 1500));
  
  const q = query.toLowerCase();
  if (q.includes('cháy')) {
    return 'Dựa trên dữ liệu hiện tại, khu vực bạn đang đứng có độ ẩm thấp (35%) và nhiệt độ cao (32°C). Nguy cơ cháy rừng đang ở cấp IV (Cấp Nguy Hiểm). Vui lòng tăng cường tuần tra tại các khu vực rừng khộp và rừng thông.';
  }
  if (q.includes('tracklog') || q.includes('lộ trình')) {
    return 'Lộ trình tuần tra của bạn đã ghi nhận được 5.2km. Tốc độ di chuyển trung bình 2.4km/h là phù hợp với địa hình dốc. Bạn đã đi qua 3 điểm kiểm soát ranh giới.';
  }
  return 'Tôi đã nhận được yêu cầu của bạn. Tôi có thể hỗ trợ phân tích dữ liệu thực địa chuyên sâu nếu bạn cung cấp thêm thông tin cụ thể về tọa độ hoặc loại rừng.';
}
