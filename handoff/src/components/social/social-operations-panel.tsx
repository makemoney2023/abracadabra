"use client";

import * as React from "react";
import Link from "next/link";
import { operationsView, type AttentionRow, type OperationsPost } from "./social-operations";

export type OperationsCard = OperationsPost & {
  deliverableId: string;
  itemId: string;
  accountId: string;
  collection: string;
};

/** Attention first. New queue labels open a plan review. They do not move or cancel a post. */
export function SocialOperationsPanel({ attention, posts }: { attention: AttentionRow[]; posts: OperationsCard[] }) {
  const [account, setAccount] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [collection, setCollection] = React.useState("");
  const [status, setStatus] = React.useState("");
  const filtered = posts.filter((post) => {
    if (account && post.accountId !== account) return false;
    if (platform && post.platform !== platform) return false;
    if (collection && post.collection !== collection) return false;
    if (status && post.state !== status) return false;
    return true;
  });
  const wide = operationsView({ narrow: false, attention, posts: filtered });
  const narrow = operationsView({ narrow: true, attention, posts: filtered });
  const accounts = [...new Set(posts.map((post) => post.accountId).filter(Boolean))];
  const platforms = [...new Set(posts.map((post) => post.platform).filter(Boolean))];
  const collections = [...new Set(posts.map((post) => post.collection).filter(Boolean))];
  const statuses = [...new Set(posts.map((post) => post.state).filter(Boolean))];
  return (
    <section id="attention" className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">Needs attention</h3>
      {wide.recoveries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing needs attention.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {wide.recoveries.map((item) => (
            <li key={item.id}>
              {item.action === "connect" ? "Connect" : item.action === "retry" ? "Retry" : "Review"} · opens a plan review
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        <Filter label="Account" value={account} options={accounts} onChange={setAccount} />
        <Filter label="Platform" value={platform} options={platforms} onChange={setPlatform} />
        <Filter label="Collection" value={collection} options={collections} onChange={setCollection} />
        <Filter label="Status" value={status} options={statuses} onChange={setStatus} />
      </div>
      <div className="hidden flex-col gap-3 sm:flex">
        <p className="text-sm text-muted-foreground">Week</p>
        <CardList cards={wide.cards as (OperationsCard & { localTime: string })[]} />
      </div>
      <div className="flex flex-col gap-3 sm:hidden">
        <p className="text-sm text-muted-foreground">Agenda</p>
        <CardList cards={narrow.cards as (OperationsCard & { localTime: string })[]} />
      </div>
      <ul className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        {wide.queueActions.map((action) => (
          <li key={action.action}>
            {action.action} opens a plan review
          </li>
        ))}
      </ul>
    </section>
  );
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      {label}
      <select className="h-8 rounded-md border border-input bg-transparent px-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function CardList({ cards }: { cards: (OperationsCard & { localTime: string })[] }) {
  if (cards.length === 0) return <p className="text-sm text-muted-foreground">No posts in this view.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {cards.map((card) => (
        <li key={card.id} className="flex items-center gap-3 text-sm">
          {card.deliverableId && card.itemId ? (
            // The picture is served only when this caller can see the space.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-10 w-10 rounded-md object-cover"
              src={`/api/deliverables/${card.deliverableId}/items/${card.itemId}/media/${card.thumbnailRole || "main"}`}
            />
          ) : null}
          <span className="text-muted-foreground">{card.platform || "Post"}</span>
          <Link className="font-medium underline" href={`/deliverables/${card.deliverableId}`}>
            {card.title}
          </Link>
          <span>{card.state}</span>
          <span className="tabular-nums text-muted-foreground">{card.localTime}</span>
        </li>
      ))}
    </ul>
  );
}
