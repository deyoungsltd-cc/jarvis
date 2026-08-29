'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getMcpServers,
  createMcpServer,
  deleteMcpServer,
  connectMcpServer,
  disconnectMcpServer,
  getMcpServerTools,
  getMcpStatus,
} from '@/lib/openjarvis-api';
import type {
  McpServer,
  McpServerConfig,
  McpToolInfo,
  McpSystemStatus,
  McpTransportType,
  McpServerStatus,
  RiskLevel,
} from '@/lib/openjarvis-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Loader2,
  Plus,
  Plug,
  Unplug,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Server,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<McpServerStatus, { color: string; icon: typeof CheckCircle2; label: string }> = {
  connected: { color: 'text-emerald-500', icon: CheckCircle2, label: 'Connected' },
  connecting: { color: 'text-amber-500', icon: Loader2, label: 'Connecting' },
  disconnected: { color: 'text-muted-foreground', icon: Server, label: 'Disconnected' },
  error: { color: 'text-red-500', icon: AlertCircle, label: 'Error' },
};

const TRANSPORT_LABELS: Record<McpTransportType, string> = {
  stdio: 'stdio (local process)',
  sse: 'SSE (remote server)',
  'in-process': 'In-Process (built-in)',
};

const RISK_CLASSES: Record<RiskLevel, string> = {
  low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400',
  critical: 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
};

