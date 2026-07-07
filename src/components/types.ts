import type { ReactNode } from 'react';
import type { CellContext, ColumnDef, Row, RowData } from '@tanstack/react-table';
import type { GridPalette } from '../helper/gridTheme';

export type { GridPalette };

export type GridAlign = 'left' | 'center' | 'right';

/** Per-column presentation/behaviour carried on TanStack's `column.meta`. */
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: GridAlign;
    filterType?: GridFilterType;
    filterOptions?: { value: string; label: string }[];
    dateFormat?: string;
    label?: string;
    // ── Inline editing ──
    editable?: boolean;
    editor?: GridEditor;
    editOptions?: { value: string; label: string }[];
    /** Field of TData this editor writes to (resolved from a string accessor). */
    editField?: keyof TData;
    validate?: (value: unknown, row: TData) => string | null;
    parseValue?: (raw: unknown) => unknown;
    renderEditor?: (ctx: EditContext<TData>) => ReactNode;
  }
}

/** Built-in per-column filter controls. `false`/`'none'` disables filtering. */
export type GridFilterType = 'text' | 'select' | 'number' | 'date' | 'none';

/** Built-in inline-cell editors. */
export type GridEditor = 'text' | 'number' | 'select' | 'checkbox' | 'date';

/** Context passed to a column's custom `renderEditor`. */
export interface EditContext<T> {
  row: T;
  value: unknown;
  setValue: (value: unknown) => void;
  error: string | null;
  columnId: string;
}

/** A single existing-row edit (field-level diff). */
export interface RowEdit<T> {
  rowId: string;
  /** The original row, before edits. */
  row: T;
  /** The row with all committed changes applied. */
  updatedRow: T;
  /** Only the fields that changed → their new values. */
  changes: Partial<Record<keyof T, unknown>>;
  /** The same fields → their previous values. */
  previous: Partial<Record<keyof T, unknown>>;
  rowIndex: number;
}

/** The full set of pending changes flushed on Save. */
export interface GridChanges<T> {
  /** Newly added rows (from `createRow`, with any edits applied). */
  inserted: T[];
  /** Existing rows with field-level edits. */
  updated: RowEdit<T>[];
  /** Existing rows marked for deletion (the original row objects). */
  deleted: T[];
}

export type GridAggregation =
  | 'sum'
  | 'count'
  | 'min'
  | 'max'
  | 'mean'
  | 'extent'
  | 'unique'
  | 'uniqueCount';

/**
 * Friendly column definition. Compiles to a TanStack `ColumnDef<T>` (see
 * `buildColumns`). For power cases, drop a raw partial `ColumnDef` into
 * `columnDef` — it is merged last and wins.
 */
