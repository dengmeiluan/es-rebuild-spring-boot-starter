/**
 * 五百六十批：XLSX 双 sheet 装配单源（RT 1189-1205 / QRT 1822-1834 逐字同构收编，
 * 唯一实差=meta 差异字段——RT 有「索引/范围」、QRT 无，以 meta0 前置行参数化注入）。
 * data sheet 原样直通；meta sheet 表头恒 ['key','value']，行集=[...meta0,
 * ['导出时间', ISO], ['行数', data.rows.length]]。buildXlsx 装配仍归 utils/xlsxMini。
 */

interface ExportSheet { name: string; head: string[]; rows: unknown[][] }

export function buildExportSheets(
  /** 差异字段前置行（RT：索引/范围；QRT：空档） */
  meta0: ReadonlyArray<readonly [string, unknown]>,
  /** data sheet 装配体（head+rows；单元格加工由调用方管道完成） */
  data: { head: readonly string[]; rows: readonly unknown[][] },
): [ExportSheet, ExportSheet] {
  const sheet: ExportSheet = { name: 'data', head: [...data.head], rows: data.rows.map(r => [...r]) };
  const meta: ExportSheet = {
    name: 'meta',
    head: ['key', 'value'],
    rows: [
      ...meta0.map(([k, v]) => [k, v] as unknown[]),
      ['导出时间', new Date().toISOString()],
      ['行数', data.rows.length],
    ],
  };
  return [sheet, meta];
}
