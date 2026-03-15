'use client';

import { SignInButton } from '@/components/auth/auth-buttons';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] text-center px-4">
      <h1 className="text-4xl font-bold text-white mb-4">Welcome to Trace</h1>
      <p className="text-gray-400 mb-8">Sign in to start chatting</p>
      
      <SignInButton />
    </div>
  );
}
