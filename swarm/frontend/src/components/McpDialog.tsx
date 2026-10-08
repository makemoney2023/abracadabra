import { useState } from 'react';
import { Check, Loader2, Plug, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { McpServerConfig } from '@/lib/agents';

interface TestState {
  status: 'idle' | 'testing' | 'ok' | 'error';
  message?: string;
  tools?: { name: string; description?: string }[];
}

export function McpDialog({
  open,
  onOpenChange,
  servers,
  onChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  servers: McpServerConfig[];
  onChange: (servers: McpServerConfig[]) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  const addServer = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    onChange([
      ...servers,
      { id: 'mcp-' + Date.now(), name: name.trim() || new URL(trimmedUrl).hostname, url: trimmedUrl },
    ]);
    setName('');
    setUrl('');
    setTest({ status: 'idle' });
  };

  const testUrl = async (target: string) => {
    setTest({ status: 'testing' });
    try {
      const res = await fetch('/api/mcp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json();
      if (data.ok) {
        setTest({ status: 'ok', tools: data.tools ?? [] });
      } else {
        setTest({ status: 'error', message: data.error || 'Connection failed.' });
      }
    } catch {
      setTest({ status: 'error', message: 'Could not reach the test endpoint.' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg">
        <DialogHeader>
          <DialogTitle>MCP servers</DialogTitle>
          <DialogDescription>
            Connect remote MCP servers (Streamable HTTP). Agents call their tools during runs.
            Nodes use all servers unless restricted per-agent.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-2">
            {servers.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No servers yet. Add one below — or point at this worker's demo server at
                <span className="font-mono"> /demo-mcp/mcp</span> to try the tool loop with zero setup.
              </p>
            )}
            {servers.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border p-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Plug className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{s.name}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">{s.url}</div>
                </div>
                <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => testUrl(s.url)}>
                  Test
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => onChange(servers.filter((x) => x.id !== s.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2 rounded-lg border bg-muted/40 p-3">
            <div className="text-xs font-semibold">Add server</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. demo-tools)" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/mcp  (this worker: /demo-mcp/mcp)"
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={!url.trim() || test.status === 'testing'} onClick={() => testUrl(url.trim())}>
                {test.status === 'testing' ? <Loader2 className="animate-spin" /> : <Check />}
                Test URL
              </Button>
              <Button size="sm" disabled={!url.trim()} onClick={addServer}>
                <Plug />
                Add server
              </Button>
            </div>
            {test.status === 'ok' && (
              <div className="rounded-md border bg-background p-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                  Connected <Badge variant="secondary">{test.tools?.length ?? 0} tools</Badge>
                </div>
                {(test.tools ?? []).slice(0, 8).map((t) => (
                  <div key={t.name} className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {t.name}
                    {t.description ? <span className="font-sans"> — {t.description.slice(0, 80)}</span> : null}
                  </div>
                ))}
              </div>
            )}
            {test.status === 'error' && (
              <p className="text-xs leading-relaxed text-destructive">{test.message}</p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
