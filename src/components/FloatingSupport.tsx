import { useState, useEffect } from 'react';
import { MessageCircle, Mail, MessageSquarePlus, Send } from 'lucide-react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export default function FloatingSupport() {
  const [links, setLinks] = useState({
    telegram: 'https://t.me/your_telegram_channel',
    email: 'mailto:support@yourdomain.com',
    whatsapp: 'https://wa.me/1234567890',
    whatsappBusiness: 'https://wa.me/1234567890?text=I%20need%20an%20Access%20Code'
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'platform'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLinks({
          telegram: data.telegram || 'https://t.me/your_telegram_channel',
          email: data.email || 'mailto:support@yourdomain.com',
          whatsapp: data.whatsapp || 'https://wa.me/1234567890',
          whatsappBusiness: data.whatsappBusiness || 'https://wa.me/1234567890?text=I%20need%20an%20Access%20Code'
        });
      }
    });
    return () => unsub();
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      {/* Telegram */}
      <a 
        href={links.telegram} 
        target="_blank" 
        rel="noopener noreferrer"
        className="w-12 h-12 bg-[#0088cc] hover:bg-[#0077b3] text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform cursor-pointer group relative"
      >
        <Send className="w-6 h-6 -ml-1" />
        <span className="absolute right-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Join Telegram
        </span>
      </a>

      {/* Email */}
      <a 
        href={links.email} 
        className="w-12 h-12 bg-slate-700 hover:bg-slate-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform cursor-pointer group relative"
      >
        <Mail className="w-6 h-6" />
        <span className="absolute right-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Email Support
        </span>
      </a>

      {/* Normal WhatsApp */}
      <a 
        href={links.whatsapp} 
        target="_blank" 
        rel="noopener noreferrer"
        className="w-12 h-12 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform cursor-pointer group relative"
      >
        <MessageCircle className="w-6 h-6" />
        <span className="absolute right-14 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          WhatsApp Channel
        </span>
      </a>

      {/* WhatsApp Business (Admin) */}
      <a 
        href={links.whatsappBusiness} 
        target="_blank" 
        rel="noopener noreferrer"
        className="w-14 h-14 bg-[#128C7E] hover:bg-[#075E54] text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform cursor-pointer group relative border-2 border-white/20"
      >
        <div className="relative">
          <MessageSquarePlus className="w-7 h-7" />
          <span className="absolute -top-1 -right-2 bg-rose-500 text-white text-[10px] font-bold px-1.5 rounded-full border border-white">
            VIP
          </span>
        </div>
        <span className="absolute right-16 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Message Admin
        </span>
      </a>
    </div>
  );
}
