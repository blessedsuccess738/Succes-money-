import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, MousePointer2, Key } from 'lucide-react';
import { io } from 'socket.io-client';

const socket = io();

interface UserRemoteBrowserProps {
  token: string;
  userId: string;
}

export default function UserRemoteBrowser({ token, userId }: UserRemoteBrowserProps) {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [show2FA, setShow2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchScreenshot = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/user/bot/screenshot', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setScreenshot(data.image);
      }
    } catch (err) {
      console.error('Failed to fetch screenshot', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScreenshot();
    
    socket.on('browser_update', (data) => {
      if (data.userId === userId) {
        setScreenshot(data.screenshot);
      }
    });

    socket.on('require_2fa', (data) => {
      if (data.userId === userId) {
        setShow2FA(true);
      }
    });

    let interval: any;
    if (autoRefresh) {
      interval = setInterval(fetchScreenshot, 5000); // Slower polling if socket is active
    }

    return () => {
      socket.off('browser_update');
      socket.off('require_2fa');
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, userId, token]);

  const handleInteraction = async (action: any) => {
    try {
      await fetch('/api/user/bot/interact', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action })
      });
    } catch (err) {
      console.error('Interaction failed', err);
    }
  };

  const handleSubmit2FA = async () => {
    if (twoFACode.length >= 4) {
      try {
        const res = await fetch('/api/user/bot/submit-2fa', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ code: twoFACode })
        });
        const data = await res.json();
        if (data.success) {
          setShow2FA(false);
          setTwoFACode('');
        }
      } catch (err) {
        console.error('2FA submission failed', err);
      }
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1920;
    const y = ((e.clientY - rect.top) / rect.height) * 1080;
    
    handleInteraction({ type: 'click', x, y });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleInteraction({ type: 'type', text: '\n' });
    } else if (e.key.length === 1) {
      handleInteraction({ type: 'type', text: e.key });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
      <div className="bg-slate-800 p-3 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <MousePointer2 className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-medium text-slate-300">Live Broker View</span>
          </div>
          <button 
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs px-2 py-1 rounded ${autoRefresh ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700 text-slate-500'}`}
          >
            Auto-Refresh: {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchScreenshot}
            disabled={loading}
            className="p-1.5 hover:bg-slate-700 rounded-md transition-colors text-slate-400"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div 
        ref={containerRef}
        onClick={handleCanvasClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className="flex-1 bg-black relative cursor-crosshair outline-none overflow-hidden group"
      >
        {show2FA && (
          <div className="absolute inset-0 z-20 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
            <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-4 border border-amber-500/30">
              <Key className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">2FA Required</h3>
            <p className="text-xs text-slate-400 mb-4 max-w-[200px]">
              The remote browser is waiting for a verification code.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-[200px]">
              <input
                type="text"
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value)}
                placeholder="Code"
                className="bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-center text-xl font-mono tracking-widest focus:outline-none focus:border-indigo-500 text-white"
                maxLength={6}
              />
              <button
                onClick={handleSubmit2FA}
                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 rounded-lg text-sm transition-all"
              >
                Submit Code
              </button>
            </div>
          </div>
        )}

        {screenshot ? (
          <img 
            src={screenshot} 
            alt="Remote Browser" 
            className="w-full h-full object-contain pointer-events-none"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-600">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin opacity-20" />
              <p className="text-sm">Connecting to live session...</p>
            </div>
          </div>
        )}
        
        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 backdrop-blur-md p-2 rounded-lg border border-white/10 text-[10px] text-slate-400 pointer-events-none">
          Click to interact • Type to input
        </div>
      </div>
    </div>
  );
}
