import ExcelJS from 'exceljs';

export const SPAY_NEUTER_HEADERS = [
  'Date',
  'Name of Client',
  'Barangay',
  'No. Castrated Canine (Male)',
  'No. Spayed Canine (Female)',
  'No. Castrated Feline (Male)',
  'No. Spayed Feline (Female)',
  'Remarks',
] as const;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const MONTH_LOOKUP = new Map(MONTHS.map((month, index) => [month.toLowerCase(), index + 1]));
const MAX_WORKSHEETS = 20;
const MAX_ROWS = 2_000;
const HEADER_ROW = 7;

export interface SpayNeuterRow {
  date: string;
  clientName: string;
  barangay: string;
  canineCastrated: number;
  canineSpayed: number;
  felineCastrated: number;
  felineSpayed: number;
  totalProcedures: number;
  remarks: string;
  worksheet: string;
  rowNumber: number;
}

export interface SpayNeuterParseResult {
  records: SpayNeuterRow[];
  errors: string[];
  months: number[];
  procedures: number;
}

function normalizedHeader(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object' && 'text' in value) return value.text;
  return value;
}

function isFormula(value: ExcelJS.CellValue): boolean {
  return Boolean(value && typeof value === 'object' && 'formula' in value);
}

function asMonth(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^([a-z]+)/i);
  return match ? MONTH_LOOKUP.get(match[1].toLowerCase()) ?? null : null;
}

function asIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.trim() ? null : value.trim();
}

function asCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function createWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'City Veterinary Office';
  workbook.subject = 'Spay and Neuter Monthly Report';
  workbook.title = 'Spay and Neuter Monthly Report';
  workbook.company = 'City Veterinary Office';
  return workbook;
}

function addMonthlyReportSheet(workbook: ExcelJS.Workbook, name: string, logo: Uint8Array | undefined, period: string) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = [
    { width: 18 }, { width: 30 }, { width: 26 }, { width: 22 },
    { width: 22 }, { width: 22 }, { width: 22 }, { width: 34 },
  ];
  if (logo) {
    const imageId = workbook.addImage({ base64: Buffer.from(logo).toString('base64'), extension: 'jpeg' });
    sheet.addImage(imageId, 'A1:B5');
  }
  const letterhead = [
    'Republic of the Philippines',
    'Province of Bulacan',
    'City of San Jose del Monte',
    'OFFICE OF THE CITY VETERINARIAN',
    'SPAY AND NEUTER MONTHLY REPORT',
    period,
  ];
  letterhead.forEach((text, index) => {
    sheet.mergeCells(index + 1, 3, index + 1, 8);
    const cell = sheet.getCell(index + 1, 3);
    cell.value = text;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (index === 3) cell.font = { bold: true };
    if (index === 4) cell.font = { bold: true, size: 14 };
  });
  sheet.getRow(7).values = [...SPAY_NEUTER_HEADERS];
  sheet.getRow(7).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  sheet.getRow(7).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getRow(7).height = 36;
  sheet.views = [{ state: 'frozen', ySplit: 7 }];
  return sheet;
}

