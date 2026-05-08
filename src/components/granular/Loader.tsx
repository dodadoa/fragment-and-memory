import { useState, type ChangeEvent, type DragEvent } from "react";
import { useTheme } from "@/theme/ThemeProvider";

export function Loader({
  isLoading,
  error,
  onFileInput,
  onDrop,
}: {
  isLoading: boolean;
  error: string | null;
  onFileInput: (e: ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}) {
  const theme = useTheme();
  const fs = (px: number) => `calc(${px}px * var(--app-font-scale, 1))`;
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { setDragOver(false); onDrop(e as unknown as DragEvent<HTMLDivElement>); }}
        className="glass-panel flex items-center justify-center rounded-lg px-2 py-2 text-center cursor-pointer transition-all"
        style={{
          border: dragOver
            ? "1px dashed rgba(100,85,70,0.45)"
            : "1px dashed rgba(100,85,70,0.18)",
          background: dragOver ? `${theme.colors.ink2}0d` : "transparent",
          fontSize: fs(11),
          color: dragOver ? theme.colors.ink2 : theme.colors.ink3,
          letterSpacing: "0.03em",
        }}
      >
        {isLoading ? "decoding…" : "drop sounds or click to open"}
        <input
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={onFileInput}
          onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
        />
      </label>
      {error ? (
        <p className="mt-2" style={{ fontSize: fs(12), color: "rgba(160,50,50,0.75)", fontStyle: "italic" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