export interface GridColumn<T> {
  /** Stable column id. Defaults to `accessor` when it is a string key. */
  id?: string;
  /** Object key of T, or a function deriving the cell value. */
  accessor?: keyof T | ((row: T) => unknown);
  /** Header content. A string also feeds the visibility menu + CSV export. */
  header?: ReactNode;
  /** Plain-text header used for the column-visibility menu / export when
   *  `header` is a node. Falls back to the column id. */
  headerLabel?: string;
  /** Custom cell renderer. Receives the resolved value and the full row. */
  render?: (value: unknown, row: T) => ReactNode;
  align?: GridAlign;
  /** Fixed/initial width in px. */
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  enableSorting?: boolean;
  enableResizing?: boolean;
  enableHiding?: boolean;
  enablePinning?: boolean;
  /** Pin this column to the left/right edge initially (sticky). */
  pinned?: 'left' | 'right';
  /** Per-column filter control. Defaults to `'text'` when column filters are on. */
  filter?: GridFilterType | false;
  /** Options for a `'select'` filter. Derived from the data when omitted. */
  filterOptions?: { value: string; label: string }[];
  /** dayjs format token for a date column (`filter: 'date'` / `editor: 'date'`).
   *  Drives the cell display (when no custom `render`), the filter's date picker
   *  and the date editor. Defaults to `DEFAULT_DATE_FORMAT` (`'MMM D, YYYY'`). */
  dateFormat?: string;
  /** Aggregation applied to this column's value in grouped rows. */
  aggregate?: GridAggregation;
  /** Renderer for the aggregated value in a group row. */
  renderAggregated?: (value: unknown, row: Row<T>) => ReactNode;
  // ── Inline editing (requires DataGrid `enableEditing`) ──
  /** Make this column editable in row-edit mode. */
  editable?: boolean;
  /** Editor control. Inferred from `filter`/value when omitted. */
  editor?: GridEditor;
  /** Options for a `'select'` editor (falls back to `filterOptions`). */
  editOptions?: { value: string; label: string }[];
  /** Field the editor writes to when `accessor` is a function (not a key). */
  field?: keyof T;
  /** Return an error message to block the commit, or `null` if valid. */
  validate?: (value: unknown, row: T) => string | null;
  /** Coerce the raw editor value before validate/commit (default per editor). */
  parseValue?: (raw: unknown) => unknown;
  /** Full custom-editor escape hatch. */
  renderEditor?: (ctx: EditContext<T>) => ReactNode;
  /** Escape hatch: raw ColumnDef props, merged last (wins over the above). */
  columnDef?: Partial<ColumnDef<T, unknown>>;
}

/**
 * A header group — a spanning parent header over a set of child columns (which
 * may themselves be leaf columns or further nested groups). Produces a
 * multi-level (banded) header. Groups carry no data of their own.
 */
export interface GridColumnGroup<T> {
  /** Stable group id (used for header keys/order). Auto-generated when omitted. */
  id?: string;
  /** Spanning header content. */
  header: ReactNode;
  /** Plain-text label (used when `header` is a node — e.g. tooltips). */
  headerLabel?: string;
  /** Alignment of the group header label. Default: center. */
  align?: GridAlign;
  /** Child columns or nested groups under this band. */
  columns: GridColumnNode<T>[];
}

/** A grid column schema entry: either a leaf column or a spanning header group. */
export type GridColumnNode<T> = GridColumn<T> | GridColumnGroup<T>;

/** Narrows a column node to a header group (it carries a `columns` array). */
export function isColumnGroup<T>(node: GridColumnNode<T>): node is GridColumnGroup<T> {
  return Array.isArray((node as GridColumnGroup<T>).columns);
}

export type GridDensity = 'compact' | 'normal' | 'comfortable';

export interface DataGridProps<T> {
  data: T[];
  /** Column schema — leaf columns and/or spanning header groups (multi-level). */
  columns: GridColumnNode<T>[];
  /** Stable row id — strongly recommended when selection/expansion is on. */
  getRowId?: (row: T, index: number) => string;

