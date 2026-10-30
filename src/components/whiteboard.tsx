"use client";

import { Circle, Download, Eraser, Highlighter, Minus, MoveUpRight, Pencil, Shapes, Square, Trash2, Type, Undo2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BOARD_H, BOARD_W, type Meeting, type MeetingState, type Stroke } from "@/client/meeting";

type Tool = Stroke["tool"] | "eraser";
type Typing = { key: number; x: number; y: number; text: string };

const COLORS = ["#111111", "#e5484d", "#f76b15", "#ffc53d", "#30a46c", "#0090ff", "#8e4ec6", "#ffffff"];
const SIZES = [3, 6, 12];
const SHAPES: { tool: Tool; label: string; icon: ReactNode }[] = [
  { tool: "line", label: "Line", icon: <Minus size={17} /> },
  { tool: "arrow", label: "Arrow", icon: <MoveUpRight size={17} /> },
  { tool: "rect", label: "Rectangle", icon: <Square size={16} /> },
  { tool: "ellipse", label: "Ellipse", icon: <Circle size={16} /> },
];
const fontSize = (s: Stroke) => 18 + s.size * 3;
const FONT = "600 1px ui-sans-serif, system-ui, sans-serif";
const font = (px: number) => FONT.replace("1px", `${px}px`);

/** Draws one stroke, in board coordinates. */
function paint(ctx: CanvasRenderingContext2D, s: Stroke) {
  const p = s.points;
  ctx.strokeStyle = ctx.fillStyle = s.color;
  ctx.lineWidth = s.tool === "marker" ? s.size * 4 : s.size;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.globalAlpha = s.tool === "marker" ? 0.35 : 1;
  ctx.beginPath();
  if (s.tool === "text") {
    ctx.font = font(fontSize(s));
    ctx.textBaseline = "top";
    ctx.fillText(s.text ?? "", p[0], p[1]);
  } else if (s.tool === "pen" || s.tool === "marker") {
    if (p.length === 2) {
      ctx.arc(p[0], p[1], ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Through the midpoints, so the line comes out smooth rather than as straight segments.
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 2]) / 2, (p[i + 1] + p[i + 3]) / 2);
      ctx.lineTo(p[p.length - 2], p[p.length - 1]);
      ctx.stroke();
    }
  } else if (p.length >= 4) {
    const [x0, y0, x1, y1] = p;
    if (s.tool === "rect") ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    else if (s.tool === "ellipse") {
      ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      if (s.tool === "arrow") {
        const a = Math.atan2(y1 - y0, x1 - x0);
        const head = Math.max(16, s.size * 4);
        ctx.moveTo(x1 - head * Math.cos(a - 0.45), y1 - head * Math.sin(a - 0.45));
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 - head * Math.cos(a + 0.45), y1 - head * Math.sin(a + 0.45));
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function render(ctx: CanvasRenderingContext2D, strokes: Iterable<Stroke>, scale: number) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  for (const s of strokes) paint(ctx, s);
}

const toSegment = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};

/** Whether the eraser at (x, y) touches a stroke. */
function touches(ctx: CanvasRenderingContext2D, s: Stroke, x: number, y: number, r: number) {
  const p = s.points;
  const reach = r + (s.tool === "marker" ? s.size * 2 : s.size / 2);
  if (s.tool === "text") {
    ctx.font = font(fontSize(s));
    const w = ctx.measureText(s.text ?? "").width;
    return x >= p[0] - r && x <= p[0] + w + r && y >= p[1] - r && y <= p[1] + fontSize(s) + r;
  }
  let path = p;
  if (s.tool === "rect" && p.length >= 4) path = [p[0], p[1], p[2], p[1], p[2], p[3], p[0], p[3], p[0], p[1]];
  else if (s.tool === "ellipse" && p.length >= 4) {
    path = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      path.push((p[0] + p[2]) / 2 + (Math.abs(p[2] - p[0]) / 2) * Math.cos(a), (p[1] + p[3]) / 2 + (Math.abs(p[3] - p[1]) / 2) * Math.sin(a));
    }
  }
  if (path.length === 2) return Math.hypot(x - path[0], y - path[1]) <= reach;
  for (let i = 0; i < path.length - 2; i += 2) if (toSegment(x, y, path[i], path[i + 1], path[i + 2], path[i + 3]) <= reach) return true;
  return false;
}

