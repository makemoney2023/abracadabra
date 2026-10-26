"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SeriesPoint } from "@/lib/search/report";

const config = {
  clicks: { label: "Clicks", color: "var(--primary)" },
  impressions: { label: "Impressions", color: "#1f8ea3" },
} satisfies ChartConfig;

function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Clicks (left axis) and impressions (right axis) per day. Impressions run far higher, so each gets its own scale. */
export function SearchChart({ series }: { series: SeriesPoint[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <LineChart data={series} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={shortDay} />
        <YAxis yAxisId="clicks" tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <YAxis yAxisId="impressions" orientation="right" tickLine={false} axisLine={false} width={48} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => shortDay(String(value))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line yAxisId="clicks" dataKey="clicks" type="monotone" stroke="var(--color-clicks)" strokeWidth={2} dot={false} />
        <Line
          yAxisId="impressions"
          dataKey="impressions"
          type="monotone"
          stroke="var(--color-impressions)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
