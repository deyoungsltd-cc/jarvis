'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronUp,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  getPendingApprovals,
  getApprovals,
  approveRequest,
  rejectRequest,
  cancelRequest,
  getApprovalStats,
} from '@/lib/openjarvis-api';
import type { ApprovalRequest, ApprovalStats, ApprovalStatus } from '@/lib/openjarvis-types';
import { cn } from '@/lib/utils';

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const STATUS_ICONS: Record<ApprovalStatus, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-yellow-500" />,
  approved: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  rejected: <XCircle className="w-4 h-4 text-red-500" />,
  expired: <Ban className="w-4 h-4 text-gray-500" />,
  cancelled: <Ban className="w-4 h-4 text-gray-500" />,
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function ApprovalCard({
  request,
  onApprove,
  onReject,
  onCancel,
}: {
  request: ApprovalRequest;
  onApprove: (id: string) => void;
  onReject: (id: string, response?: string) => void;
  onCancel: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejectResponse, setRejectResponse] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const isPending = request.status === 'pending';

  return (
    <div className={cn(
      'rounded-lg border p-4 transition-colors',
      isPending
        ? 'border-yellow-500/30 bg-yellow-500/5'
        : request.status === 'approved'
          ? 'border-green-500/20 bg-green-500/5'
          : 'border-border bg-card/50',
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {STATUS_ICONS[request.status]}
            <span className="font-mono text-sm font-medium truncate">{request.toolName}</span>
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded border',
              RISK_COLORS[request.riskLevel] || RISK_COLORS.medium,
            )}>
              {request.riskLevel}
            </span>
          </div>

          {request.reason && (
            <p className="text-sm text-muted-foreground mb-1">{request.reason}</p>
          )}

          {request.capability && (
            <p className="text-xs text-muted-foreground">
              Capability: <span className="font-mono">{request.capability}</span>
            </p>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>Created {timeAgo(request.createdAt)}</span>
            {request.expiresAt && isPending && (
              <span className="text-yellow-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Expires {timeAgo(request.expiresAt)}
              </span>
            )}
            {request.resolvedBy && (
              <span>By {request.resolvedBy}</span>
            )}
          </div>

          {request.response && (
            <div className="mt-2 text-sm bg-muted/50 rounded px-3 py-2">
              {request.response}
            </div>
          )}

          {request.toolInput && Object.keys(request.toolInput).length > 0 && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Tool Input
              </button>
              {expanded && (
                <pre className="mt-1 text-xs bg-muted/50 rounded px-3 py-2 overflow-x-auto max-h-40">
                  {JSON.stringify(request.toolInput, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>

        {isPending && (
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={() => onApprove(request.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve
            </button>
            {!showRejectInput ? (
              <button
                onClick={() => setShowRejectInput(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
            ) : (
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  placeholder="Reason (optional)"
                  value={rejectResponse}
                  onChange={(e) => setRejectResponse(e.target.value)}
                  className="w-36 px-2 py-1 text-xs rounded border bg-background"
                  autoFocus
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      onReject(request.id, rejectResponse || undefined);
                      setShowRejectInput(false);
                      setRejectResponse('');
                    }}
                    className="flex-1 px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => {
                      setShowRejectInput(false);
                      setRejectResponse('');
                    }}
                    className="px-2 py-1 rounded border text-xs hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={() => onCancel(request.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border hover:bg-muted text-sm transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ApprovalQueue() {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [history, setHistory] = useState<ApprovalRequest[]>([]);
  const [stats, setStats] = useState<ApprovalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      const result = await getPendingApprovals();
      setPending(result.items);
    } catch (err) {
      console.error('Failed to fetch pending approvals:', err);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const result = await getApprovals({ status: 'rejected', limit: 20 });
      const approvedResult = await getApprovals({ status: 'approved', limit: 20 });
      setHistory([...approvedResult.items, ...result.items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ));
    } catch (err) {
      console.error('Failed to fetch approval history:', err);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const s = await getApprovalStats();
      setStats(s);
    } catch (err) {
      console.error('Failed to fetch approval stats:', err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchPending(), fetchHistory(), fetchStats()]);
    setLoading(false);
  }, [fetchPending, fetchHistory, fetchStats]);

  useEffect(() => {
    fetchData();
    // Poll every 5 seconds for pending approvals
    const interval = setInterval(fetchPending, 5000);
    return () => clearInterval(interval);
  }, [fetchData, fetchPending]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await approveRequest(id);
      await fetchPending();
    } catch (err) {
      console.error('Failed to approve:', err);
    }
    setActionLoading(null);
  };

  const handleReject = async (id: string, response?: string) => {
    setActionLoading(id);
    try {
      await rejectRequest(id, response);
      await fetchPending();
    } catch (err) {
      console.error('Failed to reject:', err);
    }
    setActionLoading(null);
  };

  const handleCancel = async (id: string) => {
    setActionLoading(id);
    try {
      await cancelRequest(id);
      await fetchPending();
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
    setActionLoading(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-yellow-500" />
          <h3 className="text-lg font-semibold">Approval Queue</h3>
          {stats && stats.pending > 0 && (
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-500 text-white text-xs font-bold">
              {stats.pending}
            </span>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {([
            { label: 'Pending', value: stats.pending, color: 'text-yellow-500' },
            { label: 'Approved', value: stats.approved, color: 'text-green-500' },
            { label: 'Rejected', value: stats.rejected, color: 'text-red-500' },
            { label: 'Expired', value: stats.expired, color: 'text-gray-500' },
          ] as const).map((stat) => (
            <div key={stat.label} className="text-center px-3 py-2 rounded-md bg-muted/50">
              <div className={cn('text-xl font-bold', stat.color)}>{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('pending')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'pending'
              ? 'border-yellow-500 text-yellow-500'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          Pending {pending.length > 0 && `(${pending.length})`}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'history'
              ? 'border-yellow-500 text-yellow-500'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          History
        </button>
      </div>

      {/* Content */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Zap className="w-4 h-4 mr-2 animate-pulse" />
            Loading...
          </div>
        ) : activeTab === 'pending' ? (
          pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Shield className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No pending approval requests</p>
            </div>
          ) : (
            pending.map((req) => (
              <ApprovalCard
                key={req.id}
                request={req}
                onApprove={handleApprove}
                onReject={handleReject}
                onCancel={handleCancel}
              />
            ))
          )
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No approval history</p>
          </div>
        ) : (
          history.map((req) => (
            <ApprovalCard
              key={req.id}
              request={req}
              onApprove={handleApprove}
              onReject={handleReject}
              onCancel={handleCancel}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** Compact approval badge for the tab bar — shows pending count */
export function ApprovalBadge({
  pendingCount,
  onClick,
}: {
  pendingCount: number;
  onClick: () => void;
}) {
  if (pendingCount === 0) return null;

  return (
    <button
      onClick={onClick}
      className="relative p-2 rounded-md hover:bg-muted transition-colors"
      title={`${pendingCount} pending approval(s)`}
    >
      <AlertTriangle className="w-5 h-5 text-yellow-500" />
      <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse">
        {pendingCount > 9 ? '9+' : pendingCount}
      </span>
    </button>
  );
}
