import { ActionIcon, Checkbox } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import type {
  AccessorFn,
  CellContext,
  ColumnDef,
  FilterFn,
} from "@tanstack/react-table";
import dayjs from "dayjs";
import type { GridColumn, GridColumnNode } from "./types";
import { isColumnGroup } from "./types";

/** Fallback dayjs format for date columns when a column sets no `dateFormat`. */
export const DEFAULT_DATE_FORMAT = "MMM D, YYYY";

/**
 * Multi-select column filter: the filter value is an array of chosen options;
 * a row is kept when its (stringified) value equals any selection. An empty or
 * absent selection matches everything (the filter is cleared).
 */
const multiSelectFilter: FilterFn<unknown> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue) || filterValue.length === 0) return true;
  return filterValue.includes(String(row.getValue(columnId)));
};

const dayStart = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayEnd = (d: Date) =>
  new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();

/**
 * Date-range column filter: the filter value is `[start, end]` (either bound may
 * be null for an open-ended range). A row is kept when its date value falls
 * within the range, compared day-inclusively (start-of-day … end-of-day).
 * Non-date / empty cell values are excluded once a range is set.
 */
const dateRangeFilter: FilterFn<unknown> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue)) return true;
  const [start, end] = filterValue as [unknown, unknown];
  if (start == null && end == null) return true;
  const raw = row.getValue(columnId);
  if (raw == null || raw === "") return false;
  const t = new Date(raw as string | number | Date).getTime();
  if (Number.isNaN(t)) return false;
  if (start != null) {
    const s = new Date(start as string | number | Date);
    if (!Number.isNaN(s.getTime()) && t < dayStart(s)) return false;
  }
  if (end != null) {
    const e = new Date(end as string | number | Date);
    if (!Number.isNaN(e.getTime()) && t > dayEnd(e)) return false;
  }
  return true;
};

export interface BuildColumnsOptions<T> {
  enableSelection: boolean;
  /** Header checkbox scope: 'all' filtered rows (default) or current 'page'. */
  selectAllScope: "all" | "page";
  enableRowExpansion: boolean;
  hasActions: boolean;
  rowActions?: (row: T) => React.ReactNode;
  /** Append the delete/restore control column (rendered by DataGrid). */
  enableDelete: boolean;
  /** Tree mode: id of the column carrying the expand toggle + indentation. It's
   *  forced non-hideable, since hiding it would remove the only expand control. */
  treeColumnId?: string;
}

/** Internal ids for the framework-managed columns. */
export const SELECT_COL = "__select__";
export const EXPAND_COL = "__expand__";
export const ACTIONS_COL = "__actions__";
export const DELETE_COL = "__delete__";
const CONTROL_COLS = new Set([SELECT_COL, EXPAND_COL, ACTIONS_COL, DELETE_COL]);

export const isControlColumn = (id: string) => CONTROL_COLS.has(id);

/** Resolves the stable column id used everywhere (state keys, pinning, order). */
export const columnId = <T,>(col: GridColumn<T>, index: number): string => {
  if (col.id) return col.id;
  if (typeof col.accessor === "string") return col.accessor;
  return `col_${index}`;
};

const resolveId = columnId;

/** Plain-text label for a column (visibility menu + CSV export headers). */
export const columnLabel = <T,>(col: GridColumn<T>, index: number): string => {
  if (col.headerLabel) return col.headerLabel;
  if (typeof col.header === "string") return col.header;
  return resolveId(col, index);
};

/**
 * Flattens a (possibly grouped) column schema to its leaf columns, each paired
 * with a stable depth-first index — the same index `buildColumns` uses to mint
 * ids, so `columnId(col, index)` matches across pinning/editing/reorder logic.
 */
export function flattenColumns<T>(
  nodes: GridColumnNode<T>[],
): { col: GridColumn<T>; index: number }[] {
  const out: { col: GridColumn<T>; index: number }[] = [];
  let index = 0;
  const walk = (list: GridColumnNode<T>[]) => {
    for (const node of list) {
      if (isColumnGroup(node)) walk(node.columns);
      else out.push({ col: node, index: index++ });
    }
  };
  walk(nodes);
  return out;
}

