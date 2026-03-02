'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AllyLogo } from '@/components/ui/ally-logo';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

function PairContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired'>('loading');
  const [systemName, setSystemName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No pairing token provided');
      return;
    }
    claimToken(token);
  }, [token]);

  const claimToken = async (t: string) => {
    try {
      const checkRes = await fetch(`/api/link?token=${t}`);
      const checkData = await checkRes.json();

      if (!checkRes.ok) {
        if (checkRes.status === 410) { setStatus('expired'); return; }
        setStatus('error');
        setError(checkData.error || 'Token not found');
        return;
      }

      if (checkData.status === 'claimed') {
        setSystemName(checkData.systemName || 'Ally');
        setStatus('success');
        localStorage.setItem('ally-paired-user-id', checkData.userId);
        localStorage.setItem('ally-paired-system', checkData.systemId);
        setTimeout(() => { window.location.href = '/app/index.html'; }, 2000);
        return;
      }

      setSystemName(checkData.systemName || 'Ally');

      const claimRes = await fetch('/api/link', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      });

      if (!claimRes.ok) {
        const claimData = await claimRes.json();
        if (claimRes.status === 410) { setStatus('expired'); return; }
        setStatus('error');
        setError(claimData.error || 'Failed to pair');
        return;
      }

      const claimData = await claimRes.json();
      localStorage.setItem('ally-paired-user-id', claimData.userId);
      localStorage.setItem('ally-paired-system', claimData.systemId);
      setStatus('success');
      setTimeout(() => { window.location.href = '/app/index.html'; }, 2000);
    } catch {
      setStatus('error');
      setError('Network error - check your connection');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-4">
      <div className="text-center max-w-sm">
        <AllyLogo size="lg" className="mx-auto mb-6" />

        {status === 'loading' && (
          <div>
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-lg font-medium">Pairing with {systemName || 'Ally'}...</p>
            <p className="text-sm text-gray-500 mt-2">Connecting your device</p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-xl font-bold text-green-500">Paired Successfully</p>
            <p className="text-sm text-gray-500 mt-2">
              Connected to {systemName}. Redirecting...
            </p>
          </div>
        )}

        {status === 'expired' && (
          <div>
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xl font-bold text-amber-500">Token Expired</p>
            <p className="text-sm text-gray-500 mt-2">
              Generate a new QR code from your desktop Ally and scan again.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-xl font-bold text-red-500">Pairing Failed</p>
            <p className="text-sm text-gray-500 mt-2">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PairPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <LoadingSpinner size="lg" />
      </div>
    }>
      <PairContent />
    </Suspense>
  );
}
