import { Group, Pagination, Select, Text } from '@mantine/core';
import type { Table } from '@tanstack/react-table';
import { useGridTheme } from '../helper/gridTheme';

interface GridPaginationProps<T> {
  table: Table<T>;
  pageSizeOptions: number[];
  /** Total rows after filtering (for the "x–y of z" label). */
  totalRows: number;
}

/** Footer with a row-count summary, page-size picker and page controls. */
export function GridPagination<T>({ table, pageSizeOptions, totalRows }: GridPaginationProps<T>) {
  const { portalClassName } = useGridTheme();
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  const from = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="sm" w="100%">
      <Group gap="xs" align="center">
        <Text fz="sm" c="dimmed">
          {from}–{to} of {totalRows}
        </Text>
        <Select
          size="xs"
          w={110}
          aria-label="Rows per page"
          data={pageSizeOptions.map((n) => ({ value: String(n), label: `${n} / page` }))}
          value={String(pageSize)}
          onChange={(v) => v && table.setPageSize(Number(v))}
          comboboxProps={{ withinPortal: true, classNames: { dropdown: portalClassName } }}
          allowDeselect={false}
        />
      </Group>
      <Pagination
        size="sm"
        total={pageCount}
        value={pageIndex + 1}
        onChange={(p) => table.setPageIndex(p - 1)}
        withEdges
      />
    </Group>
  );
}
