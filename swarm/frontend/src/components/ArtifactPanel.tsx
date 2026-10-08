import { useState } from 'react';
import { Check, Copy, FileDown, PackageOpen, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Artifact } from '@/lib/agents';
import { cn } from '@/lib/utils';

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="cursor-pointer transition-colors hover:border-primary/50" onClick={() => setExpanded((v) => !v)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2">
        <CardTitle className="text-[13px]">{artifact.nodeName}</CardTitle>
        <span className="text-[10px] text-muted-foreground">
          {new Date(artifact.timestamp).toLocaleTimeString()}
        </span>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0">
        <p
          className={cn(
            'whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground',
            !expanded && 'line-clamp-3 overflow-hidden',
          )}
        >
          {artifact.content}
        </p>
        {expanded && (
          <Button size="sm" variant="secondary" className="h-7 text-[11px]" onClick={copy}>
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy to clipboard'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function ArtifactPanel({
  artifacts,
  executionId,
  onClose,
}: {
  artifacts: Artifact[];
  executionId: string | null;
  onClose: () => void;
}) {
  return (
    <Card className="absolute bottom-0 right-0 top-0 z-20 flex w-[360px] flex-col rounded-none border-y-0 border-r-0">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b p-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">Artifacts</CardTitle>
          <Badge variant="secondary">{artifacts.length}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={!executionId}
            title={executionId ? 'Download a finalized PDF report' : 'Run a workflow first'}
            onClick={() => {
              if (executionId) window.open('/api/report?executionId=' + executionId, '_blank');
            }}
          >
            <FileDown />
            PDF
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X />
          </Button>
        </div>
      </CardHeader>
      {artifacts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <PackageOpen className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No artifacts yet. Run a workflow to see outputs.
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-2.5 p-3">
            {artifacts.map((art) => (
              <ArtifactCard key={art.id} artifact={art} />
            ))}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
}
