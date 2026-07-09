import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActionIcon,
  Button,
  Center,
  Menu,
  Popover,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp,
  IconArrowBarToLeft,
  IconArrowBarToRight,
  IconArrowsSort,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconDotsVertical,
  IconFilter,
  IconFilterFilled,
  IconFilterOff,
  IconInbox,
  IconPinned,
  IconPinnedOff,
  IconSelector,
  IconSortAscending,
  IconSortDescending,
  IconTrash,
} from "@tabler/icons-react";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Cell,
  type Column,
  type ColumnOrderState,
  type ColumnPinningState,
  type ExpandedState,
  type FilterMeta,
  type GroupingState,
  type Header,
  type Row,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { rankItem } from "@tanstack/match-sorter-utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "clsx";
import { toCsv, downloadCsv } from "../helper/csv";
import {
  copyToClipboard,
  downloadExcel,
  downloadJson,
  printTable,
} from "../helper/tableExport";
import {
  GridThemeContext,
  gridPaletteVars,
  paletteColorScheme,
  paletteCss,
  useGridTheme,
} from "../helper/gridTheme";
import {
  ACTIONS_COL,
  buildColumns,
  columnId,
  DELETE_COL,
  EXPAND_COL,
  flattenColumns,
  isControlColumn,
  SELECT_COL,
} from "./buildColumns";
import { ColumnFilter } from "./ColumnFilter";
import { EditableCell } from "./EditableCell";
import type { GridChanges } from "./types";
import { GridToolbar } from "./GridToolbar";
import { GridPagination } from "./GridPagination";
import type { DataGridProps } from "./types";
import classes from "./DataGrid.module.css";

const DENSITY_PY: Record<string, string> = {
  compact: "6px",
  normal: "10px",
  comfortable: "14px",
};

// Virtualization needs a bounded, scrollable container to work; when the caller
// enables `virtualized` without a `maxHeight`, fall back to this so the grid
// scrolls correctly instead of rendering a few rows over a blank gap.
const DEFAULT_VIRTUAL_MAX_HEIGHT = 400;

/** Global-search filter: fuzzy (typo-tolerant, non-contiguous) match per cell
 *  via match-sorter's rankItem. A row passes if the search text ranks against
 *  the cell value. Declared generic (not a `FilterFn<unknown>` const) so TS
 *  instantiates it to the table's `FilterFn<T>` at the call site — TanStack's
 *  FilterFn is invariant in T, so a fixed-type const won't assign. */
function fuzzyFilter<T>(
  row: Row<T>,
  columnId: string,
  value: string,
  addMeta: (meta: FilterMeta) => void,
): boolean {
  const itemRank = rankItem(row.getValue(columnId), value);
  addMeta({ itemRank });
  return itemRank.passed;
}

/** Sticky-position style + classes for a pinned column. */
function pinProps<T>(column: Column<T, unknown>) {
  const pinned = column.getIsPinned();
  if (!pinned) return { style: {}, className: "" };
  const style: React.CSSProperties = {
    left: pinned === "left" ? column.getStart("left") : undefined,
    right: pinned === "right" ? column.getAfter("right") : undefined,
  };
  const className = cx(
    classes.pinned,
    pinned === "left" &&
      column.getIsLastColumn("left") &&
      classes.pinnedLeftLast,
    pinned === "right" &&
      column.getIsFirstColumn("right") &&
      classes.pinnedRightFirst,
  );
  return { style, className };
}

/**
 * Reusable, fully client-side data grid built on TanStack Table + Mantine.
 * Feed it `data` + a `columns` schema; it handles sorting, filtering, paging,
 * column resize/reorder/visibility/pinning, row selection, expandable detail
 * rows, virtualization, grouping/aggregation and CSV export. Fully theme-aware.
 */