/** The shared whiteboard on the stage: a 16:9 board everyone can draw on, with its tools above. */
export function Whiteboard({ meeting, state }: { meeting: Meeting; state: MeetingState }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(SIZES[0]);
  const [tray, setTray] = useState<"shapes" | "colors" | null>(null);
  const [typing, setTyping] = useState<Typing | null>(null);
  // Also in a ref: tapping elsewhere both starts a new text box and blurs the old one, and only the
  // box still open may be committed.
  const typed = useRef<Typing | null>(null);
  const editText = (t: Typing | null) => {
    typed.current = t;
    setTyping(t);
  };
  /** This user's strokes, newest last, for undo. */
  const mine = useRef<string[]>([]);
  const drawing = useRef<{ id: string; start: [number, number]; pending: number[]; timer: ReturnType<typeof setTimeout> | null } | null>(null);

  const board = state.board!;
  const opener = board.by === "self" ? "Your" : `${state.remotes.find((r) => r.id === board.by)?.name ?? "Someone"}'s`;
  const manage = meeting.mayManageBoard("self");

  // The largest 16:9 board that fits.
  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => {
      const w = Math.min(el.clientWidth, (el.clientHeight * BOARD_W) / BOARD_H);
      setSize({ w, h: (w * BOARD_H) / BOARD_W });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Redraw on any change, at most once a frame.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w) return;
    const dpr = devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d")!;
    let raf = 0;
    const draw = () => {
      raf = 0;
      render(ctx, meeting.board.values(), c.width / BOARD_W);
    };
    draw();
    const off = meeting.onBoard(() => (raf ||= requestAnimationFrame(draw)));
    return () => {
      off();
      cancelAnimationFrame(raf);
    };
  }, [meeting, size]);

  // Ctrl/Cmd+Z undoes this user's last stroke.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !(e.target as HTMLElement).closest("input, textarea")) {
        e.preventDefault();
        undo();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const at = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * BOARD_W, ((e.clientY - r.top) / r.height) * BOARD_H];
  };

  function eraseAt(x: number, y: number) {
    const ctx = canvas.current!.getContext("2d")!;
    const hit = [...meeting.board.values()].filter((s) => touches(ctx, s, x, y, 12)).map((s) => s.id);
    if (hit.length) meeting.erase(hit);
  }

  function down(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    setTray(null);
    const [x, y] = at(e);
    if (tool === "text") {
      commitText();
      editText({ key: Date.now(), x, y, text: "" });
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    if (tool === "eraser") {
      drawing.current = { id: "", start: [x, y], pending: [], timer: null };
      eraseAt(x, y);
      return;
    }
    const shape = tool !== "pen" && tool !== "marker";
    const id = meeting.draw({ tool, color, size: width, points: shape ? [x, y, x, y] : [x, y] });
    if (!id) return;
    mine.current.push(id);
    drawing.current = { id, start: [x, y], pending: [], timer: null };
  }

  function move(e: React.PointerEvent) {
    const d = drawing.current;
    if (!d) return;
    const [x, y] = at(e);
    if (tool === "eraser") return eraseAt(x, y);
    const shape = tool !== "pen" && tool !== "marker";
    // Shapes send their latest end point; freehand strokes send what's new, ~30 times a second.
    d.pending = shape ? [...d.start, x, y] : [...d.pending, x, y];
    d.timer ??= setTimeout(() => flush(shape), 33);
  }

  function flush(shape: boolean) {
    const d = drawing.current;
    if (!d) return;
    if (d.timer) clearTimeout(d.timer);
    d.timer = null;
    if (d.pending.length) meeting.extend(d.id, d.pending, shape);
    d.pending = [];
  }

  function up() {
    if (drawing.current && tool !== "eraser") flush(tool !== "pen" && tool !== "marker");
    drawing.current = null;
  }

  function commitText(key?: number) {
    const t = typed.current;
    if (!t || (key !== undefined && t.key !== key)) return;
    editText(null);
    if (t.text.trim()) {
      const id = meeting.draw({ tool: "text", color, size: width, points: [t.x, t.y], text: t.text.trim() });
      if (id) mine.current.push(id);
    }
  }

  function undo() {
    while (mine.current.length) {
      const id = mine.current.pop()!;
      if (meeting.board.has(id)) return meeting.erase([id]);
    }
  }

  function save() {
    const c = document.createElement("canvas");
    c.width = BOARD_W;
    c.height = BOARD_H;
    render(c.getContext("2d")!, meeting.board.values(), 1);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${state.title || "Convene"} whiteboard.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  const pick = (t: Tool) => {
    commitText();
    setTool(t);
    setTray(null);
  };
  const shape = SHAPES.find((s) => s.tool === tool);
  const scale = size.w / BOARD_W;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" id="whiteboard">
      <div className="flex items-center gap-2">
        <div className="scroll-thin flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-panel p-1" role="toolbar" aria-label="Whiteboard tools">
          <ToolButton label="Pen" on={tool === "pen"} onClick={() => pick("pen")} id="wb-pen">
            <Pencil size={17} />
          </ToolButton>
          <ToolButton label="Highlighter" on={tool === "marker"} onClick={() => pick("marker")} id="wb-marker">
            <Highlighter size={17} />
          </ToolButton>
          <ToolButton label="Shapes" on={Boolean(shape) || tray === "shapes"} onClick={() => setTray(tray === "shapes" ? null : "shapes")} id="wb-shapes">
            {shape?.icon ?? <Shapes size={17} />}
          </ToolButton>
          <ToolButton label="Text" on={tool === "text"} onClick={() => pick("text")} id="wb-text">
            <Type size={17} />
          </ToolButton>
          <ToolButton label="Eraser" on={tool === "eraser"} onClick={() => pick("eraser")} id="wb-eraser">
            <Eraser size={17} />
          </ToolButton>
          <span className="mx-1 h-5 w-px shrink-0 bg-line" />
          <ToolButton label="Colour and size" on={tray === "colors"} onClick={() => setTray(tray === "colors" ? null : "colors")} id="wb-color">
            <span className="h-4 w-4 rounded-full ring-2 ring-white/30" style={{ background: color }} />
          </ToolButton>
          <ToolButton label="Undo (Ctrl+Z)" onClick={undo} id="wb-undo">
            <Undo2 size={17} />
          </ToolButton>
          {manage && (
            <ToolButton label="Clear the board" onClick={() => meeting.clearBoard()} id="wb-clear">
              <Trash2 size={17} />
            </ToolButton>
          )}
          <ToolButton label="Save as picture" onClick={save} id="wb-save">
            <Download size={17} />
          </ToolButton>
        </div>
        <span className="ml-auto hidden truncate text-sm text-ink-2 md:block">{opener} whiteboard</span>
        {manage && (
          <button className="btn h-9 shrink-0 rounded-xl px-3 text-xs max-md:ml-auto" onClick={() => meeting.closeBoard()} id="wb-close">
            <X size={15} /> <span className="max-sm:hidden">Close whiteboard</span>
          </button>
        )}
      </div>
      {tray && (
        <div className="scroll-thin flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1">
          {tray === "shapes"
            ? SHAPES.map((s) => (
                <ToolButton key={s.tool} label={s.label} on={tool === s.tool} onClick={() => pick(s.tool)} id={`wb-${s.tool}`}>
                  {s.icon}
                </ToolButton>
              ))
            : (
                <>
                  {COLORS.map((c) => (
                    <button key={c} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-raise" onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c}>
                      <span className={`h-5 w-5 rounded-full border border-white/25 ${color === c ? "ring-2 ring-accent ring-offset-2 ring-offset-panel" : ""}`} style={{ background: c }} />
                    </button>
                  ))}
                  <span className="mx-1 h-5 w-px shrink-0 bg-line" />
                  {SIZES.map((s) => (
                    <button key={s} className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-raise ${width === s ? "bg-accent/20" : ""}`} onClick={() => setWidth(s)} aria-label={`Size ${SIZES.indexOf(s) + 1}`} aria-pressed={width === s}>
                      <span className="rounded-full bg-ink" style={{ width: s + 3, height: s + 3 }} />
                    </button>
                  ))}
                </>
              )}
        </div>
      )}
      <div ref={box} className="relative grid min-h-0 flex-1 place-items-center">
        <div className="relative overflow-hidden rounded-2xl shadow-lg shadow-black/40" style={{ width: size.w, height: size.h }}>
          <canvas
            ref={canvas}
            className="block h-full w-full touch-none"
            style={{ cursor: tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair" }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            aria-label="Whiteboard"
          />
          {typing && (
            <input
              key={typing.key}
              autoFocus
              className="absolute min-w-24 bg-transparent outline-none"
              style={{ left: typing.x * scale, top: typing.y * scale, color, font: font((18 + width * 3) * scale), lineHeight: 1 }}
              value={typing.text}
              placeholder="Type, then Enter"
              onChange={(e) => editText({ ...typing, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText();
                else if (e.key === "Escape") editText(null);
              }}
              onBlur={() => commitText(typing.key)}
              id="wb-input"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ToolButton({ label, on, onClick, children, id }: { label: string; on?: boolean; onClick: () => void; children: ReactNode; id?: string }) {
  return (
    <button className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${on ? "bg-accent/25 text-accent-ink" : "text-ink-2 hover:bg-raise hover:text-ink"}`} onClick={onClick} aria-label={label} title={label} aria-pressed={on} id={id}>
      {children}
    </button>
  );
}
