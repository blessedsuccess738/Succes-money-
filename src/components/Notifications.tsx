import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { auth } from '../firebase';
import { io } from 'socket.io-client';

const socket = io();

export default function Notifications({ user }: { user: any }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/notifications', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setNotifications(data);
          setUnreadCount(data.filter((n: any) => !n.is_read).length);
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    fetchNotifications();

    if (user.role === 'admin') {
      socket.on('admin_notification', (notif: any) => {
        setNotifications(prev => [notif, ...prev]);
        setUnreadCount(prev => prev + 1);
      });
    } else {
      socket.on('user_notification', (notif: any) => {
        setNotifications(prev => [notif, ...prev]);
        setUnreadCount(prev => prev + 1);
      });
    }

    socket.on('broadcast_notification', (notif: any) => {
      setNotifications(prev => [notif, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    return () => {
      socket.off('admin_notification');
      socket.off('user_notification');
      socket.off('broadcast_notification');
    };
  }, [user]);

  const handleOpen = async () => {
    setIsOpen(!isOpen);
    if (!isOpen && unreadCount > 0) {
      try {
        const token = await auth.currentUser?.getIdToken();
        await fetch('/api/notifications/read', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
        setUnreadCount(0);
      } catch (error) {
        console.error('Failed to mark notifications as read:', error);
      }
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={handleOpen}
        className="relative p-2 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-slate-800"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-slate-900">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <h3 className="font-semibold text-white">Notifications</h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">
                  No notifications yet
                </div>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {notifications.map((notif, idx) => (
                    <div key={idx} className={`p-4 ${!notif.is_read ? 'bg-slate-700/20' : ''} hover:bg-slate-700/40 transition-colors`}>
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-medium text-sm text-white">{notif.title}</h4>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap ml-2">
                          {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{notif.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
