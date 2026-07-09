# @ved_patel/react-datagrid

A powerful, fully **client-side** React data grid built on
[`@tanstack/react-table`](https://tanstack.com/table) +
[`@tanstack/react-virtual`](https://tanstack.com/virtual), rendered with
[Mantine](https://mantine.dev). Feed it `data` + a friendly `columns` schema and
opt into features via props. Theme-aware (dark/light) out of the box.

Multi-sort · fuzzy global search · per-column filters (text / multi-select /
number-range / date-range) · grouping + aggregation · tree / hierarchical rows ·
banded (multi-level) headers · inline batch editing (add / edit / delete → single
Save) · row virtualization · column pinning / reorder / resize / show-hide · row
selection · expandable detail rows · export (CSV / Excel / JSON / print /
clipboard).

## Installation

```bash
npm install @ved_patel/react-datagrid
```

Because it renders Mantine components, install the peer dependencies too (skip
any you already have):

```bash
npm install react react-dom \
  @mantine/core @mantine/dates @mantine/notifications \
  @tabler/icons-react dayjs \
  @tanstack/react-table @tanstack/react-virtual @tanstack/match-sorter-utils
```

## Setup

**1. Import the stylesheet once** (e.g. in your app entry):

```ts
import "@ved_patel/react-datagrid/styles.css";
```

**2. Wrap your app in Mantine's providers.** `MantineProvider` is required;
`Notifications` is needed for the "Copy to clipboard" export toast:

```tsx
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";

export function Root() {
  return (
    <MantineProvider defaultColorScheme="dark">
      <Notifications />
      {/* your app */}
    </MantineProvider>
  );
}
```

Then import the grid anywhere:

```tsx
import { DataGrid } from "@ved_patel/react-datagrid";
import type { GridColumnNode } from "@ved_patel/react-datagrid";
```

---

## Quick start

```tsx
type User = {
  id: string;
  name: string;
  email: string;
  age: number;
  joined: string;
};

const columns: GridColumnNode<User>[] = [
  { accessor: "name", header: "Name" },
  { accessor: "email", header: "Email" },
  { accessor: "age", header: "Age", align: "right", filter: "number" },
  { accessor: "joined", header: "Joined", filter: "date" },
];

<DataGrid<User>
  data={users}
  columns={columns}
  getRowId={(u) => u.id}
  title="Users"
/>;
```

> **Always provide `getRowId`** when using selection, expansion, or editing — it
> keeps row identity stable across sorting/paging.

---

## Column schema (`GridColumnNode<T>`)

Each entry is **either** a leaf column (`GridColumn<T>`) **or** a header group
(`GridColumnGroup<T>`, for banded/multi-level headers).

### Leaf column (`GridColumn<T>`)

| Field                                                                 | Purpose                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `accessor`                                                            | `keyof T` (object key) **or** `(row) => value` function.                                                 |
| `id`                                                                  | Stable id; defaults to the string `accessor`. Required for function accessors used with editing/pinning. |
| `header`                                                              | Header content (string or node).                                                                         |
| `headerLabel`                                                         | Plain-text label used by the visibility menu / export when `header` is a node.                           |
| `render`                                                              | `(value, row) => ReactNode` custom cell renderer.                                                        |
| `align`                                                               | `'left' \| 'center' \| 'right'`.                                                                         |
| `width` / `minWidth` / `maxWidth`                                     | Column sizing in px.                                                                                     |
| `enableSorting` / `enableResizing` / `enableHiding` / `enablePinning` | Per-column feature opt-outs (default `true`).                                                            |
| `pinned`                                                              | `'left' \| 'right'` — pin declaratively.                                                                 |
| `filter`                                                              | `'text' \| 'select' \| 'number' \| 'date' \| false`.                                                     |
| `filterOptions`                                                       | `{ value, label }[]` for a `'select'` filter (auto-derived from data if omitted).                        |
| `dateFormat`                                                          | dayjs token for date columns (drives cell display, picker, editor). Default `'MMM D, YYYY'`.             |
| `aggregate`                                                           | `'sum' \| 'count' \| 'min' \| 'max' \| 'mean' \| 'extent' \| 'unique' \| 'uniqueCount'` (for grouping).  |
| `renderAggregated`                                                    | Renderer for the aggregated value in a group row.                                                        |
| `editable`                                                            | Make the column editable (needs grid `enableEditing`).                                                   |
| `editor`                                                              | `'text' \| 'number' \| 'select' \| 'checkbox' \| 'date'` (inferred from `filter` if omitted).            |
| `editOptions`                                                         | Options for a `'select'` editor (falls back to `filterOptions`).                                         |
| `field`                                                               | Field the editor writes to when `accessor` is a function.                                                |
| `validate`                                                            | `(value, row) => string \| null` — a message blocks the commit.                                          |
| `parseValue`                                                          | Coerce the raw editor value before validate/commit.                                                      |
| `renderEditor`                                                        | Full custom-editor escape hatch (`EditContext<T>`).                                                      |
| `columnDef`                                                           | Raw TanStack `ColumnDef` partial, merged last (wins).                                                    |

### Header group (`GridColumnGroup<T>`) — banded headers

```tsx
const columns: GridColumnNode<User>[] = [
  { accessor: "name", header: "Name" },
  {
    header: "Contact", // spanning band
    columns: [
      { accessor: "email", header: "Email" },
      { accessor: "phone", header: "Phone" },
    ],
  },
];
```

Groups are nestable and carry no data. Sort/resize/filter still work per leaf;
standalone leaves span the header rows.

---

## `DataGrid` props

### Core

| Prop                           | Default | Notes                                                        |
| ------------------------------ | ------- | ------------------------------------------------------------ |
| `data: T[]`                    | —       | Row data.                                                    |
| `columns`                      | —       | The schema above.                                            |
| `getRowId`                     | index   | Strongly recommended with selection/expansion/editing.       |
| `enableGlobalFilter`           | `true`  | Fuzzy (typo-tolerant) toolbar search.                        |
| `enableColumnFilters`          | `false` | Per-column filters, opened from each column's ⋮ header menu. |
| `enablePagination`             | `true`  | Ignored when `virtualized`.                                  |
| `pageSize` / `pageSizeOptions` | —       | Page controls.                                               |

### Column controls

| Prop                                      | Notes                                                              |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `enableColumnResizing`                    | Drag column edges.                                                 |
| `enableColumnReordering`                  | Native HTML5 drag-reorder.                                         |
| `enableColumnVisibility` (default `true`) | Toolbar show/hide menu.                                            |
| `enablePinning`                           | Per-column header ⋮ pin/unpin (declarative `pinned` always works). |
| `showColumnLines` (default `true`)        | Vertical separators.                                               |

### Row features

| Prop                   | Notes                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `enableRowSelection`   | `boolean \| (row) => boolean`.                                                       |
| `selectAllScope`       | `'all'` (default — every filtered row across pages) or `'page'` (current page only). |
| `onRowSelectionChange` | `(rows: T[]) => void`.                                                               |
| `renderDetail`         | `(row) => ReactNode` expandable detail panel.                                        |
| `rowActions`           | `(row) => ReactNode` trailing actions cell.                                          |
| `onRowClick`           | `(row) => void`.                                                                     |

### Inline editing (batch)

| Prop              | Notes                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `enableEditing`   | Turn on inline editing for `editable` columns. Edits stage into a draft.                                                      |
| `editTrigger`     | `'doubleClick'` (default) or `'click'`.                                                                                       |
| `createRow`       | `() => T` — shows an "Add row" button (prepends + focuses). Must set a unique id.                                             |
| `enableRowDelete` | Per-row trash/restore + bulk "Delete selected".                                                                               |
| `onSave`          | `(changes: GridChanges<T>) => void \| Promise<void>` — fired once on Save. Return a Promise for spinner + rollback-on-reject. |
| `onRevert`        | Fired when the user discards all pending edits.                                                                               |

```ts
GridChanges<T>    = GridChange<T>[];              // flat, per-row
GridChange<T>     = T & { action: GridChangeAction };
GridChangeAction  = 'insert' | 'update' | 'delete';
```

Each entry is a row spread with an `action` tag. Update rows carry the final
(post-edit) values; delete rows carry the original.

### Data ops

| Prop                | Notes                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `virtualized`       | Row virtualization (replaces pagination; detail / grouping / tree disabled).                                                                        |
| `estimateRowHeight` | Row-height estimate for the virtualizer.                                                                                                            |
| `maxHeight`         | Scroller max height. Required for the sticky header; for `virtualized` it defaults to `400px` (with a console warning) — set it to fit your layout. |
| `enableExport`      | Toolbar menu: Copy to clipboard (TSV), CSV, Excel (`.xls`), JSON, Print.                                                                            |
| `exportFileName`    | Base filename for downloads.                                                                                                                        |
| `grouping`          | `string[]` of column ids to group by (pair with column `aggregate`).                                                                                |

### Tree / hierarchical data

| Prop              | Notes                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSubRows`      | `(row) => T[] \| undefined` — return a row's children to enable **tree mode** (nested expandable rows). Distinct from grouping/detail and mutually exclusive with both; ignored when `virtualized`. |
| `treeColumnId`    | Column id carrying the expand toggle + indentation (default: first data column). Forced non-hideable so the toggle stays reachable.                                                                 |
| `defaultExpanded` | Start with all tree rows expanded (default: collapsed).                                                                                                                                             |

### Presentation

`title`, `toolbarActions`, `loading` (skeletons), `emptyMessage`, `striped`,
`highlightOnHover`, `stickyHeader`, `density` (`'compact' \| 'normal' \|
'comfortable'`), `className`, `palette` (re-skin to a template palette — see below).

### Theming with `palette`

The `palette` prop re-skins the **entire** grid — both its own chrome (header,
rows, borders, accent bar) and the embedded Mantine widgets (search box, `Select`
editors, checkboxes, menus, buttons, badges) — to match a color palette. When
omitted, the grid follows the app's Mantine theme as usual.

`palette` is a `GridPalette` object. Every key is optional; any key you omit
falls back to the current theme, so a partial palette still themes what it can:

| Key              | Themes                                                            |
| ---------------- | ----------------------------------------------------------------- |
| `bg_page`        | Page background (also used to detect light vs. dark).             |
| `bg_card`        | Grid surface / body background.                                   |
| `bg_surface`     | Header + alternate surfaces.                                      |
| `bg_hover`       | Row and control hover state.                                      |
| `border`         | Borders and dividers.                                             |
| `primary`        | Accent / brand color (accent bar, filled + light buttons, links). |
| `text_primary`   | Primary text.                                                     |
| `text_secondary` | Dimmed / secondary text and placeholders.                         |
| `success`        | Success state.                                                    |
| `error`          | Error state.                                                      |
| `warning`        | Warning state.                                                    |

The grid's **light/dark scheme is forced** to match the palette (derived from the
luminance of `bg_page`/`bg_card`), regardless of the app's own theme — so a dark
palette renders a dark grid even inside a light app.

```tsx
<DataGrid<User>
  data={users}
  columns={columns}
  palette={{
    bg_page: "#0f1117",
    bg_card: "#171a21",
    bg_surface: "#1e2230",
    bg_hover: "#232838",
    border: "#2c3242",
    primary: "#6366f1",
    text_primary: "#e5e7eb",
    text_secondary: "#9ca3af",
  }}
/>
```

> The palette shape matches the `preview` object shipped with each generated-app
> UI theme, so a template's preview can be passed straight through as `palette`.

---

## Recipes

### Selection + delete + save

```tsx
<DataGrid<User>
  data={users}
  columns={columns}
  getRowId={(u) => u.id}
  enableRowSelection
  selectAllScope="all"
  enableEditing
  enableRowDelete
  createRow={() => ({
    id: crypto.randomUUID(),
    name: "",
    email: "",
    age: 0,
    joined: "",
  })}
  onSave={async (changes) => {
    // changes is a flat list of { action, ...row } — send it as-is, or split:
    // const inserts = changes.filter((c) => c.action === 'insert');
    // const updates = changes.filter((c) => c.action === 'update');
    // const deletes = changes.filter((c) => c.action === 'delete');
    await api.bulkPersist(changes);
    setUsers(next); // resync data so the draft clears
  }}
/>
```

### Editable column with validation

```tsx
{
  accessor: 'email',
  header: 'Email',
  editable: true,
  editor: 'text',
  validate: (v) => (String(v).includes('@') ? null : 'Invalid email'),
}
```

### Filters + export + grouping

```tsx
<DataGrid<Order>
  data={orders}
  columns={cols}
  getRowId={(o) => o.id}
  enableColumnFilters
  enableExport
  exportFileName="orders"
  grouping={["status"]} // pair with a column { accessor: 'total', aggregate: 'sum' }
/>
```

### Virtualized large dataset

```tsx
<DataGrid
  data={rows}
  columns={cols}
  getRowId={(r) => r.id}
  virtualized
  maxHeight={600}
  estimateRowHeight={44}
/>
```

### Tree / hierarchical data

Nest rows by returning each row's children from `getSubRows`. The expand toggle
and indentation render on `treeColumnId` (defaults to the first data column);
every other column stays flat. This is distinct from grouping (synthetic buckets)
and detail rows (a panel under a row), and mutually exclusive with both.

```tsx
type OrgNode = { id: string; name: string; title: string; reports?: OrgNode[] };

<DataGrid<OrgNode>
  data={org}
  columns={cols}
  getRowId={(n) => n.id}
  getSubRows={(n) => n.reports} // ← enables tree mode
  treeColumnId="name" // where the toggle + indent live (optional)
  defaultExpanded // start expanded (optional)
/>;
```

> Inline editing (`enableEditing` / `createRow` / `enableRowDelete`) is flat-data
> only and is **disabled in tree mode**.

---

## Gotchas

- **`getRowId` is essential** for selection/editing — without it, edits/selection
  key off array index and break on sort/filter.
- **Virtualization disables** pagination, detail rows, grouping, and tree mode.
- **Tree mode disables inline editing** (add/edit/delete are flat-data only) and
  can't be combined with grouping or detail rows.
- **Hiding a filtered column clears its filter**, so it can't silently narrow the
  data with no visible control to clear it. The tree toggle column can't be hidden.
- **`selectAllScope` has no effect without pagination** — page == all.
- **Excel export** produces an `.xls` HTML table; Excel may show a one-time
  format-vs-extension prompt (a true `.xlsx` would need a zip lib, which is
  disallowed).
- **Custom editors** for function accessors must set `field` so the grid knows
  where to write.
