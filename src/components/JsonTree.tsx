import { useState } from "react";

type JsonTreeProps = {
  /** Parsed JSON value to render. */
  data: unknown;
  /** Mount every container node expanded (true) or collapsed (false). */
  defaultExpanded?: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Short single-line summary shown while a container node is collapsed. */
const summarize = (value: unknown): string => {
  if (isRecord(value)) {
    const count = Object.keys(value).length;
    return `{…} ${count} ${count === 1 ? "key" : "keys"}`;
  }
  if (Array.isArray(value)) {
    return `[…] ${value.length} ${value.length === 1 ? "item" : "items"}`;
  }
  if (typeof value === "string") {
    const text = value.length > 80 ? `${value.slice(0, 80)}…` : value;
    return JSON.stringify(text);
  }
  return value === null ? "null" : String(value);
};

const formatLeaf = (value: unknown): string =>
  typeof value === "string"
    ? JSON.stringify(value)
    : value === null
      ? "null"
      : String(value);

const valueClass = (value: unknown): string => {
  if (value === null) return "jt-null";
  switch (typeof value) {
    case "string":
      return "jt-string";
    case "number":
      return "jt-number";
    case "boolean":
      return "jt-bool";
    default:
      return "jt-null";
  }
};

function TreeNode({
  label,
  value,
  comma,
  defaultExpanded,
}: {
  label?: string;
  value: unknown;
  comma?: boolean;
  defaultExpanded: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  const record = isRecord(value);
  const entries: Array<[string, unknown]> = record
    ? Object.entries(value)
    : Array.isArray(value)
      ? value.map((item, index): [string, unknown] => [String(index), item])
      : [];
  const container = record || Array.isArray(value);

  // Empty objects/arrays render compactly without a toggle.
  if (container && entries.length === 0) {
    return (
      <div className="jt-row">
        <span className="jt-chevron jt-leaf" aria-hidden />
        {label !== undefined && <span className="jt-key">{label}:</span>}
        <span className="jt-bracket">{record ? "{ }" : "[ ]"}</span>
        {comma ? <span className="jt-comma">,</span> : null}
      </div>
    );
  }

  if (!container) {
    return (
      <div className="jt-row">
        <span className="jt-chevron jt-leaf" aria-hidden />
        {label !== undefined && <span className="jt-key">{label}:</span>}
        <span className={`jt-value ${valueClass(value)}`}>
          {formatLeaf(value)}
        </span>
        {comma ? <span className="jt-comma">,</span> : null}
      </div>
    );
  }

  return (
    <div className="jt-node">
      <button
        type="button"
        className="jt-row jt-toggle"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
      >
        <span className="jt-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        {label !== undefined && <span className="jt-key">{label}:</span>}
        <span className="jt-bracket">{record ? "{" : "["}</span>
        {!open && <span className="jt-preview">{summarize(value)}</span>}
        {!open && comma ? <span className="jt-comma">,</span> : null}
      </button>
      {open && (
        <>
          <div className="jt-children">
            {entries.map(([key, item], index) => (
              <TreeNode
                key={key}
                label={key}
                value={item}
                comma={index < entries.length - 1}
                defaultExpanded={defaultExpanded}
              />
            ))}
          </div>
          <div className="jt-row jt-end">
            <span className="jt-chevron jt-leaf" aria-hidden />
            <span className="jt-bracket">
              {record ? "}" : "]"}
              {comma ? "," : ""}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Postman-style JSON viewer: objects and arrays collapse and expand via their
 * chevron, collapsed nodes show a summary, and values are syntax colored.
 */
export function JsonTree({ data, defaultExpanded = true }: JsonTreeProps) {
  return (
    <div className="jsontree">
      <TreeNode value={data} defaultExpanded={defaultExpanded} />
    </div>
  );
}