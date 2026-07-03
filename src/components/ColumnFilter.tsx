import { useMemo } from 'react';
import { Group, MultiSelect, NumberInput, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconFilter } from '@tabler/icons-react';
import type { Column } from '@tanstack/react-table';
import { useGridTheme } from '../helper/gridTheme';
import { DEFAULT_DATE_FORMAT } from './buildColumns';

type NumberRange = [number | undefined, number | undefined];

/**
 * Compact per-column filter control rendered in the filter header row. The
 * control type comes from `column.meta.filterType`:
 *  - 'text'   → substring TextInput
 *  - 'select' → multi-select (options from `meta.filterOptions` or faceted
 *               values); a row matches when its value equals any selection
 *  - 'number' → a min/max range (two NumberInputs; empty = open-ended)
 *  - 'date'   → a start/end date range (DatePickerInput; either bound optional)
 */
export function ColumnFilter<T>({ column }: { column: Column<T, unknown> }) {
  const type = column.columnDef.meta?.filterType ?? 'text';
  const value = column.getFilterValue();
  const { portalClassName } = useGridTheme();

  const selectData = useMemo(() => {
    if (type !== 'select') return [];
    const preset = column.columnDef.meta?.filterOptions;
    if (preset) return preset;
    return Array.from(column.getFacetedUniqueValues().keys())
      .filter((v) => v != null && v !== '')
      .map((v) => ({ value: String(v), label: String(v) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [type, column]);

  if (type === 'select') {
    const selected = (value as string[] | undefined) ?? [];
    return (
      <MultiSelect
        size="xs"
        variant="filled"
        clearable
        searchable
        hidePickedOptions
        placeholder={selected.length ? undefined : 'All'}
        data={selectData}
        value={selected}
        onChange={(v) => column.setFilterValue(v.length ? v : undefined)}
        comboboxProps={{ withinPortal: true, classNames: { dropdown: portalClassName } }}
        maxDropdownHeight={220}
      />
    );
  }

  if (type === 'number') {
    const [min, max] = (value as NumberRange) ?? [undefined, undefined];
    // Collapse an all-empty range back to `undefined` so the filter clears.
    const commit = (next: NumberRange) =>
      column.setFilterValue(next[0] == null && next[1] == null ? undefined : next);
    const toNum = (v: number | string) => (v === '' || v == null ? undefined : Number(v));
    return (
      <Group gap={4} wrap="nowrap">
        <NumberInput
          size="xs"
          variant="filled"
          placeholder="Min"
          hideControls
          value={min ?? ''}
          onChange={(v) => commit([toNum(v), max])}
        />
        <NumberInput
          size="xs"
          variant="filled"
          placeholder="Max"
          hideControls
          value={max ?? ''}
          onChange={(v) => commit([min, toNum(v)])}
        />
      </Group>
    );
  }

  if (type === 'date') {
    const [start, end] = (value as [unknown, unknown] | undefined) ?? [null, null];
    return (
      <DatePickerInput
        type="range"
        size="xs"
        variant="filled"
        clearable
        valueFormat={column.columnDef.meta?.dateFormat ?? DEFAULT_DATE_FORMAT}
        placeholder="Date range"
        value={[
          (start as string | Date | null) ?? null,
          (end as string | Date | null) ?? null,
        ]}
        onChange={([s, e]) =>
          column.setFilterValue(s == null && e == null ? undefined : [s, e])
        }
        popoverProps={{ withinPortal: true, classNames: { dropdown: portalClassName } }}
      />
    );
  }

  return (
    <TextInput
      size="xs"
      variant="filled"
      placeholder="Filter…"
      leftSection={<IconFilter size={13} />}
      value={(value as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.currentTarget.value || undefined)}
    />
  );
}
