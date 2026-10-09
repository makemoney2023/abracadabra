import type { ClientThread } from "@/db/conversations";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThreadReplyForm } from "../thread-forms";

export function ThreadsTab({
  organizationId,
  threads,
}: {
  organizationId: string;
  threads: ClientThread[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversations</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {threads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No client messages yet.</p>
        ) : (
          threads.map((thread) => (
            <section key={thread.id} className="flex flex-col gap-2">
              <p className="text-sm">
                <Badge variant="secondary">{thread.channel}</Badge>
                <span className="ml-2 text-muted-foreground">{thread.state}</span>
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {thread.messages.map((message) => (
                  <li key={message.id}>
                    <span className="text-muted-foreground">
                      {message.actorKind === "staff" ? "You" : message.kind}
                    </span>
                    {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : null}
                  </li>
                ))}
              </ul>
              <ThreadReplyForm
                organizationId={organizationId}
                threadId={thread.thread_id}
                channel={thread.channel}
                sender={thread.sender}
              />
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}