export function DataGrid<T>({
  data,
  columns,
  getRowId,
  enableGlobalFilter = true,
  enableColumnFilters = false,
  enablePagination = true,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  enableColumnResizing = false,
  enableColumnReordering = false,
  enableColumnVisibility = true,
  enablePinning = false,
  enableRowSelection = false,
  selectAllScope = "all",
  onRowSelectionChange,
  renderDetail,
  rowActions,
  onRowClick,
  enableEditing = false,
  editTrigger = "doubleClick",
  createRow,
  enableRowDelete = false,
  onSave,
  onRevert,
  virtualized = false,
  estimateRowHeight = 44,
  maxHeight,
  enableExport = false,
  exportFileName = "export",
  grouping: groupingProp,
  getSubRows,
  treeColumnId,
  defaultExpanded = false,
  title,
  toolbarActions,
  loading = false,
  emptyMessage = "No data",
  striped = false,
  highlightOnHover = true,
  stickyHeader = false,
  showColumnLines = true,
  density = "normal",
  className,
  palette,
}: DataGridProps<T>) {
  // Detail expansion, grouping and tree data are single-tbody features; they're
  // disabled in virtualized mode (which flattens rows for the virtualizer).
  // Tree mode takes precedence and is mutually exclusive with detail/grouping:
  // all three describe row structure differently and share the expanded state.
  const useTree = !!getSubRows && !virtualized;
  const useExpansion = !useTree && !!renderDetail && !virtualized;
  const useGrouping = !useTree && !!groupingProp?.length && !virtualized;

  // Flattened leaf columns (unwraps header groups) with their depth-first index —
  // all leaf-level logic (pinning, editing, ids) works off this, not the raw
  // schema which may nest groups.
  const leaves = useMemo(() => flattenColumns(columns), [columns]);

  // In tree mode, the expand toggle + indentation live on this data column
  // (explicit `treeColumnId`, else the first data column).
  const treeColId = useMemo(() => {
    if (!useTree) return undefined;
    if (treeColumnId) return treeColumnId;
    const first = leaves[0];
    return first ? columnId(first.col, first.index) : undefined;
  }, [useTree, treeColumnId, leaves]);

  // Editing is on only if enabled and at least one leaf column opts in.
  // Guarded off in tree mode: the editing draft, Add-row and row-delete are all
  // flat-data operations (they prepend/diff the top-level array and can't
  // express hierarchy), so they'd misbehave against nested subRows.
  const editingEnabled =
    enableEditing && !useTree && leaves.some(({ col }) => col.editable);
  const deleteEnabled = editingEnabled && enableRowDelete;

  // ── Template theming ──────────────────────────────────────────────────────
  // When a `palette` is supplied, re-skin the grid to it: the vars go inline on
  // the root (in-scope DOM) and, since Mantine dropdowns portal to <body>, the
  // same vars are also emitted as a scoped rule keyed by a per-instance class
  // that the portalled overlays opt into (via GridThemeContext).
  const rawId = useId();
  const portalClassName = palette
    ? `dg-theme-${rawId.replace(/:/g, "")}`
    : undefined;
  const paletteVars = useMemo(
    () => (palette ? gridPaletteVars(palette) : null),
    [palette],
  );
  const paletteScheme = palette ? paletteColorScheme(palette) : undefined;
  const portalCss =
    palette && portalClassName
      ? paletteCss(`.${portalClassName}`, palette)
      : null;
  const themeCtx = useMemo(() => ({ portalClassName }), [portalClassName]);

  const defs = useMemo(
    () =>
      buildColumns(columns, {
        enableSelection: !!enableRowSelection,
        selectAllScope,
        enableRowExpansion: useExpansion,
        hasActions: !!rowActions,
        rowActions,
        enableDelete: deleteEnabled,
        treeColumnId: treeColId,
      }),
    [
      columns,
      enableRowSelection,
      selectAllScope,
      useExpansion,
      rowActions,
      deleteEnabled,
      treeColId,
    ],
  );

  const columnIds = useMemo(() => defs.map((d) => d.id as string), [defs]);

  // Initial pinning from the declarative `pinned` flag on each leaf column.
  const initialPinning = useMemo<ColumnPinningState>(() => {
    const left: string[] = [];
    const right: string[] = [];
    leaves.forEach(({ col, index }) => {
      if (col.pinned === "left") left.push(columnId(col, index));
      else if (col.pinned === "right") right.push(columnId(col, index));
    });
    return { left, right };
  }, [leaves]);

  // Keep the framework control columns at the outer edges: whenever the user
  // pins any real column left/right, the leading control columns (select /
  // expand) stay first on the left and the trailing ones (actions / delete)
  // stay last on the right — so e.g. the row-select checkbox is always the
  // left-most column. When nothing user-facing is pinned we leave the control
  // columns unpinned, so the default (non-sticky) look is unchanged.
  const normalizePinning = useCallback(
    (state: ColumnPinningState): ColumnPinningState => {
      const present = new Set(columnIds);
      const lead = [SELECT_COL, EXPAND_COL].filter((id) => present.has(id));
      const tail = [ACTIONS_COL, DELETE_COL].filter((id) => present.has(id));
      const userLeft = (state.left ?? []).filter((id) => !isControlColumn(id));
      const userRight = (state.right ?? []).filter(
        (id) => !isControlColumn(id),
      );
      return {
        left: userLeft.length ? [...lead, ...userLeft] : userLeft,
        right: userRight.length ? [...userRight, ...tail] : userRight,
      };
    },
    [columnIds],
  );

  // ── Editing draft ───────────────────────────────────────────────────────
  // A working copy of the data that edits mutate. The table renders from it
  // when editing so sort/filter/render all "just work"; Save diffs it against
  // the `data` prop (the baseline) and Revert resets it.
  const rowKey = useCallback(
    (row: T, index: number) =>
      getRowId ? getRowId(row, index) : String(index),
    [getRowId],
  );
  const [draft, setDraft] = useState<T[]>(data);
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    colId: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  // Ids of rows added (not yet saved) and rows staged for deletion.
  const [insertedIds, setInsertedIds] = useState<Set<string>>(() => new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  // Cells the user has actually edited (`${rowId}::${field}`), plus whether a
  // Save has been attempted. Validation errors stay hidden until a cell is
  // touched or the user tries to save — so a freshly-added blank row isn't
  // pre-marked invalid the instant it appears.
  const [touchedCells, setTouchedCells] = useState<Set<string>>(
    () => new Set(),
  );
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Resync the draft whenever the source data changes (initial load, external
  // update, or a successful save) — this also clears all pending changes.
  useEffect(() => {
    setDraft(data);
    setEditingCell(null);
    setInsertedIds(new Set());
    setDeletedIds(new Set());
    setTouchedCells(new Set());
    setSubmitAttempted(false);
  }, [data]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<
    { id: string; value: unknown }[]
  >([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(columnIds);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(() =>
    normalizePinning(initialPinning),
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [expanded, setExpanded] = useState<ExpandedState>(
    defaultExpanded ? true : {},
  );
  const [grouping, setGrouping] = useState<GroupingState>(groupingProp ?? []);

  // Keep order/pinning/grouping in sync when the column schema changes.
  useEffect(() => setColumnOrder(columnIds), [columnIds]);
  useEffect(
    () => setColumnPinning(normalizePinning(initialPinning)),
    [normalizePinning, initialPinning],
  );
  useEffect(
    () => setGrouping(useGrouping ? (groupingProp ?? []) : []),
    [groupingProp, useGrouping],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns fresh functions each render by design; the table instance is stable.
  const table = useReactTable({
    data: editingEnabled ? draft : data,
    columns: defs,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      columnVisibility,
      columnOrder,
      columnPinning,
      rowSelection,
      expanded,
      grouping,
    },
    getRowId,
    // Tree mode: read child rows from the data. Filter from leaf rows up so a
    // matching descendant keeps its ancestors visible (else parents vanish).
    getSubRows: useTree ? getSubRows : undefined,
    filterFromLeafRows: useTree,
    enableRowSelection,
    enableColumnResizing,
    columnResizeMode: "onChange",
    // Every header click accumulates into a multi-sort (no shift needed); a
    // third click on a column removes it, and the toolbar offers "clear all".
    isMultiSortEvent: () => true,
    globalFilterFn: fuzzyFilter,
    getRowCanExpand: useTree
      ? (row) => row.subRows.length > 0
      : useExpansion
        ? () => true
        : undefined,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnPinningChange: (updater) =>
      setColumnPinning((prev) =>
        normalizePinning(
          typeof updater === "function" ? updater(prev) : updater,
        ),
      ),
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    onGroupingChange: setGrouping,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(enablePagination && !virtualized
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
    ...(useExpansion || useGrouping || useTree
      ? { getExpandedRowModel: getExpandedRowModel() }
      : {}),
    ...(useGrouping ? { getGroupedRowModel: getGroupedRowModel() } : {}),
    initialState: { pagination: { pageSize } },
  });

  // Report selection changes with the original row objects.
  useEffect(() => {
    if (!onRowSelectionChange) return;
    onRowSelectionChange(
      table.getSelectedRowModel().flatRows.map((r) => r.original),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSelection]);

  // ── Inline editing: staged draft + validation + batch save/revert ─────────
  // Baseline (last-saved) rows by id, for diffing the draft.
  const baselineById = useMemo(() => {
    const m = new Map<string, T>();
    data.forEach((row, i) => m.set(rowKey(row, i), row));
    return m;
  }, [data, rowKey]);

  // Editable leaf columns paired with the field they write to.
  const editFields = useMemo(
    () =>
      leaves
        .filter(({ col }) => col.editable)
        .map(({ col, index }) => ({
          id: columnId(col, index),
          col,
          field: (typeof col.accessor === "string"
            ? (col.accessor as keyof T)
            : col.field) as keyof T | undefined,
        }))
        .filter((e) => e.field != null),
    [leaves],
  );

  // All pending changes derived from the draft vs baseline + insert/delete sets.
  // Flat list — each entry is a row spread with an `action` tag. Update rows
  // carry the final values; delete rows carry the original.
  const gridChanges = useMemo<GridChanges<T>>(() => {
    if (!editingEnabled) return [];
    const out: GridChanges<T> = [];
    draft.forEach((row, index) => {
      const id = rowKey(row, index);
      if (deletedIds.has(id)) {
        // Staged-delete on an existing row (inserted rows are dropped outright).
        if (!insertedIds.has(id)) {
          const base = baselineById.get(id);
          if (base) out.push({ ...base, action: "delete" });
        }
        return;
      }
      if (insertedIds.has(id)) {
        out.push({ ...row, action: "insert" });
        return;
      }
      const base = baselineById.get(id);
      if (!base) return;
      let changed = false;
      for (const { field } of editFields) {
        const f = field as keyof T;
        if (row[f] !== base[f]) {
          changed = true;
          break;
        }
      }
      if (changed) out.push({ ...row, action: "update" });
    });
    return out;
  }, [
    editingEnabled,
    draft,
    baselineById,
    editFields,
    insertedIds,
    deletedIds,
    rowKey,
  ]);

  // Validation errors keyed by `${rowId}::${field}` — validates changed fields
  // of edited rows and all editable fields of inserted rows (skips deleted).
  const editErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!editingEnabled) return errs;
    draft.forEach((row, index) => {
      const id = rowKey(row, index);
      if (deletedIds.has(id)) return;
      const isNew = insertedIds.has(id);
      const base = baselineById.get(id);
      for (const { field, col } of editFields) {
        if (!col.validate) continue;
        const f = field as keyof T;
        const changed = isNew || (base ? row[f] !== base[f] : false);
        if (!changed) continue;
        const msg = col.validate(row[f], row);
        if (msg) errs[`${id}::${String(f)}`] = msg;
      }
    });
    return errs;
  }, [
    editingEnabled,
    draft,
    baselineById,
    editFields,
    insertedIds,
    deletedIds,
    rowKey,
  ]);

  // Errors actually surfaced in the UI: hidden until the user has touched the
  // cell or attempted a Save (a new row shouldn't shout before it's touched).
  const visibleErrors = useMemo(() => {
    if (submitAttempted) return editErrors;
    const out: Record<string, string> = {};
    for (const key of Object.keys(editErrors)) {
      if (touchedCells.has(key)) out[key] = editErrors[key];
    }
    return out;
  }, [editErrors, touchedCells, submitAttempted]);

  const dirtyCount = gridChanges.length;
  const dirty = editingEnabled && dirtyCount > 0;
  // Full error count blocks Save; the visible count drives the badge + cell
  // styling so nothing turns red until it's been touched / a Save was tried.
  const errorCount = Object.keys(editErrors).length;
  const visibleErrorCount = Object.keys(visibleErrors).length;

  // Commit one cell's value into the draft (parsed via the column's parseValue).
  const commitCell = useCallback(
    (
      rowId: string,
      field: keyof T,
      parse: ((raw: unknown) => unknown) | undefined,
      raw: unknown,
    ) => {
      const value = parse ? parse(raw) : raw;
      setDraft((prev) =>
        prev.map((row, i) =>
          rowKey(row, i) === rowId ? { ...row, [field]: value } : row,
        ),
      );
      setTouchedCells((prev) =>
        new Set(prev).add(`${rowId}::${String(field)}`),
      );
      setEditingCell(null);
    },
    [rowKey],
  );

  // Prepend a new blank row and open its first editable cell.
  const addRow = useCallback(() => {
    if (!createRow || saving) return;
    const row = createRow();
    const id = rowKey(row, 0);
    setDraft((prev) => [row, ...prev]);
    setInsertedIds((prev) => new Set(prev).add(id));
    const firstEditable = editFields[0]?.id;
    if (firstEditable) setEditingCell({ rowId: id, colId: firstEditable });
  }, [createRow, saving, rowKey, editFields]);

  // Toggle a row's pending-delete state. Inserted rows are dropped outright.
  const toggleDelete = useCallback(
    (rowId: string) => {
      if (saving) return;
      if (insertedIds.has(rowId)) {
        setDraft((prev) => prev.filter((r, i) => rowKey(r, i) !== rowId));
        setInsertedIds((prev) => {
          const next = new Set(prev);
          next.delete(rowId);
          return next;
        });
        return;
      }
      setDeletedIds((prev) => {
        const next = new Set(prev);
        if (next.has(rowId)) next.delete(rowId);
        else next.add(rowId);
        return next;
      });
    },
    [saving, insertedIds, rowKey],
  );

  // Bulk-delete the selected rows (drop inserted, stage-delete existing).
  const deleteSelected = useCallback(() => {
    if (saving) return;
    const ids = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    if (!ids.length) return;
    const idSet = new Set(ids);
    const insertedSelected = ids.filter((id) => insertedIds.has(id));
    if (insertedSelected.length) {
      const drop = new Set(insertedSelected);
      setDraft((prev) => prev.filter((r, i) => !drop.has(rowKey(r, i))));
      setInsertedIds((prev) => {
        const next = new Set(prev);
        drop.forEach((id) => next.delete(id));
        return next;
      });
    }
    setDeletedIds((prev) => {
      const next = new Set(prev);
      idSet.forEach((id) => {
        if (!insertedIds.has(id)) next.add(id);
      });
      return next;
    });
    setRowSelection({});
  }, [saving, rowSelection, insertedIds, rowKey]);

  const revertAll = useCallback(() => {
    if (saving) return;
    setDraft(data);
    setInsertedIds(new Set());
    setDeletedIds(new Set());
    setTouchedCells(new Set());
    setSubmitAttempted(false);
    setEditingCell(null);
    onRevert?.();
  }, [data, saving, onRevert]);

  const saveAll = useCallback(async () => {
    if (!dirty || saving) return;
    // Reveal any still-hidden validation errors (untouched required fields on a
    // new row) and abort — don't save with errors, but now show the user why.
    // The erroring cell can be off-screen (filtered out, on another page), so a
    // toast tells them how many there are and whether the view may be hiding
    // some, since the disabled-looking count alone is a dead end.
    if (errorCount > 0) {
      setSubmitAttempted(true);
      const mayBeHidden =
        columnFilters.length > 0 ||
        !!globalFilter ||
        (enablePagination && !virtualized && table.getPageCount() > 1);
      notifications.show({
        id: "grid-save-errors",
        color: "red",
        title: `${errorCount} cell${errorCount === 1 ? "" : "s"} need fixing`,
        message: mayBeHidden
          ? "Some may be hidden by the current filter, search, or page — clear them to see every error."
          : "Fix the highlighted cells, then save.",
      });
      return;
    }
    setEditingCell(null);
    const result = onSave?.(gridChanges);
    if (result instanceof Promise) {
      setSaving(true);
      try {
        await result;
        // Success: the parent updates `data`, which resyncs the draft via effect.
      } catch (e) {
        notifications.show({
          color: "red",
          message:
            e instanceof Error && e.message
              ? e.message
              : "Couldn't save changes",
        });
      } finally {
        setSaving(false);
      }
    }
  }, [
    gridChanges,
    dirty,
    errorCount,
    saving,
    onSave,
    columnFilters,
    globalFilter,
    enablePagination,
    virtualized,
    table,
  ]);

  // Single open header control (a `${colId}:menu` / `${colId}:filter` key, or
  // null) — controls every column's ⋮ menu and filter popover so only one can
  // be open at a time across all columns, and opening is fully deterministic.
  const [openControl, setOpenControl] = useState<string | null>(null);

  // ── Native-DnD column reordering ────────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const moveColumn = useCallback(
    (fromId: string, toId: string) =>
      setColumnOrder((prev) => {
        const order = prev.length ? [...prev] : columnIds.slice();
        const from = order.indexOf(fromId);
        const to = order.indexOf(toId);
        if (from < 0 || to < 0 || from === to) return prev;
        order.splice(to, 0, order.splice(from, 1)[0]);
        return order;
      }),
    [columnIds],
  );

  // ── Virtualization ──────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 8,
    enabled: virtualized,
  });
  const virtualRows = virtualized ? rowVirtualizer.getVirtualItems() : [];
  const paddingTop = virtualRows.length ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  // Virtualization (and the sticky header) need a bounded scroller height; if
  // one wasn't given while virtualizing, fall back to a default and warn.
  const effectiveMaxHeight =
    maxHeight ?? (virtualized ? DEFAULT_VIRTUAL_MAX_HEIGHT : undefined);
  useEffect(() => {
    if (virtualized && maxHeight == null) {
      console.warn(
        `[DataGrid] \`virtualized\` needs a bounded height but no \`maxHeight\` was provided — falling back to ${DEFAULT_VIRTUAL_MAX_HEIGHT}px. Set \`maxHeight\` to match your layout.`,
      );
    }
  }, [virtualized, maxHeight]);

  // Snapshot the current (filtered) rows across the visible, non-control
  // columns — the shared source for every export format.
  const getExportData = useCallback((): {
    headers: string[];
    rows: unknown[][];
  } => {
    const cols = table
      .getVisibleLeafColumns()
      .filter((c) => !isControlColumn(c.id));
    const headers = cols.map((c) => c.columnDef.meta?.label ?? c.id);
    const rows = table
      .getFilteredRowModel()
      .rows.filter((r) => !r.getIsGrouped())
      .map((r) => cols.map((c) => r.getValue(c.id) ?? ""));
    return { headers, rows };
  }, [table]);

  // A string title is used to label the Excel/print output; a ReactNode title
  // has no meaningful text form, so it's skipped there.
  const exportTitle = typeof title === "string" ? title : undefined;

  const onExport = useCallback(
    async (format: "csv" | "excel" | "json" | "print" | "clipboard") => {
      const { headers, rows } = getExportData();
      switch (format) {
        case "csv":
          downloadCsv(exportFileName, toCsv(headers, rows));
          break;
        case "excel":
          downloadExcel(exportFileName, headers, rows, exportTitle);
          break;
        case "json":
          downloadJson(exportFileName, headers, rows);
          break;
        case "print":
          printTable(headers, rows, exportTitle);
          break;
        case "clipboard": {
          const ok = await copyToClipboard(headers, rows);
          notifications.show(
            ok
              ? {
                  color: "teal",
                  message: `Copied ${rows.length} row${rows.length === 1 ? "" : "s"} to clipboard`,
                }
              : { color: "red", message: "Couldn't copy to clipboard" },
          );
          break;
        }
      }
    },
    [getExportData, exportFileName, exportTitle],
  );

  const colSpan = table.getVisibleLeafColumns().length;
  // Placeholder rows shown while `loading`; mirror the page size (capped).
  const skeletonRowCount =
    enablePagination && !virtualized ? Math.min(pageSize, 8) : 8;

  // ── Cell renderer (handles grouped / aggregated / placeholder cells) ──────
  const renderCell = (cell: Cell<T, unknown>) => {
    if (cell.getIsGrouped()) {
      return (
        <span className={classes.groupCell}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}{" "}
          <span className={classes.groupCount}>
            ({cell.row.subRows.length})
          </span>
        </span>
      );
    }
    if (cell.getIsAggregated()) {
      return flexRender(
        cell.column.columnDef.aggregatedCell ?? cell.column.columnDef.cell,
        cell.getContext(),
      );
    }
    if (cell.getIsPlaceholder()) return null;
    return flexRender(cell.column.columnDef.cell, cell.getContext());
  };

  // Tree mode: wrap the tree column's content with depth indentation plus an
  // expand/collapse toggle (a spacer keeps leaf-row content aligned).
  const renderTreeCell = (row: Row<T>, content: React.ReactNode) => (
    <span
      className={classes.treeCell}
      style={{ paddingInlineStart: row.depth * 16 }}
    >
      {row.getCanExpand() ? (
        <ActionIcon
          variant="subtle"
          color="gray"
          size="xs"
          className={classes.treeToggle}
          aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
          onClick={(e) => {
            e.stopPropagation();
            row.toggleExpanded();
          }}
        >
          <IconChevronRight
            size={14}
            style={{
              transition: "transform 120ms ease",
              transform: row.getIsExpanded() ? "rotate(90deg)" : "none",
            }}
          />
        </ActionIcon>
      ) : (
        <span className={classes.treeSpacer} />
      )}
      {content}
    </span>
  );

  // Render one cell's editor (custom `renderEditor` or the built-in EditableCell).
  const renderEditor = (cell: Cell<T, unknown>, row: Row<T>) => {
    const meta = cell.column.columnDef.meta;
    const colId = cell.column.id;
    const field = meta?.editField as keyof T | undefined;
    const value = cell.getValue();
    const error = visibleErrors[`${row.id}::${String(field)}`] ?? null;
    if (meta?.renderEditor) {
      return meta.renderEditor({
        row: row.original,
        value,
        setValue: (v) =>
          field != null && commitCell(row.id, field, meta.parseValue, v),
        error,
        columnId: colId,
      });
    }
    return (
      <EditableCell
        editor={meta?.editor ?? "text"}
        initialValue={value}
        options={meta?.editOptions}
        dateFormat={meta?.dateFormat}
        error={error}
        onCommit={(v) =>
          field != null && commitCell(row.id, field, meta?.parseValue, v)
        }
        onCancel={() => setEditingCell(null)}
      />
    );
  };

  // Trash / restore control for the DELETE_COL cell.
  const renderDeleteControl = (row: Row<T>, isDeleted: boolean) => {
    if (row.getIsGrouped()) return null;
    return (
      <Tooltip
        label={isDeleted ? "Restore row" : "Delete row"}
        withArrow
        openDelay={300}
      >
        <ActionIcon
          className={isDeleted ? undefined : classes.deleteBtn}
          size="sm"
          variant="subtle"
          color={isDeleted ? "gray" : "red"}
          aria-label={isDeleted ? "Restore row" : "Delete row"}
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            toggleDelete(row.id);
          }}
        >
          {isDeleted ? <IconArrowBackUp size={15} /> : <IconTrash size={15} />}
        </ActionIcon>
      </Tooltip>
    );
  };

  const renderBodyRow = (row: Row<T>, measure = false) => {
    const isGroup = row.getIsGrouped();
    const isDeleted = editingEnabled && deletedIds.has(row.id);
    const isInserted = editingEnabled && insertedIds.has(row.id);
    const clickable = !!onRowClick && !isGroup;

    return (
      <Table.Tr
        key={row.id}
        data-index={measure ? row.index : undefined}
        ref={measure ? rowVirtualizer.measureElement : undefined}
        className={cx(
          classes.row,
          highlightOnHover && classes.rowHover,
          striped && classes.rowStriped,
          row.getIsSelected() && classes.rowSelected,
          isGroup && classes.aggregated,
          isInserted && classes.rowInserted,
          isDeleted && classes.rowDeleted,
          clickable && classes.rowClickable,
        )}
        onClick={clickable ? () => onRowClick?.(row.original) : undefined}
      >
        {row.getVisibleCells().map((cell) => {
          const pin = pinProps(cell.column);
          const meta = cell.column.columnDef.meta;
          const colId = cell.column.id;

          if (colId === DELETE_COL) {
            return (
              <Table.Td
                key={cell.id}
                className={cx(classes.td, classes.controlCell, pin.className)}
                style={{ width: cell.column.getSize(), ...pin.style }}
                onClick={(e) => e.stopPropagation()}
              >
                {renderDeleteControl(row, isDeleted)}
              </Table.Td>
            );
          }

          const isGroupToggle = isGroup && cell.getIsGrouped();
          const cellEditable =
            editingEnabled && !!meta?.editable && !isGroup && !isDeleted;
          const isEditing =
            cellEditable &&
            editingCell?.rowId === row.id &&
            editingCell?.colId === colId;
          const field = meta?.editField as keyof T | undefined;
          // Inserted rows are already tinted whole-row, so skip the per-cell
          // dirty bar there — it only marks edits to existing rows.
          const isDirty =
            cellEditable &&
            !isInserted &&
            field != null &&
            baselineById.get(row.id)?.[field] !== cell.getValue();
          const hasError = !!visibleErrors[`${row.id}::${String(field)}`];

          const openEditor =
            cellEditable && !isEditing
              ? (e: React.MouseEvent) => {
                  e.stopPropagation();
                  setEditingCell({ rowId: row.id, colId });
                }
              : undefined;

          return (
            <Table.Td
              key={cell.id}
              className={cx(
                classes.td,
                isControlColumn(colId) && classes.controlCell,
                pin.className,
                isEditing && classes.editing,
                !isEditing && isDirty && classes.cellDirty,
                !isEditing && hasError && classes.cellError,
                cellEditable && !isEditing && classes.cellEditable,
              )}
              data-align={meta?.align}
              style={{ width: cell.column.getSize(), ...pin.style }}
              title={
                hasError
                  ? visibleErrors[`${row.id}::${String(field)}`]
                  : undefined
              }
              onClick={
                isGroupToggle
                  ? (e) => {
                      e.stopPropagation();
                      row.toggleExpanded();
                    }
                  : undefined
              }
              onDoubleClick={
                editTrigger === "doubleClick" ? openEditor : undefined
              }
              onClickCapture={editTrigger === "click" ? openEditor : undefined}
            >
              {useTree && colId === treeColId
                ? renderTreeCell(
                    row,
                    isEditing ? renderEditor(cell, row) : renderCell(cell),
                  )
                : isEditing
                  ? renderEditor(cell, row)
                  : renderCell(cell)}
            </Table.Td>
          );
        })}
      </Table.Tr>
    );
  };

  const renderDetailRow = (row: Row<T>) =>
    useExpansion && row.getIsExpanded() && !row.getIsGrouped() ? (
      <Table.Tr key={`${row.id}-detail`} className={classes.row}>
        <Table.Td colSpan={colSpan} className={classes.detailCell}>
          <div className={classes.detailInner}>
            {renderDetail?.(row.original)}
          </div>
        </Table.Td>
      </Table.Tr>
    ) : null;

  const hasData = rows.length > 0;

  return (
    <GridThemeContext.Provider value={themeCtx}>
      <div
        className={cx(
          classes.root,
          showColumnLines && classes.columnLines,
          className,
        )}
        data-mantine-color-scheme={paletteScheme}
        style={{
          ["--dg-cell-py" as string]: DENSITY_PY[density],
          ...(paletteScheme ? { colorScheme: paletteScheme } : {}),
          ...(paletteVars ?? {}),
        }}
      >
        {portalCss && <style>{portalCss}</style>}
        {(title != null ||
          enableGlobalFilter ||
          enableColumnVisibility ||
          enableExport ||
          toolbarActions ||
          sorting.length > 0 ||
          dirty ||
          (editingEnabled && !!createRow)) && (
          <GridToolbar
            table={table}
            title={title}
            enableGlobalFilter={enableGlobalFilter}
            globalFilter={globalFilter}
            onGlobalFilterChange={setGlobalFilter}
            enableColumnVisibility={enableColumnVisibility}
            enableExport={enableExport}
            onExport={onExport}
            sortCount={sorting.length}
            onClearSorting={() => setSorting([])}
            dirtyCount={dirtyCount}
            errorCount={visibleErrorCount}
            saving={saving}
            onSave={saveAll}
            onRevert={revertAll}
            showAddRow={editingEnabled && !!createRow}
            onAddRow={addRow}
            selectedCount={
              deleteEnabled
                ? Object.values(rowSelection).filter(Boolean).length
                : 0
            }
            onDeleteSelected={deleteSelected}
            actions={toolbarActions}
          />
        )}

        <div className={classes.frame}>
          <div
            ref={scrollRef}
            className={classes.scroll}
            style={{
              maxHeight: effectiveMaxHeight,
              overflowY: effectiveMaxHeight ? "auto" : undefined,
            }}
          >
            <Table
              className={cx(
                classes.table,
                stickyHeader && effectiveMaxHeight && classes.stickyHeader,
              )}
              style={{
                width: "100%",
                minWidth: table.getTotalSize(),
                tableLayout: "fixed",
              }}
            >
              <Table.Thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <Table.Tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) =>
                      header.subHeaders.length > 0 || header.isPlaceholder ? (
                        <GroupHeaderCell key={header.id} header={header} />
                      ) : (
                        <HeaderCell
                          key={header.id}
                          header={header}
                          enableReorder={enableColumnReordering}
                          enablePinning={enablePinning}
                          enableFilters={enableColumnFilters}
                          openControl={openControl}
                          onOpenControl={setOpenControl}
                          dragId={dragId}
                          overId={overId}
                          onDragStart={setDragId}
                          onDragEnter={setOverId}
                          onDrop={(from, to) => {
                            moveColumn(from, to);
                            setDragId(null);
                            setOverId(null);
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setOverId(null);
                          }}
                        />
                      ),
                    )}
                  </Table.Tr>
                ))}
              </Table.Thead>

              <Table.Tbody>
                {loading ? (
                  Array.from({ length: skeletonRowCount }).map((_, r) => (
                    <Table.Tr key={`skeleton-${r}`} className={classes.row}>
                      {table.getVisibleLeafColumns().map((column) => {
                        const pin = pinProps(column);
                        return (
                          <Table.Td
                            key={column.id}
                            className={cx(
                              classes.td,
                              isControlColumn(column.id) && classes.controlCell,
                              pin.className,
                            )}
                            style={{ width: column.getSize(), ...pin.style }}
                          >
                            <Skeleton height={12} radius="sm" />
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>
                  ))
                ) : !hasData ? (
                  <Table.Tr>
                    <Table.Td colSpan={colSpan}>
                      <Center className={classes.stateWrap}>
                        <Stack align="center" gap="xs">
                          <IconInbox size={28} opacity={0.5} />
                          <Text c="dimmed" fz="sm">
                            {emptyMessage}
                          </Text>
                        </Stack>
                      </Center>
                    </Table.Td>
                  </Table.Tr>
                ) : virtualized ? (
                  <>
                    {paddingTop > 0 && (
                      <Table.Tr>
                        <Table.Td
                          colSpan={colSpan}
                          style={{ height: paddingTop, padding: 0 }}
                        />
                      </Table.Tr>
                    )}
                    {virtualRows.map((vr) =>
                      renderBodyRow(rows[vr.index], true),
                    )}
                    {paddingBottom > 0 && (
                      <Table.Tr>
                        <Table.Td
                          colSpan={colSpan}
                          style={{ height: paddingBottom, padding: 0 }}
                        />
                      </Table.Tr>
                    )}
                  </>
                ) : (
                  rows.map((row) => (
                    <RowGroup key={row.id}>
                      {renderBodyRow(row)}
                      {renderDetailRow(row)}
                    </RowGroup>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </div>

          {enablePagination && !virtualized && hasData && (
            <div className={classes.footer}>
              <GridPagination
                table={table}
                pageSizeOptions={pageSizeOptions}
                totalRows={
                  table
                    .getFilteredRowModel()
                    .rows.filter((r) => !r.getIsGrouped()).length
                }
              />
            </div>
          )}
        </div>
      </div>
    </GridThemeContext.Provider>
  );
}

/** Fragment wrapper so a row + its detail row share one key. */
function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ── Group / placeholder header cell (spanning band, no controls) ────────────
function GroupHeaderCell<T>({ header }: { header: Header<T, unknown> }) {
  return (
    <Table.Th
      className={cx(classes.th, classes.groupHeader)}
      style={{ width: header.getSize() }}
      colSpan={header.colSpan}
    >
      {header.isPlaceholder ? null : (
        <div
          className={classes.thInner}
          data-align={header.column.columnDef.meta?.align ?? "center"}
        >
          <span>
            {flexRender(header.column.columnDef.header, header.getContext())}
          </span>
        </div>
      )}
    </Table.Th>
  );
}

// ── Header cell (sort + resize + native-DnD reorder + pinning) ──────────────
interface HeaderCellProps<T> {
  header: Header<T, unknown>;
  enableReorder: boolean;
  enablePinning: boolean;
  enableFilters: boolean;
  /** Currently-open header control key (`${colId}:menu|filter`) or null. */
  openControl: string | null;
  onOpenControl: React.Dispatch<React.SetStateAction<string | null>>;
  dragId: string | null;
  overId: string | null;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDrop: (fromId: string, toId: string) => void;
  onDragEnd: () => void;
}

function HeaderCell<T>({
  header,
  enableReorder,
  enablePinning,
  enableFilters,
  openControl,
  onOpenControl,
  dragId,
  overId,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
}: HeaderCellProps<T>) {
  const { column } = header;
  const { portalClassName } = useGridTheme();
  const canSort = column.getCanSort();
  const canResize = column.getCanResize();
  const sorted = column.getIsSorted();
  const reorderable = enableReorder && !isControlColumn(column.id);
  const canPin =
    enablePinning && column.getCanPin() && !isControlColumn(column.id);
  const canFilter =
    enableFilters && column.getCanFilter() && !isControlColumn(column.id);
  const pinned = column.getIsPinned();
  const filtered = column.getIsFiltered();
  const pin = pinProps(column);
  // The header ⋮ menu offers sort actions (any sortable column), filter access
  // (opens the filter popover), and, when enabled, pin actions.
  const showMenu = canSort || canPin || canFilter;
  const showSortBadge = !!sorted;
  // Controlled open-state keys (shared across all columns → one open at a time).
  const menuKey = `${column.id}:menu`;
  const filterKey = `${column.id}:filter`;

  // Pinning reorders the columns, which moves this header's DOM node. Doing that
  // while the (portaled) menu is still open leaves the dropdown orphaned — stuck
  // open and deaf to outside clicks. So close the menu first, then apply the
  // reorder on the next frame once the dropdown has unmounted.
  const pinAndClose = (side: "left" | "right" | false) => {
    onOpenControl(null);
    requestAnimationFrame(() => column.pin(side));
  };

  const SortIcon =
    sorted === "asc"
      ? IconChevronUp
      : sorted === "desc"
        ? IconChevronDown
        : IconSelector;

  return (
    <Table.Th
      className={cx(
        classes.th,
        pin.className,
        dragId === column.id && classes.dragging,
        reorderable &&
          overId === column.id &&
          dragId &&
          dragId !== column.id &&
          classes.dropTarget,
      )}
      style={{ width: header.getSize(), ...pin.style }}
      colSpan={header.colSpan}
    >
      <div
        className={cx(
          classes.thInner,
          canSort && classes.sortable,
          reorderable && classes.draggable,
        )}
        data-align={column.columnDef.meta?.align}
        draggable={reorderable}
        onClick={canSort ? column.getToggleSortingHandler() : undefined}
        onDragStart={reorderable ? () => onDragStart(column.id) : undefined}
        onDragEnter={reorderable ? () => onDragEnter(column.id) : undefined}
        onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
        onDrop={
          reorderable
            ? (e) => {
                e.preventDefault();
                if (dragId && dragId !== column.id) onDrop(dragId, column.id);
              }
            : undefined
        }
        onDragEnd={reorderable ? onDragEnd : undefined}
      >
        {header.isPlaceholder ? null : (
          <span>
            {flexRender(column.columnDef.header, header.getContext())}
          </span>
        )}
        {canSort && (
          <span className={classes.sortWrap}>
            <SortIcon
              size={14}
              className={cx(classes.sortIcon, sorted && classes.sortIconActive)}
            />
            {showSortBadge && (
              <span className={classes.sortBadge}>
                {column.getSortIndex() + 1}
              </span>
            )}
          </span>
        )}
        {showMenu && (
          // Wrapper stops the click/drag bubbling to the sortable/draggable header.
          <span
            className={classes.headerActions}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {canFilter && (
              // Controlled, no visible trigger — opened from the ⋮ menu's
              // "Filter" item and anchored to an invisible box over the actions
              // so it drops beneath the ⋮ button.
              <Popover
                opened={openControl === filterKey}
                onChange={(o) =>
                  onOpenControl((cur) =>
                    o ? filterKey : cur === filterKey ? null : cur,
                  )
                }
                position="bottom-end"
                withinPortal
                shadow="md"
                width={244}
                trapFocus
                classNames={{ dropdown: portalClassName }}
              >
                <Popover.Target>
                  <span aria-hidden className={classes.filterAnchor} />
                </Popover.Target>
                <Popover.Dropdown onClick={(e) => e.stopPropagation()}>
                  <Stack gap="xs">
                    <ColumnFilter column={column} />
                    {filtered && (
                      <Button
                        variant="subtle"
                        color="gray"
                        size="compact-xs"
                        leftSection={<IconFilterOff size={13} />}
                        onClick={() => column.setFilterValue(undefined)}
                      >
                        Clear filter
                      </Button>
                    )}
                  </Stack>
                </Popover.Dropdown>
              </Popover>
            )}
            {showMenu && (
              <Menu
                shadow="md"
                position="bottom-end"
                withinPortal
                classNames={{ dropdown: portalClassName }}
                opened={openControl === menuKey}
                onChange={(o) =>
                  onOpenControl((cur) =>
                    o ? menuKey : cur === menuKey ? null : cur,
                  )
                }
              >
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="xs"
                    aria-label="Column options"
                    className={cx(
                      classes.headerMenuBtn,
                      (pinned || sorted || filtered) &&
                        classes.headerMenuBtnActive,
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {pinned ? (
                      <IconPinned size={13} />
                    ) : (
                      <IconDotsVertical size={13} />
                    )}
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {canSort && (
                    <>
                      <Menu.Label>Sort</Menu.Label>
                      <Menu.Item
                        leftSection={<IconSortAscending size={14} />}
                        disabled={sorted === "asc"}
                        onClick={() => column.toggleSorting(false)}
                      >
                        Sort ascending
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconSortDescending size={14} />}
                        disabled={sorted === "desc"}
                        onClick={() => column.toggleSorting(true)}
                      >
                        Sort descending
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconArrowsSort size={14} />}
                        disabled={!sorted}
                        onClick={() => column.clearSorting()}
                      >
                        Clear sort
                      </Menu.Item>
                    </>
                  )}
                  {canPin && (
                    <>
                      {canSort && <Menu.Divider />}
                      <Menu.Label>Pin column</Menu.Label>
                      <Menu.Item
                        leftSection={<IconArrowBarToLeft size={14} />}
                        disabled={pinned === "left"}
                        onClick={() => pinAndClose("left")}
                      >
                        Pin left
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconArrowBarToRight size={14} />}
                        disabled={pinned === "right"}
                        onClick={() => pinAndClose("right")}
                      >
                        Pin right
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconPinnedOff size={14} />}
                        disabled={!pinned}
                        onClick={() => pinAndClose(false)}
                      >
                        Unpin
                      </Menu.Item>
                    </>
                  )}
                  {canFilter && (
                    <>
                      {(canSort || canPin) && <Menu.Divider />}
                      <Menu.Label>Filter</Menu.Label>
                      <Menu.Item
                        leftSection={
                          filtered ? (
                            <IconFilterFilled size={14} />
                          ) : (
                            <IconFilter size={14} />
                          )
                        }
                        onClick={() => onOpenControl(filterKey)}
                      >
                        {filtered ? "Edit filter" : "Filter"}
                      </Menu.Item>
                      {filtered && (
                        <Menu.Item
                          leftSection={<IconFilterOff size={14} />}
                          onClick={() => column.setFilterValue(undefined)}
                        >
                          Clear filter
                        </Menu.Item>
                      )}
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </span>
        )}
      </div>
      {canResize && (
        <div
          className={cx(
            classes.resizer,
            column.getIsResizing() && classes.resizerActive,
          )}
          onMouseDown={header.getResizeHandler()}
          onTouchStart={header.getResizeHandler()}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </Table.Th>
  );
}
