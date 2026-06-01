type Row = Record<string, string | number | boolean | null | undefined>;

function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV(data: Row[], filename: string, headers?: Record<string, string>) {
  if (!data.length) return;

  const keys = Object.keys(data[0]);
  const headerRow = keys.map(k => escapeCell(headers?.[k] ?? k)).join(",");
  const rows = data.map(row => keys.map(k => escapeCell(row[k])).join(","));

  // BOM for Excel UTF-8 compatibility
  const csv = "﻿" + [headerRow, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
