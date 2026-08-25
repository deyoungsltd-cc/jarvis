'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props { children: ReactNode; label: string }
interface State { hasError: boolean; error: Error | null }

export class TabErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-medium">{this.props.label} failed to load</p>
          <p className="text-xs text-muted-foreground max-w-xs">{this.state.error?.message}</p>
          <Button
            variant="outline" size="sm"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}