import { useState } from 'react';
import { Checkbox, NumberInput, Select, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import type { GridEditor } from './types';
import { useGridTheme } from '../helper/gridTheme';
import { DEFAULT_DATE_FORMAT } from './buildColumns';

interface EditableCellProps {
  editor: GridEditor;
  initialValue: unknown;
  options?: { value: string; label: string }[];
  /** dayjs format for the `date` editor's picker (from the column). */
  dateFormat?: string;
  error: string | null;
  /** Persist the value into the working draft (commit this cell). */
  onCommit: (value: unknown) => void;
  /** Abort editing this cell without changing the draft. */
  onCancel: () => void;
}

/**
 * The active editor for a single cell. It owns a local draft seeded from the
 * cell's current value and commits into the grid's working draft on Enter /
 * blur (text, number) or immediately on change (select, checkbox, date). Esc
 * cancels. Commits are staged only — nothing is saved until the toolbar's Save.
 */
export function EditableCell({
  editor,
  initialValue,
  options = [],
  dateFormat,
  error,
  onCommit,
  onCancel,
}: EditableCellProps) {
  const [value, setValue] = useState<unknown>(initialValue);
  const { portalClassName } = useGridTheme();

  const stop = { onClick: (e: React.MouseEvent) => e.stopPropagation() };
  const keyProps = {
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onCommit(value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
  };
  const common = { size: 'xs', error: error || undefined } as const;

  if (editor === 'checkbox') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Checkbox
          size="sm"
          checked={!!value}
          autoFocus
          onChange={(e) => onCommit(e.currentTarget.checked)}
          {...stop}
        />
      </div>
    );
  }

  if (editor === 'number') {
    return (
      <NumberInput
        {...common}
        {...keyProps}
        {...stop}
        autoFocus
        value={value == null || value === '' ? '' : Number(value)}
        onChange={(v) => setValue(v === '' || v == null ? null : Number(v))}
        onBlur={() => onCommit(value)}
      />
    );
  }

  if (editor === 'select') {
    return (
      <Select
        {...common}
        {...stop}
        searchable
        autoFocus
        comboboxProps={{ withinPortal: true, classNames: { dropdown: portalClassName } }}
        data={options}
        value={value == null ? null : String(value)}
        onChange={(v) => onCommit(v)}
        onBlur={onCancel}
      />
    );
  }

  if (editor === 'date') {
    return (
      <DatePickerInput
        {...common}
        {...stop}
        valueFormat={dateFormat ?? DEFAULT_DATE_FORMAT}
        popoverProps={{ withinPortal: true, classNames: { dropdown: portalClassName } }}
        value={(value as string | Date | null) ?? null}
        onChange={(v) => onCommit(v)}
      />
    );
  }

  return (
    <TextInput
      {...common}
      {...keyProps}
      {...stop}
      autoFocus
      value={value == null ? '' : String(value)}
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={() => onCommit(value)}
    />
  );
}
