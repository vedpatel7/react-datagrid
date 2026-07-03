import { ActionIcon, Badge, Button, Checkbox, Group, Menu, Text, TextInput, Tooltip } from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowsSort,
  IconClipboard,
  IconColumns3,
  IconDeviceFloppy,
  IconDownload,
  IconFileSpreadsheet,
  IconFileTypeCsv,
  IconJson,
  IconPlus,
  IconPrinter,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { Table } from '@tanstack/react-table';
import { isControlColumn } from './buildColumns';
import { useGridTheme } from '../helper/gridTheme';

/** Export formats offered by the toolbar's export menu. */
export type ExportFormat = 'csv' | 'excel' | 'json' | 'print' | 'clipboard';

interface GridToolbarProps<T> {
  table: Table<T>;
  title?: ReactNode;
  enableGlobalFilter: boolean;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  enableColumnVisibility: boolean;
  enableExport: boolean;
  onExport: (format: ExportFormat) => void;
  /** Active sort count — a "clear sort" chip shows when > 0. */
  sortCount: number;
  onClearSorting: () => void;
  /** Pending (unsaved) change count — Save/Revert show when > 0. */
  dirtyCount: number;
  /** Number of validation errors among pending edits (blocks Save). */
  errorCount: number;
  saving: boolean;
  onSave: () => void;
  onRevert: () => void;
  /** Show the "Add row" button. */
  showAddRow: boolean;
  onAddRow: () => void;
  /** Selected-row count — a "Delete selected" button shows when > 0. */
  selectedCount: number;
  onDeleteSelected: () => void;
  actions?: ReactNode;
}

/**
 * Grid header row: optional title, global search box, and the column-visibility
 * + export controls. Rendered above the table frame.
 */
export function GridToolbar<T>({
  table,
  title,
  enableGlobalFilter,
  globalFilter,
  onGlobalFilterChange,
  enableColumnVisibility,
  enableExport,
  onExport,
  sortCount,
  onClearSorting,
  dirtyCount,
  errorCount,
  saving,
  onSave,
  onRevert,
  showAddRow,
  onAddRow,
  selectedCount,
  onDeleteSelected,
  actions,
}: GridToolbarProps<T>) {
  const { portalClassName } = useGridTheme();
  const hideableColumns = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && !isControlColumn(c.id));

  return (
    <Group justify="space-between" align="center" wrap="wrap" gap="sm">
      <Group gap="sm" align="center" style={{ flex: 1, minWidth: 200 }}>
        {title != null &&
          (typeof title === 'string' ? (
            <Text fw={700} fz="lg">
              {title}
            </Text>
          ) : (
            title
          ))}
        {enableGlobalFilter && (
          <TextInput
            size="sm"
            radius="md"
            placeholder="Search…"
            leftSection={<IconSearch size={15} />}
            value={globalFilter}
            onChange={(e) => onGlobalFilterChange(e.currentTarget.value)}
            style={{ flex: 1, maxWidth: 320 }}
          />
        )}
      </Group>

      <Group gap="xs" align="center">
        {showAddRow && (
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={onAddRow}
          >
            Add row
          </Button>
        )}
        {selectedCount > 0 && (
          <Button
            size="xs"
            variant="light"
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={onDeleteSelected}
          >
            Delete ({selectedCount})
          </Button>
        )}
        {dirtyCount > 0 && (
          <>
            <Badge
              size="sm"
              radius="sm"
              variant="light"
              color={errorCount > 0 ? 'red' : 'brand'}
            >
              {errorCount > 0
                ? `${errorCount} error${errorCount > 1 ? 's' : ''}`
                : `${dirtyCount} unsaved`}
            </Badge>
            <Button
              size="xs"
              variant="default"
              leftSection={<IconArrowBackUp size={14} />}
              onClick={onRevert}
              disabled={saving}
            >
              Revert
            </Button>
            <Button
              size="xs"
              leftSection={<IconDeviceFloppy size={14} />}
              onClick={onSave}
              loading={saving}
              disabled={errorCount > 0}
            >
              Save
            </Button>
          </>
        )}
        {actions}
        {sortCount > 0 && (
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconArrowsSort size={14} />}
            onClick={onClearSorting}
          >
            Clear sort{sortCount > 1 ? ` (${sortCount})` : ''}
          </Button>
        )}
        {enableColumnVisibility && hideableColumns.length > 0 && (
          <Menu shadow="md" width={220} closeOnItemClick={false} position="bottom-end" classNames={{ dropdown: portalClassName }}>
            <Menu.Target>
              <Tooltip label="Columns" withArrow>
                <ActionIcon variant="default" size="lg" aria-label="Toggle columns">
                  <IconColumns3 size={18} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Toggle columns</Menu.Label>
              {hideableColumns.map((column) => (
                <Menu.Item
                  key={column.id}
                  onClick={() => column.toggleVisibility()}
                  leftSection={
                    <Checkbox
                      size="xs"
                      checked={column.getIsVisible()}
                      readOnly
                      tabIndex={-1}
                      style={{ pointerEvents: 'none' }}
                    />
                  }
                >
                  {column.columnDef.meta?.label ?? column.id}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
        {enableExport && (
          <Menu shadow="md" width={200} position="bottom-end" classNames={{ dropdown: portalClassName }}>
            <Menu.Target>
              <Tooltip label="Export" withArrow>
                <ActionIcon variant="default" size="lg" aria-label="Export">
                  <IconDownload size={18} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Export</Menu.Label>
              <Menu.Item
                leftSection={<IconClipboard size={15} />}
                onClick={() => onExport('clipboard')}
              >
                Copy to clipboard
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFileTypeCsv size={15} />}
                onClick={() => onExport('csv')}
              >
                CSV
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFileSpreadsheet size={15} />}
                onClick={() => onExport('excel')}
              >
                Excel
              </Menu.Item>
              <Menu.Item
                leftSection={<IconJson size={15} />}
                onClick={() => onExport('json')}
              >
                JSON
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                leftSection={<IconPrinter size={15} />}
                onClick={() => onExport('print')}
              >
                Print
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </Group>
  );
}
