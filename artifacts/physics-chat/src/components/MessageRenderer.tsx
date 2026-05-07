import { InlineMath, BlockMath } from "react-katex";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ChartData {
  type: "line" | "bar" | "scatter";
  title?: string;
  xLabel?: string;
  yLabel?: string;
  series: Array<{
    name: string;
    data: Array<{ x: number; y: number }>;
  }>;
}

interface TableData {
  headers: string[];
  rows: (string | number)[][];
}

const CHART_COLORS = [
  "#22d3ee", // cyan
  "#f59e0b", // amber
  "#34d399", // green
  "#a78bfa", // purple
  "#fb7185", // rose
];

function ChartRenderer({ jsonStr }: { jsonStr: string }) {
  let data: ChartData;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return <div className="text-destructive text-sm">Invalid chart data</div>;
  }

  // Merge all series into unified data points keyed by x
  const allX = new Set<number>();
  for (const s of data.series) {
    for (const pt of s.data) allX.add(pt.x);
  }
  const sortedX = [...allX].sort((a, b) => a - b);
  const merged = sortedX.map((x) => {
    const row: Record<string, number> = { x };
    for (const s of data.series) {
      const pt = s.data.find((d) => d.x === x);
      if (pt !== undefined) row[s.name] = pt.y;
    }
    return row;
  });

  const ChartComp = data.type === "bar" ? BarChart : LineChart;
  const DataComp = data.type === "bar" ? Bar : Line;

  return (
    <div className="mt-3 mb-2 rounded-lg border border-border bg-card/60 p-4" data-testid="chart-container">
      {data.title && (
        <div className="text-sm font-semibold text-foreground/80 mb-3 text-center tracking-wide">
          {data.title}
        </div>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <ChartComp data={merged} margin={{ top: 4, right: 16, bottom: 24, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 25% 20%)" />
          <XAxis
            dataKey="x"
            label={data.xLabel ? { value: data.xLabel, position: "insideBottom", offset: -12, fill: "#8899aa", fontSize: 12 } : undefined}
            tick={{ fill: "#8899aa", fontSize: 11 }}
          />
          <YAxis
            label={data.yLabel ? { value: data.yLabel, angle: -90, position: "insideLeft", offset: 8, fill: "#8899aa", fontSize: 12 } : undefined}
            tick={{ fill: "#8899aa", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{ background: "hsl(220 25% 13%)", border: "1px solid hsl(217 25% 20%)", borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: "#ccd6e0" }}
          />
          {data.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: "#8899aa" }} />}
          {data.series.map((s, i) =>
            data.type === "bar" ? (
              <Bar key={s.name} dataKey={s.name} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
            ) : (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )
          )}
        </ChartComp>
      </ResponsiveContainer>
    </div>
  );
}

function TableRenderer({ jsonStr }: { jsonStr: string }) {
  let data: TableData;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return <div className="text-destructive text-sm">Invalid table data</div>;
  }

  return (
    <div className="mt-3 mb-2 overflow-x-auto rounded-lg border border-border" data-testid="table-container">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/60">
            {data.headers.map((h, i) => (
              <th key={i} className="px-4 py-2 text-left font-semibold text-foreground/80 border-b border-border">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-2 text-foreground/70 font-mono text-xs">
                  {String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultHighlight({ content }: { content: string }) {
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-md bg-accent/15 border border-accent/30 text-accent font-mono text-sm font-medium mx-1"
      data-testid="result-highlight"
    >
      {content}
    </span>
  );
}

function renderInlineLatex(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match \( ... \) for inline and \[ ... \] for block
  const regex = /\\\[([^]*?)\\\]|\\\(([^]*?)\\\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1] !== undefined) {
      parts.push(
        <div key={key++} className="my-2">
          <BlockMath math={match[1].trim()} />
        </div>
      );
    } else if (match[2] !== undefined) {
      parts.push(
        <InlineMath key={key++} math={match[2].trim()} />
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts;
}

interface Segment {
  type: "text" | "chart" | "table" | "result";
  content: string;
}

function parseContent(content: string): Segment[] {
  const segments: Segment[] = [];
  const tagRegex = /<(chart|table|result)>([\s\S]*?)<\/\1>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: match[1] as "chart" | "table" | "result", content: match[2] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", content: content.slice(lastIndex) });
  }

  return segments;
}

interface MessageRendererProps {
  content: string;
}

export function MessageRenderer({ content }: MessageRendererProps) {
  const segments = parseContent(content);

  return (
    <div className="space-y-1">
      {segments.map((seg, i) => {
        if (seg.type === "chart") {
          return <ChartRenderer key={i} jsonStr={seg.content.trim()} />;
        }
        if (seg.type === "table") {
          return <TableRenderer key={i} jsonStr={seg.content.trim()} />;
        }
        if (seg.type === "result") {
          return (
            <div key={i} className="my-1">
              <ResultHighlight content={seg.content.trim()} />
            </div>
          );
        }
        // Text segment — render with LaTeX support
        const lines = seg.content.split("\n");
        return (
          <div key={i} className="leading-relaxed">
            {lines.map((line, li) => {
              if (line.trim() === "") return <br key={li} />;
              return (
                <div key={li} className="mb-0.5">
                  {renderInlineLatex(line)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