export function McpTab() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [status, setStatus] = useState<McpSystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [serverTools, setServerTools] = useState<Record<string, McpToolInfo[]>>({});
  const [loadingTools, setLoadingTools] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formTransport, setFormTransport] = useState<McpTransportType>('stdio');
  const [formCommand, setFormCommand] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [serverList, sysStatus] = await Promise.all([
        getMcpServers(),
        getMcpStatus(),
      ]);
      setServers(serverList);
      setStatus(sysStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch MCP data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConnect = useCallback(async (id: string) => {
    setConnecting(id);
    try {
      const updated = await connectMcpServer(id);
      setServers((prev) => prev.map((s) => (s.id === id ? updated : s)));
      // Refresh status counts
      const sysStatus = await getMcpStatus();
      setStatus(sysStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setConnecting(null);
    }
  }, []);

  const handleDisconnect = useCallback(async (id: string) => {
    setConnecting(id);
    try {
      await disconnectMcpServer(id);
      setServers((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, status: 'disconnected' as const, toolCount: 0, connectedAt: undefined }
            : s,
        ),
      );
      const sysStatus = await getMcpStatus();
      setStatus(sysStatus);
      setServerTools((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (expandedServer === id) setExpandedServer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setConnecting(null);
    }
  }, [expandedServer]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteMcpServer(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
      setServerTools((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (expandedServer === id) setExpandedServer(null);
      const sysStatus = await getMcpStatus();
      setStatus(sysStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }, [expandedServer]);

  const handleToggleExpand = useCallback(async (id: string) => {
    if (expandedServer === id) {
      setExpandedServer(null);
      return;
    }
    setExpandedServer(id);
    // Load tools for this server if not cached
    if (!serverTools[id]) {
      setLoadingTools(id);
      try {
        const tools = await getMcpServerTools(id);
        setServerTools((prev) => ({ ...prev, [id]: tools }));
      } catch (err) {
        setServerTools((prev) => ({ ...prev, [id]: [] }));
      } finally {
        setLoadingTools(null);
      }
    }
  }, [expandedServer, serverTools]);

  const handleSubmitServer = useCallback(async () => {
    setFormError(null);
    if (!formName.trim()) {
      setFormError('Server name is required');
      return;
    }
    if (formTransport === 'stdio' && !formCommand.trim()) {
      setFormError('stdio transport requires a command');
      return;
    }
    if (formTransport === 'sse' && !formUrl.trim()) {
      setFormError('SSE transport requires a URL');
      return;
    }

    setFormSubmitting(true);
    try {
      const config: McpServerConfig = {
        name: formName.trim(),
        transport: formTransport,
      };
      if (formTransport === 'stdio') {
        config.command = formCommand.trim();
        // Split command into command + args (simple space-based split)
        const parts = formCommand.trim().split(/\s+/);
        if (parts.length > 1) {
          config.command = parts[0];
          config.args = parts.slice(1);
        }
      }
      if (formTransport === 'sse') {
        config.url = formUrl.trim();
      }

      const server = await createMcpServer(config);
      setServers((prev) => [server, ...prev]);
      setDialogOpen(false);
      setFormName('');
      setFormCommand('');
      setFormUrl('');
      setFormTransport('stdio');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create server');
    } finally {
      setFormSubmitting(false);
    }
  }, [formName, formTransport, formCommand, formUrl]);

  // ── Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading MCP servers" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-1 h-full">
      {/* Status Bar */}
      {status && (
        <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-muted/50 border border-border text-xs">
          <div className="flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Servers:</span>
            <span className="font-medium">{status.totalServers}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-muted-foreground">Connected:</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">{status.connected}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Tools:</span>
            <span className="font-medium">{status.totalMcpTools}</span>
          </div>
          {status.error > 0 && (
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-red-600 dark:text-red-400">{status.error} errors</span>
            </div>
          )}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Server List */}
      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Plug className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No MCP servers registered</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Add a server to extend agent capabilities with external tools
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1 max-h-[calc(100vh-20rem)]">
          <div className="flex flex-col gap-2">
            {servers.map((server) => {
              const statusCfg = STATUS_CONFIG[server.status];
              const StatusIcon = statusCfg.icon;
              const isExpanded = expandedServer === server.id;
              const tools = serverTools[server.id] || [];

              return (
                <div
                  key={server.id}
                  className="rounded-lg border border-border overflow-hidden"
                >
                  {/* Server Header Row */}
                  <div className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                    <button
                      onClick={() => handleToggleExpand(server.id)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      aria-label={isExpanded ? `Collapse ${server.name}` : `Expand ${server.name}`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <StatusIcon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          statusCfg.color,
                          server.status === 'connecting' && 'animate-spin',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{server.name}</span>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {server.transport}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px]', statusCfg.color)}
                          >
                            {statusCfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                          <span>{server.toolCount} tool{server.toolCount !== 1 ? 's' : ''}</span>
                          {server.connectedAt && (
                            <span>since {new Date(server.connectedAt).toLocaleTimeString()}</span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      {server.status === 'connected' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDisconnect(server.id)}
                          disabled={connecting === server.id}
                          aria-label={`Disconnect ${server.name}`}
                        >
                          {connecting === server.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Unplug className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleConnect(server.id)}
                          disabled={connecting === server.id || server.status === 'connecting'}
                          aria-label={`Connect ${server.name}`}
                        >
                          {connecting === server.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plug className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(server.id)}
                        aria-label={`Delete ${server.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Server Error */}
                  {server.lastError && (
                    <div className="px-3 pb-2">
                      <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1">
                        {server.lastError}
                      </p>
                    </div>
                  )}

                  {/* Expanded: Tool List */}
                  {isExpanded && (
                    <div className="border-t border-border">
                      {loadingTools === server.id ? (
                        <div className="flex items-center justify-center p-4">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : tools.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-3 text-center">
                          {server.status === 'connected'
                            ? 'This server exposes no tools'
                            : 'Connect to this server to see its tools'}
                        </p>
                      ) : (
                        <div className="flex flex-col">
                          {tools.map((tool) => (
                            <div
                              key={tool.id}
                              className="flex items-start gap-2 px-3 py-2 hover:bg-muted/20 border-b border-border last:border-b-0"
                            >
                              <Wrench className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-mono font-medium truncate">
                                    {tool.mcpName}
                                  </span>
                                  {tool.riskLevel && (
                                    <Badge
                                      variant="outline"
                                      className={cn('text-[9px]', RISK_CLASSES[tool.riskLevel] ?? '')}
                                    >
                                      {tool.riskLevel}
                                    </Badge>
                                  )}
                                </div>
                                {tool.description && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                    {tool.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Add Server Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add MCP Server
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register MCP Server</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {formError && (
              <p className="text-sm text-red-500" role="alert">{formError}</p>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="mcp-name">Server Name</label>
              <Input
                id="mcp-name"
                placeholder="my-mcp-server"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="mcp-transport">Transport</label>
              <Select value={formTransport} onValueChange={(v) => setFormTransport(v as McpTransportType)}>
                <SelectTrigger id="mcp-transport">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio (local process)</SelectItem>
                  <SelectItem value="sse">SSE (remote server)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formTransport === 'stdio' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="mcp-command">
                  Command
                </label>
                <Input
                  id="mcp-command"
                  placeholder="npx @anthropic/mcp-server-filesystem /path"
                  value={formCommand}
                  onChange={(e) => setFormCommand(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  The command and arguments to spawn the MCP server process
                </p>
              </div>
            )}
            {formTransport === 'sse' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="mcp-url">
                  Server URL
                </label>
                <Input
                  id="mcp-url"
                  placeholder="http://localhost:8080/mcp"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  The HTTP URL of the remote MCP SSE endpoint
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitServer} disabled={formSubmitting}>
                {formSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Register
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
