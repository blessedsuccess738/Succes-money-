import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, limit, updateDoc, doc, writeBatch } from 'firebase/firestore';

export default function Notifications({ user }: { user: any }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    let q;
    if (user.role === 'admin') {
      q = query(
        collection(db, 'notifications'),
        where('type', 'in', ['admin', 'broadcast']),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    } else {
      q = query(
        collection(db, 'notifications'),
        where('type', 'in', ['user', 'broadcast']),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((n: any) => n.type === 'broadcast' || n.userId === user.uid || user.role === 'admin');
      
      setNotifications(notifs);
      setUnreadCount(notifs.filter((n: any) => !n.isRead).length);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'notifications');
    });

    return () => unsubscribe();
  }, [user]);

  const handleOpen = async () => {
    setIsOpen(!isOpen);
    if (!isOpen && unreadCount > 0) {
      // Mark all as read
      const batch = writeBatch(db);
      notifications.forEach(notif => {
        if (!notif.isRead) {
          batch.update(doc(db, 'notifications', notif.id), { isRead: true });
        }
      });
      try {
        await batch.commit();
        setUnreadCount(0);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'notifications');
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
                    <div key={idx} className={`p-4 ${!notif.isRead ? 'bg-slate-700/20' : ''} hover:bg-slate-700/40 transition-colors`}>
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-medium text-sm text-white">{notif.title}</h4>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap ml-2">
                          {notif.createdAt?.toDate ? notif.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
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
