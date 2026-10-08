import {
  Boxes,
  BrainCircuit,
  Database,
  Globe,
  Radio,
  Sparkles,
  Workflow,
  Wrench,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const PRIMITIVES = [
  {
    icon: Globe,
    name: 'Workers',
    role: 'API routing + static hosting glue',
    detail:
      'The Worker entry (src/index.ts) routes /api/* to the Durable Object and serves the Vite + shadcn UI through the ASSETS binding.',
  },
  {
    icon: Database,
    name: 'Durable Objects',
    role: 'Stateful swarm coordinator',
    detail:
      'WorkflowDO (src/do/WorkflowDO.ts) persists workflows, runs the topological execution engine, fans out WebSocket events, and keeps agent memory and artifacts.',
  },
  {
    icon: Sparkles,
    name: 'Workers AI',
    role: 'One model call per agent node',
    detail:
      'Llama 3.1 8B FP8 primary with GLM-4.7-Flash and Llama 3.2 3B fallbacks (src/ai/agents.ts). Tokens stream back live over WebSockets.',
  },
  {
    icon: Radio,
    name: 'WebSockets',
    role: 'Live execution streaming',
    detail:
      'Every node start, token batch, completion, and error is pushed to the browser in real time — the canvas lights up as the swarm thinks.',
  },
  {
    icon: Boxes,
    name: 'R2',
    role: 'Artifact + report backup',
    detail:
      'Execution artifacts are stored as JSON and finalized PDF reports as objects, so nothing is lost if the Durable Object restarts.',
  },
  {
    icon: Workflow,
    name: 'Static Assets',
    role: 'Edge-hosted frontend',
    detail:
      'The React Flow canvas and shadcn UI are built with Vite and served from Cloudflare’s edge next to the Worker.',
  },
];

const STEPS = [
  {
    icon: Wrench,
    title: '1 · Compose',
    text: 'Drag agents onto the canvas and connect them. Each node carries its own role instructions; edges define the data flow.',
  },
  {
    icon: BrainCircuit,
    title: '2 · Execute',
    text: 'Nodes run in topological order — parallel branches run concurrently. Each agent loops Reason → Act → Observe, remembers past runs, and streams tokens live.',
  },
  {
    icon: Boxes,
    title: '3 · Export',
    text: 'Outputs land in the artifact panel, persist to R2, and compile into a finalized PDF report with timings and provenance.',
  },
];

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle>How this app is built</DialogTitle>
          <DialogDescription>
            A visual multi-agent orchestrator running entirely on Cloudflare’s developer platform.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-2">
            {STEPS.map((s) => (
              <div key={s.title} className="flex gap-3 rounded-lg border bg-muted/40 p-3">
                <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-semibold">{s.title}</div>
                  <div className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{s.text}</div>
                </div>
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-sm font-semibold">Cloudflare primitives</h4>
            <Badge variant="secondary">6</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRIMITIVES.map((p) => (
              <div key={p.name} className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <p.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-[13px] font-semibold leading-none">{p.name}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{p.role}</div>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{p.detail}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
