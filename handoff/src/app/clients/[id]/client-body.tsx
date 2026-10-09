import type { ClientThread } from "@/db/conversations";
import type {
  ActivityRow,
  AssessmentView,
  BoardActivity,
  BoardCard,
  Contact,
  DealCard,
  LinkedRepo,
  Organization,
  ProjectRow,
  TaskRow,
  WorkspaceLink,
} from "@/db/crm";
import type { SchemaLeadView } from "@/lib/schema-report";
import type { SwarmRunRow } from "@/lib/swarm-runs";
import { ActivityTab } from "./activity-tab";
import { FilesTab } from "./files-tab";
import { OverviewTab } from "./overview-tab";
import { ReposTab, repoProjects } from "./repos-tab";
import { SettingsTab } from "./settings-tab";
import { ThreadsTab } from "./threads-tab";
import { WorkTab } from "./work-tab";
import type { ClientTabId } from "./tabs";

export function ClientBody({
  tab,
  page,
  client,
  contacts,
  tasks,
  cards,
  activity,
  now,
  projectId,
  runCap,
  runsOpen,
  opens,
  timeline,
  linked,
  free,
  repos,
  deals,
  projects,
  unassignedRuns,
  threads,
  readiness,
  schema,
  choices,
  others,
  githubConnected,
  githubFailed,
}: {
  tab: ClientTabId;
  page: number;
  client: Organization;
  contacts: Contact[];
  tasks: TaskRow[];
  cards: BoardCard[];
  activity: BoardActivity[];
  now: number;
  projectId: string;
  runCap: number | null;
  runsOpen: number;
  opens: { projectId: string | null; open: number }[];
  timeline: ActivityRow[];
  linked: WorkspaceLink[];
  free: WorkspaceLink[];
  repos: LinkedRepo[];
  deals: DealCard[];
  projects: ProjectRow[];
  unassignedRuns: SwarmRunRow[];
  threads: ClientThread[];
  readiness: AssessmentView | null;
  schema: SchemaLeadView | null;
  choices: { id: number; fullName: string }[];
  others: { id: string; name: string }[];
  githubConnected: boolean;
  githubFailed: boolean;
}) {
  if (tab === "work") {
    return (
      <WorkTab
        organizationId={client.id}
        projects={projects}
        cards={cards}
        activity={activity}
        now={now}
        projectId={projectId}
        runCap={runCap}
        runsOpen={runsOpen}
        opens={opens}
        unassignedRuns={unassignedRuns}
      />
    );
  }
  if (tab === "threads") return <ThreadsTab organizationId={client.id} threads={threads} />;
  if (tab === "files") return <FilesTab organizationId={client.id} linked={linked} free={free} />;
  if (tab === "repos") {
    return (
      <ReposTab
        organizationId={client.id}
        repos={repos}
        projects={repoProjects(projects)}
        githubConnected={githubConnected}
        githubFailed={githubFailed}
        choices={choices}
      />
    );
  }
  if (tab === "activity") return <ActivityTab organizationId={client.id} timeline={timeline} page={page} />;
  if (tab === "settings") return <SettingsTab keepId={client.id} others={others} />;
  return (
    <OverviewTab
      client={client}
      contacts={contacts}
      tasks={tasks}
      timeline={timeline}
      linked={linked}
      repos={repos}
      projects={projects}
      deals={deals}
      readiness={readiness}
      schema={schema}
    />
  );
}