/** Compiles a single leaf `GridColumn<T>` into a TanStack `ColumnDef`. */
function buildLeaf<T>(
  col: GridColumn<T>,
  index: number,
): ColumnDef<T, unknown> {
  const id = resolveId(col, index);
  const filterType = col.filter && col.filter !== "none" ? col.filter : "text";
  // Resolve editing metadata. The editor writes to `editField` — a string
  // accessor key, or an explicit `field` for function accessors.
  const editField =
    typeof col.accessor === "string" ? (col.accessor as keyof T) : col.field;
  const editor =
    col.editor ??
    (filterType === "number"
      ? "number"
      : filterType === "select"
        ? "select"
        : filterType === "date"
          ? "date"
          : "text");
  // Built as a loose record: TanStack's ColumnDef is a union (accessor vs
  // display members) that can't be assembled field-by-field without fighting
  // the types, so we build here and cast once on return.
  const def: Record<string, unknown> = {
    id,
    header: col.header ?? columnLabel(col, index),
    enableSorting: col.enableSorting ?? true,
    enableResizing: col.enableResizing ?? true,
    enableHiding: col.enableHiding ?? true,
    enablePinning: col.enablePinning ?? true,
    enableColumnFilter: col.filter !== false && col.filter !== "none",
    // 'select' matches any chosen value (multi-select), 'number' filters a
    // [min,max] range, 'text' does substring matching.
    filterFn:
      filterType === "select"
        ? multiSelectFilter
        : filterType === "number"
          ? "inNumberRange"
          : filterType === "date"
            ? dateRangeFilter
            : "includesString",
    meta: {
      align: col.align,
      filterType,
      filterOptions: col.filterOptions,
      dateFormat: col.dateFormat,
      label: columnLabel(col, index),
      // Only truly editable when a target field is resolvable (or a custom
      // editor is supplied).
      editable: !!col.editable && (editField != null || !!col.renderEditor),
      editor,
      editOptions: col.editOptions ?? col.filterOptions,
      editField,
      validate: col.validate,
      parseValue: col.parseValue,
      renderEditor: col.renderEditor,
    },
  };

  // Accessor: string key → accessorKey, function → accessorFn.
  if (typeof col.accessor === "function") {
    def.accessorFn = col.accessor as AccessorFn<T, unknown>;
  } else if (typeof col.accessor === "string") {
    def.accessorKey = col.accessor;
  }

  if (col.width != null) def.size = col.width;
  if (col.minWidth != null) def.minSize = col.minWidth;
  if (col.maxWidth != null) def.maxSize = col.maxWidth;

  if (col.render) {
    const render = col.render;
    def.cell = ({ getValue, row }: CellContext<T, unknown>) =>
      render(getValue(), row.original);
  } else if (filterType === "date") {
    // Default date columns to a formatted display driven by `dateFormat`, so the
    // format set on the column governs the cell too (not just the picker).
    const fmt = col.dateFormat ?? DEFAULT_DATE_FORMAT;
    def.cell = ({ getValue }: CellContext<T, unknown>) => {
      const v = getValue();
      if (v == null || v === "") return "";
      const d = dayjs(v as string | number | Date);
      return d.isValid() ? d.format(fmt) : String(v);
    };
  }

  if (col.aggregate) {
    def.aggregationFn = col.aggregate;
    if (col.renderAggregated) {
      const renderAgg = col.renderAggregated;
      def.aggregatedCell = ({ getValue, row }: CellContext<T, unknown>) =>
        renderAgg(getValue(), row);
    }
  }

  // Escape hatch — raw ColumnDef props win.
  if (col.columnDef) Object.assign(def, col.columnDef);

  return def as unknown as ColumnDef<T, unknown>;
}

/**
 * Compiles the friendly `GridColumnNode<T>[]` schema into TanStack `ColumnDef`s,
 * prepending the selection / expand columns and appending the actions column
 * when those features are enabled. Header groups become spanning group columns
 * (multi-level headers); leaf columns are numbered depth-first so their ids
 * match `flattenColumns`.
 */
export function buildColumns<T>(
  columns: GridColumnNode<T>[],
  opts: BuildColumnsOptions<T>,
): ColumnDef<T, unknown>[] {
  const defs: ColumnDef<T, unknown>[] = [];

  if (opts.enableSelection) {
    const allScope = opts.selectAllScope !== "page";
    defs.push({
      id: SELECT_COL,
      size: 44,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      enableColumnFilter: false,
      header: ({ table }) => (
        <Checkbox
          size="xs"
          aria-label={
            allScope ? "Select all rows" : "Select all rows on this page"
          }
          checked={
            allScope
              ? table.getIsAllRowsSelected()
              : table.getIsAllPageRowsSelected()
          }
          indeterminate={
            allScope
              ? table.getIsSomeRowsSelected()
              : table.getIsSomePageRowsSelected()
          }
          onChange={
            allScope
              ? table.getToggleAllRowsSelectedHandler()
              : table.getToggleAllPageRowsSelectedHandler()
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          size="xs"
          aria-label="Select row"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          indeterminate={row.getIsSomeSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    });
  }

  if (opts.enableRowExpansion) {
    defs.push({
      id: EXPAND_COL,
      size: 40,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      enableColumnFilter: false,
      header: () => null,
      cell: ({ row }) =>
        row.getCanExpand() ? (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
            onClick={(e) => {
              e.stopPropagation();
              row.toggleExpanded();
            }}
          >
            <IconChevronRight
              size={16}
              style={{
                transition: "transform 120ms ease",
                transform: row.getIsExpanded() ? "rotate(90deg)" : "none",
              }}
            />
          </ActionIcon>
        ) : null,
    });
  }

  // Walk the schema depth-first: leaves are numbered (ids match flattenColumns),
  // groups become spanning group columns whose `columns` are built recursively.
  let leafIndex = 0;
  let groupIndex = 0;
  const buildNode = (node: GridColumnNode<T>): ColumnDef<T, unknown> => {
    if (isColumnGroup(node)) {
      const groupDef: Record<string, unknown> = {
        id: node.id ?? `group_${groupIndex++}`,
        header: node.header,
        columns: node.columns.map(buildNode),
        meta: { align: node.align ?? "center", label: node.headerLabel },
      };
      return groupDef as unknown as ColumnDef<T, unknown>;
    }
    const def = buildLeaf(node, leafIndex++);
    // Tree mode: the expand toggle + indentation live only on this column, so
    // it must stay visible — hiding it would strip every toggle and leave rows
    // stuck in their current expand state.
    if (opts.treeColumnId && def.id === opts.treeColumnId) {
      (def as { enableHiding?: boolean }).enableHiding = false;
    }
    return def;
  };
  columns.forEach((node) => defs.push(buildNode(node)));

  if (opts.hasActions && opts.rowActions) {
    const rowActions = opts.rowActions;
    defs.push({
      id: ACTIONS_COL,
      size: 64,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      enableColumnFilter: false,
      header: () => null,
      cell: ({ row }) => rowActions(row.original),
    });
  }

  if (opts.enableDelete) {
    // Placeholder; the trash/restore cell is rendered by DataGrid so it can
    // reach the delete state + handlers.
    defs.push({
      id: DELETE_COL,
      size: 48,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      enableColumnFilter: false,
      enablePinning: false,
      header: () => null,
    });
  }

  return defs;
}