  // ── Core ──────────────────────────────────────────────────────────────
  /** Global toolbar search box. Default: true. */
  enableGlobalFilter?: boolean;
  /** Per-column filter input row. Default: false. */
  enableColumnFilters?: boolean;
  /** Client-side pagination (ignored when `virtualized`). Default: true. */
  enablePagination?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];

  // ── Column controls ───────────────────────────────────────────────────
  enableColumnResizing?: boolean;
  /** Drag-to-reorder columns (native HTML5 DnD). */
  enableColumnReordering?: boolean;
  /** Show/hide columns via a toolbar menu. Default: true. */
  enableColumnVisibility?: boolean;
  /** Show a per-column header menu to pin/unpin columns left/right. Columns are
   *  still pinnable declaratively via `GridColumn.pinned` regardless. */
  enablePinning?: boolean;

  // ── Row features ──────────────────────────────────────────────────────
  enableRowSelection?: boolean | ((row: Row<T>) => boolean);
  /**
   * What the header "select all" checkbox toggles: `'all'` (default) selects
   * every filtered row across all pages; `'page'` selects only the current
   * page's rows. No effect without pagination — page == all.
   */
  selectAllScope?: 'all' | 'page';
  /** Called with the selected original rows whenever the selection changes. */
  onRowSelectionChange?: (rows: T[]) => void;
  /** Renders an expandable detail panel under a row. */
  renderDetail?: (row: T) => ReactNode;
  /** Renders a trailing actions cell for each row. */
  rowActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;

  // ── Inline editing (batch: edit freely, then Save / Revert) ───────────
  /** Enable inline cell editing for columns marked `editable`. Edits are
   *  staged in a working draft (dirty cells are highlighted); nothing leaves
   *  the grid until the user hits Save. */
  enableEditing?: boolean;
  /** What opens a cell's editor. Default: 'doubleClick'. */
  editTrigger?: 'doubleClick' | 'click';
  /** Factory for a new blank row. Providing it shows an "Add row" button (rows
   *  are prepended + opened for editing). Must set a unique id (for `getRowId`). */
  createRow?: () => T;
  /** Show a per-row delete (trash/restore) control + a bulk "Delete selected"
   *  toolbar button when row selection is on. Deletions stage until Save. */
  enableRowDelete?: boolean;
  /** Called once with ALL pending changes when the user hits Save. Return a
   *  Promise for a saving spinner; on reject the draft is kept so they can
   *  retry or revert. On success, update `data` so the draft resyncs. */
  onSave?: (changes: GridChanges<T>) => void | Promise<void>;
  /** Optional hook fired when the user reverts all pending changes. */
  onRevert?: () => void;

  // ── Data ops ──────────────────────────────────────────────────────────
  /** Virtualize rows (replaces pagination; best for large flat datasets).
   *  Detail/grouping expansion is disabled in this mode. */
  virtualized?: boolean;
  estimateRowHeight?: number;
  /** Scroller max height. Required for the sticky header. For `virtualized` it
   *  defaults to 400px when omitted (virtualization needs a bounded height);
   *  set it explicitly to fit your layout. */
  maxHeight?: number | string;
  enableExport?: boolean;
  exportFileName?: string;
  /** Column ids to group by (enables grouping + aggregation rows). */
  grouping?: string[];

  // ── Tree / hierarchical data ──────────────────────────────────────────
  /** Return a row's child rows. Providing this enables tree mode: real nested
   *  rows that expand/collapse inline with an indented toggle. Distinct from
   *  grouping (synthetic buckets) and detail rows (a panel under a row), and
   *  mutually exclusive with both. Ignored when `virtualized`.
   *
   *  Note: inline editing is flat-data only, so `enableEditing`, `createRow`
   *  (Add row) and `enableRowDelete` are disabled while tree mode is active. */
  getSubRows?: (row: T) => T[] | undefined;
  /** Column id that carries the tree expand toggle + indentation. Defaults to
   *  the first data column. */
  treeColumnId?: string;
  /** Start with all tree rows expanded. Default: collapsed. */
  defaultExpanded?: boolean;

  // ── Presentation ──────────────────────────────────────────────────────
  title?: ReactNode;
  /** Extra controls rendered on the right of the toolbar. */
  toolbarActions?: ReactNode;
  loading?: boolean;
  emptyMessage?: ReactNode;
  striped?: boolean;
  highlightOnHover?: boolean;
  stickyHeader?: boolean;
  /** Draw vertical separator lines between columns. Default `true`. */
  showColumnLines?: boolean;
  density?: GridDensity;
  className?: string;
  /** Re-skin the whole grid (chrome + embedded Mantine widgets) to a template
   *  palette — the `preview` object shipped with each UI theme. Forces the
   *  grid's light/dark scheme to match the palette, regardless of the app's own
   *  theme. When omitted, the grid follows the app's Mantine theme as before. */
  palette?: GridPalette;
}

/** Convenience alias for typing a custom cell renderer's context. */
export type GridCellContext<T> = CellContext<T, unknown>;