function addTotals(sheet: ExcelJS.Worksheet, totalRow: number, firstDataRow: number, lastDataRow: number) {
  sheet.getCell(totalRow, 3).value = 'TOTAL';
  for (let column = 4; column <= 7; column += 1) {
    const letter = String.fromCharCode(64 + column);
    sheet.getCell(totalRow, column).value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` };
  }
  sheet.getRow(totalRow).font = { bold: true };
  sheet.getCell(totalRow + 2, 4).value = 'Castrated Canine/Feline';
  sheet.getCell(totalRow + 2, 5).value = { formula: `D${totalRow}+F${totalRow}` };
  sheet.getCell(totalRow + 3, 4).value = 'Spayed Canine/Feline';
  sheet.getCell(totalRow + 3, 5).value = { formula: `E${totalRow}+G${totalRow}` };
}

function addMonthLabel(sheet: ExcelJS.Worksheet, row: number, month: string) {
  const label = sheet.getCell(row, 1);
  label.value = month;
  label.font = { bold: true, color: { argb: 'FF0F766E' } };
  label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6FFFB' } };
}

export async function createSpayNeuterTemplate(logo?: Uint8Array): Promise<Buffer> {
  const workbook = createWorkbook();
  const sheet = addMonthlyReportSheet(workbook, 'Barangay', logo, 'Enter the reporting period here');
  let row = 8;
  for (const month of MONTHS) {
    addMonthLabel(sheet, row, month);
    row += 1;
    for (let entry = 0; entry < 10; entry += 1) {
      sheet.getCell(row, 1).numFmt = 'yyyy-mm-dd';
      for (let column = 4; column <= 7; column += 1) {
        sheet.getCell(row, column).numFmt = '0';
      }
      row += 1;
    }
  }
  addTotals(sheet, row + 1, 8, row - 1);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function createSpayNeuterExport(
  records: Omit<SpayNeuterRow, 'worksheet' | 'rowNumber'>[],
  logo: Uint8Array | undefined,
  period: string,
): Promise<Buffer> {
  const workbook = createWorkbook();
  const sheet = addMonthlyReportSheet(workbook, 'Monthly Report', logo, period);
  let row = 8;
  for (const [index, month] of MONTHS.entries()) {
    addMonthLabel(sheet, row, month);
    row += 1;
    for (const record of records.filter((item) => Number(item.date.slice(5, 7)) === index + 1)) {
      sheet.getCell(row, 1).value = new Date(`${record.date}T00:00:00.000Z`);
      sheet.getCell(row, 1).numFmt = 'yyyy-mm-dd';
      sheet.getCell(row, 2).value = record.clientName;
      sheet.getCell(row, 3).value = record.barangay;
      sheet.getCell(row, 4).value = record.canineCastrated;
      sheet.getCell(row, 5).value = record.canineSpayed;
      sheet.getCell(row, 6).value = record.felineCastrated;
      sheet.getCell(row, 7).value = record.felineSpayed;
      sheet.getCell(row, 8).value = record.remarks;
      for (let column = 4; column <= 7; column += 1) sheet.getCell(row, column).numFmt = '0';
      row += 1;
    }
  }
  addTotals(sheet, row + 1, 8, row - 1);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function parseSpayNeuterWorkbook(buffer: Uint8Array, barangayNames: string[]): Promise<SpayNeuterParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    const workbookBytes = new Uint8Array(buffer.byteLength);
    workbookBytes.set(buffer);
    await workbook.xlsx.load(workbookBytes.buffer);
  } catch {
    return { records: [], errors: ['The file is not a readable Excel .xlsx workbook.'], months: [], procedures: 0 };
  }
  if (workbook.worksheets.length === 0 || workbook.worksheets.length > MAX_WORKSHEETS) {
    return { records: [], errors: [`The workbook must contain between 1 and ${MAX_WORKSHEETS} worksheets.`], months: [], procedures: 0 };
  }
  const barangays = new Map(barangayNames.map((name) => [name.trim().toLocaleLowerCase(), name.trim()]));
  const records: SpayNeuterRow[] = [];
  const errors: string[] = [];
  const months = new Set<number>();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const addError = (message: string) => { if (errors.length < 100) errors.push(message); };

  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount < HEADER_ROW || SPAY_NEUTER_HEADERS.some((expected, index) =>
      normalizedHeader(cellValue(sheet.getRow(HEADER_ROW).getCell(index + 1).value)) !== normalizedHeader(expected))) {
      addError(`${sheet.name}: row 7 must contain the exact eight standard column headers.`);
      continue;
    }
    if (sheet.rowCount > HEADER_ROW + MAX_ROWS + 20) {
      addError(`${sheet.name}: the worksheet exceeds the ${MAX_ROWS}-record limit.`);
      continue;
    }
    let currentMonth: number | null = null;
    for (let rowNumber = HEADER_ROW + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const values = Array.from({ length: 8 }, (_, index) => cellValue(row.getCell(index + 1).value));
      const [dateCell, clientCell, barangayCell] = values;
      const formulaRow = Array.from({ length: 8 }, (_, index) => isFormula(row.getCell(index + 1).value)).some(Boolean);
      const emptyRecordFields = [dateCell, clientCell, barangayCell].every((value) => value === null || value === undefined || value === '');
      const totalsRow = [dateCell, clientCell, barangayCell].some(
        (value) => typeof value === 'string' && /^total\b/i.test(value.trim()),
      );
      if (totalsRow) continue;
      if (formulaRow && emptyRecordFields) continue;
      if (values.every((value) => value === null || value === undefined || value === '')) continue;

      const markerMonth = asMonth(dateCell);
      if (markerMonth && [clientCell, barangayCell, ...values.slice(3)].every((value) => value === null || value === undefined || value === '')) {
        currentMonth = markerMonth;
        continue;
      }
      if (typeof dateCell === 'string' && /^total\b/i.test(dateCell.trim()) && emptyRecordFields) continue;

      const rowPrefix = `${sheet.name}, row ${rowNumber}`;
      const date = asIsoDate(dateCell);
      const clientName = typeof clientCell === 'string' ? clientCell.trim() : '';
      const rawBarangay = typeof barangayCell === 'string' ? barangayCell.trim() : '';
      let rowIsValid = true;
      if (formulaRow) { addError(`${rowPrefix}: data rows must not contain formulas.`); rowIsValid = false; }
      if (!date) { addError(`${rowPrefix}: Date must be a valid Excel date or YYYY-MM-DD.`); rowIsValid = false; }
      if (date && date > today) { addError(`${rowPrefix}: actual service dates cannot be in the future.`); rowIsValid = false; }
      if (!clientName || clientName.length > 160) { addError(`${rowPrefix}: Name of Client is required and must be 160 characters or fewer.`); rowIsValid = false; }
      const barangay = barangays.get(rawBarangay.toLocaleLowerCase());
      if (!barangay) { addError(`${rowPrefix}: Barangay must exactly match an active system barangay.`); rowIsValid = false; }
      if (date && currentMonth && Number(date.slice(5, 7)) !== currentMonth) {
        addError(`${rowPrefix}: the date month does not match the ${MONTHS[currentMonth - 1]} section.`);
        rowIsValid = false;
      }
      if (date && !currentMonth) { addError(`${rowPrefix}: place this record under its month section.`); rowIsValid = false; }
      const counts = values.slice(3, 7).map(asCount);
      if (counts.some((count) => count === null)) {
        addError(`${rowPrefix}: procedure counts must be whole numbers greater than or equal to zero.`);
        rowIsValid = false;
      }
      const totalProcedures = counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
      if (totalProcedures === 0) {
        addError(`${rowPrefix}: at least one canine or feline procedure count is required.`);
        rowIsValid = false;
      }
      if (!rowIsValid || !date || !barangay) continue;
      if (records.length >= MAX_ROWS) {
        addError(`The workbook exceeds the ${MAX_ROWS}-record limit.`);
        break;
      }
      const remarks = typeof values[7] === 'string' || typeof values[7] === 'number' ? String(values[7]).trim() : '';
      if (remarks.length > 500) {
        addError(`${rowPrefix}: Remarks must be 500 characters or fewer.`);
        continue;
      }
      records.push({
        date, clientName, barangay,
        canineCastrated: counts[0] ?? 0,
        canineSpayed: counts[1] ?? 0,
        felineCastrated: counts[2] ?? 0,
        felineSpayed: counts[3] ?? 0,
        totalProcedures,
        remarks,
        worksheet: sheet.name,
        rowNumber,
      });
      months.add(Number(date.slice(5, 7)));
    }
  }
  return {
    records,
    errors,
    months: [...months].sort((a, b) => a - b),
    procedures: records.reduce((sum, record) => sum + record.totalProcedures, 0),
  };
}
