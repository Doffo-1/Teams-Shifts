import { NextResponse } from 'next/server';
import { prisma, ensureDefaultData } from '@/lib/db';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { format, startOfWeek, addDays } from 'date-fns';

export async function GET(req: Request) {
  try {
    await ensureDefaultData();
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get('date');
    const teamId = searchParams.get('teamId');

    if (!dateStr) return NextResponse.json({ error: 'Missing date' }, { status: 400 });

    const date = new Date(dateStr);
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = addDays(start, 7);

    let team = null;
    if (teamId) {
      team = await prisma.team.findUnique({
        where: { id: teamId },
        include: { shiftTypes: true },
      });
    }
    if (!team) {
      team = await prisma.team.findFirst({
        include: { shiftTypes: true },
      });
    }

    const defaultExportGroup = team?.exportGroupName || 'Servicedesk';
    const breakMinutes = team?.breakMinutes ?? 30;

    // Shift type hours map from team config
    const shiftTypeMap: Record<string, { start: string; end: string; color: string }> = {};
    if (team?.shiftTypes) {
      for (const st of team.shiftTypes) {
        shiftTypeMap[st.code] = {
          start: st.defaultStart,
          end: st.defaultEnd,
          color: st.themeColor,
        };
      }
    }

    const shifts = await prisma.shift.findMany({
      where: {
        date: { gte: start, lt: end },
        ...(team ? { employee: { teamId: team.id } } : {}),
      },
      include: { employee: true },
      orderBy: [{ date: 'asc' }, { employee: { name: 'asc' } }],
    });

    const workbook = new ExcelJS.Workbook();
    const templatePath = path.join(process.cwd(), 'ImportScheduleTemplate_c03feaf857b34bdcb4917de22655b403.xlsx');
    if (fs.existsSync(templatePath)) {
      await workbook.xlsx.readFile(templatePath);
    }

    let shiftsSheet = workbook.worksheets.find(ws => ws.name.trim().toLowerCase() === 'shifts');
    if (!shiftsSheet) shiftsSheet = workbook.addWorksheet('Shifts');

    let timeOffSheet = workbook.worksheets.find(ws => ws.name.trim().toLowerCase() === 'time off');
    if (!timeOffSheet) timeOffSheet = workbook.addWorksheet('Time Off');

    const columns = [
      { header: 'Member', key: 'member', width: 25 },
      { header: 'Work Email', key: 'email', width: 25 },
      { header: 'Group', key: 'group', width: 25 },
      { header: 'Start Date', key: 'startDate', width: 15 },
      { header: 'Start Time', key: 'startTime', width: 15 },
      { header: 'End Date', key: 'endDate', width: 15 },
      { header: 'End Time', key: 'endTime', width: 15 },
      { header: 'Theme Color', key: 'color', width: 15 },
      { header: 'Custom Label', key: 'label', width: 20 },
      { header: 'Unpaid Break (minutes)', key: 'break', width: 20 },
      { header: 'Notes', key: 'notes', width: 40 },
      { header: 'Shared', key: 'shared', width: 15 },
    ];

    const timeOffColumns = [
      { header: 'Member', key: 'member', width: 25 },
      { header: 'Work Email', key: 'email', width: 25 },
      { header: 'Start Date', key: 'startDate', width: 15 },
      { header: 'Start Time', key: 'startTime', width: 15 },
      { header: 'End Date', key: 'endDate', width: 15 },
      { header: 'End Time', key: 'endTime', width: 15 },
      { header: 'Paid (Yes/No)', key: 'paid', width: 15 },
      { header: 'Time Off Reason', key: 'reason', width: 20 },
      { header: 'Notes', key: 'notes', width: 40 },
    ];

    const ensureHeader = (sheet: ExcelJS.Worksheet, cols: any[]) => {
      const firstRow = sheet.getRow(1);
      let vals: any[] = [];
      if (Array.isArray(firstRow.values)) {
        vals = firstRow.values;
      } else if (firstRow.values && typeof firstRow.values === 'object') {
        vals = Object.values(firstRow.values);
      }
      const hasMemberHeader = vals.some((v: any) => typeof v === 'string' && v.trim().toLowerCase() === 'member');
      if (!hasMemberHeader) {
        sheet.columns = cols;
      } else {
        cols.forEach((col, i) => {
          sheet.getColumn(i + 1).key = col.key;
        });
      }
    };

    const clearDataRows = (sheet: ExcelJS.Worksheet) => {
      if (sheet.rowCount > 1) {
        sheet.spliceRows(2, sheet.rowCount);
      }
    };

    ensureHeader(shiftsSheet, columns);
    ensureHeader(timeOffSheet, timeOffColumns);

    workbook.worksheets.forEach(sheet => {
      const n = sheet.name.trim().toLowerCase();
      if (n.includes('shifts') || n.includes('time off') || n.includes('day notes') || n.includes('open shift')) {
        clearDataRows(sheet);
      }
    });

    for (const shift of shifts) {
      if (shift.type === 'OFF') {
        continue;
      }

      const empGroup = (shift.employee.group || '').toLowerCase();
      if (empGroup.includes('sales') || empGroup.includes('manager')) {
        continue;
      }

      let startTime = shift.customStart || '';
      let endTime = shift.customEnd || '';
      let themeColor = '5. Pink';

      const configForType = shiftTypeMap[shift.type];
      if (configForType) {
        if (!startTime) startTime = configForType.start;
        if (!endTime) endTime = configForType.end;
        themeColor = configForType.color;
      } else if (shift.type === 'EARLY') {
        if (!startTime) startTime = '07:30';
        if (!endTime) endTime = '16:00';
        themeColor = '3. Green';
      } else if (shift.type === 'LATE') {
        if (!startTime) startTime = '09:30';
        if (!endTime) endTime = '18:00';
        themeColor = '2. Blue';
      } else if (shift.type === 'SICK' || shift.type === 'VACATION') {
        if (!startTime) startTime = '08:30';
        if (!endTime) endTime = '17:00';
        themeColor = '1. White';
      } else if (shift.type === 'CUSTOM') {
        if (shift.color === 'GREEN') themeColor = '3. Green';
        else if (shift.color === 'BLUE') themeColor = '2. Blue';
        else themeColor = '5. Pink';
      }

      let shiftLabel = '';
      let displayNotes = shift.notes || '';

      if (shift.type === 'SICK') {
        shiftLabel = 'Sick';
      } else if (shift.type === 'VACATION') {
        shiftLabel = 'Vacation';
      } else if (shift.location === 'OFFICE' || shift.location === 'Kantoor') {
        displayNotes = (displayNotes ? displayNotes + ' ' : '') + 'Kantoor';
      } else if (shift.location === 'HOME' || shift.location === 'Thuis') {
        displayNotes = (displayNotes ? displayNotes + ' ' : '') + 'Thuis';
      } else {
        shiftLabel = shift.location;
        if (!startTime) startTime = '08:30';
        if (!endTime) endTime = '17:00';
      }

      const shiftDate = format(shift.date, 'MM/dd/yyyy');

      let exportGroup = defaultExportGroup;
      if (shift.employee.group) {
        try {
          if ((team as any)?.groups) {
            const parsed = JSON.parse((team as any).groups);
            const found = Array.isArray(parsed) ? parsed.find((g: any) => g.id === shift.employee.group) : null;
            if (found && found.name) {
              exportGroup = found.name;

            } else if (shift.employee.group !== 'DEFAULT') {
              exportGroup = shift.employee.group;
            }

          } else if (shift.employee.group !== 'DEFAULT') {
            exportGroup = shift.employee.group;
          }
        } catch {
          if (shift.employee.group !== 'DEFAULT') exportGroup = shift.employee.group;
        }
      }

      const row = {
        member: shift.employee.name,
        email: shift.employee.email || '',
        group: exportGroup,
        startDate: shiftDate,
        startTime: startTime,
        endDate: shiftDate,
        endTime: endTime,
        color: themeColor,
        label: shiftLabel,
        break: breakMinutes,
        notes: displayNotes,
        shared: '2. Not shared',
      };

      if (shift.type === 'SICK' || shift.type === 'VACATION') {
        timeOffSheet.addRow({
          member: shift.employee.name,
          email: shift.employee.email || '',
          startDate: shiftDate,
          startTime: startTime,
          endDate: shiftDate,
          endTime: endTime,
          paid: 'Yes',
          reason: shiftLabel,
          notes: displayNotes,
        });
      } else {
        shiftsSheet.addRow(row);
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const teamSlug = team ? `_${team.slug}` : '';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="shifts${teamSlug}_${format(start, 'yyyy-MM-dd')}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to export shifts' }, { status: 500 });
  }
}
