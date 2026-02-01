'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="p-4 rounded-full bg-red-500/10 text-red-500">
              <AlertCircle size={48} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Something went wrong</h2>
            <p className="text-zinc-400">
              We encountered an unexpected error. Our team has been notified.
            </p>
            <div className="flex gap-2 mt-4">
              <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
                <RotateCcw size={16} />
                Reload Page
              </Button>
              <Button
                onClick={() => this.setState({ hasError: false })}
                className="gap-2 bg-white text-black hover:bg-zinc-200"
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
