import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { searchTranscripts } from '../esClient.js';
import { parse } from 'date-fns';

const creds = JSON.parse(
  fs.readFileSync(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS), 'utf-8')
);
const auth = new google.auth.GoogleAuth({
  credentials: creds,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET        = process.env.SHEET_NAME;
const HEADERS      = [
  'Date',
  'image Name',
  'Client Name',
  'Uploaded By',
  'Final Reviewer',
  'Processed By',
  'Processed On',
  'Latest Status',
  'Shift',
  'Institution Name',
  'Pages',
  'Confidence Score',
];

export async function addToSheetsController(req, res) {
  try {
    const hits = await searchTranscripts(
      'qa',
      '1900-01-01',
      new Date().toISOString()
    );

    const rows = hits
      .sort((a, b) => new Date(b._source.uploaded_date) - new Date(a._source.uploaded_date))
      .slice(0, 15)
      .map((h) => {
        const formattedDate = h._source.uploaded_date
          ? "'" + new Date(h._source.uploaded_date).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
          : '';
        return [
          formattedDate,
          h._source.image_name    || '',
          h._source.request?.agent|| '',
          h._source.uploaded_by   || '',
          h._source.final_reviewer || '',
          h._source.processed_by  || 'anirudh',
          h._source.processed_on  || '',
          h._source.status        || '',
          h._source.shift         || '',
          h._source.institution_name || '',
          h._source.pages         || '',
          h._source.confidence_score || '',
        ];
      });

    if (!rows.length) {
      return res.status(404).json({ error: 'No results found to add to Google Sheets' });
    }

    const sheetsClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: sheetsClient });

    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!1:1`,
      majorDimension: 'ROWS',
    });

    const headerExists =
      Array.isArray(data.values) &&
      data.values.length > 0 &&
      data.values[0].join() === HEADERS.join();

    const values = headerExists ? rows : [HEADERS, ...rows];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });

    const allRowsResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A2:J`,
    });
    const allRows = allRowsResp.data.values || [];

    // Group entries by date and calculate shifts
    const userShiftMap = {};
    const processedDates = new Set();

    // Helper function to determine shift using IST hours
    function getShiftInfo(date) {
      // Add 5 hours and 30 minutes to convert UTC to IST
      const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
      const hour = istDate.getUTCHours();
      const dayStart = 9; // 9 AM IST
      const dayEnd = 21;  // 9 PM IST
      
      // If time is between 9 AM and 9 PM IST, it's day shift of the same date
      if (hour >= dayStart && hour < dayEnd) {
        return {
          shift: 'Day',
          shiftDate: date.toISOString().split('T')[0] // Use original date for consistency
        };
      }
      
      // If time is before 9 AM IST, it belongs to previous day's night shift
      if (hour < dayStart) {
        const prevDate = new Date(date);
        prevDate.setUTCDate(date.getUTCDate() - 1);
        return {
          shift: 'Night',
          shiftDate: prevDate.toISOString().split('T')[0] // Previous date
        };
      }
      
      // If time is 9 PM IST or later, it's night shift of the same date
      return {
        shift: 'Night',
        shiftDate: date.toISOString().split('T')[0] // Same date
      };
    }

    // First pass: collect all unique dates
    allRows.forEach(row => {
      const processedOn = row[0]; // Date column
      if (!processedOn) return;
      const dateStr = processedOn.replace(/^'/, '');
      const date = parse(dateStr, 'MMM d, yyyy, h:mm a', new Date());
      if (isNaN(date.getTime())) return;
      
      const { shiftDate } = getShiftInfo(date);
      processedDates.add(shiftDate);
    });

    processedDates.forEach(dateStr => {
      allRows.forEach(row => {
        const user = row[5] || 'Unknown';
        const processedOn = row[0];
        if (!processedOn) return;
        
        const rowDateStr = processedOn.replace(/^'/, '');
        const rowDate = parse(rowDateStr, 'MMM d, yyyy, h:mm a', new Date());
        if (isNaN(rowDate.getTime())) return;
        
        const { shift, shiftDate } = getShiftInfo(rowDate);

        if (shiftDate === dateStr) {
          if (!userShiftMap[dateStr]) {
            userShiftMap[dateStr] = {};
          }
          if (!userShiftMap[dateStr][user]) {
            userShiftMap[dateStr][user] = { day: 0, night: 0 };
          }
          
          if (shift === 'Day') {
            userShiftMap[dateStr][user].day += 1;
          } else {
            userShiftMap[dateStr][user].night += 1;
          }
        }
      });
    });

    console.log('Shifts by date:', userShiftMap);

    const userDominantShiftByDate = {};
    Object.entries(userShiftMap).forEach(([date, users]) => {
      userDominantShiftByDate[date] = {};
      Object.entries(users).forEach(([user, counts]) => {
        userDominantShiftByDate[date][user] = counts.day >= counts.night ? 'Day' : 'Night';
      });
    });

    const updatedRows = allRows.map(row => {
      const user = row[5] || 'Unknown';
      const processedOn = row[0];
      if (!processedOn) return row;
      
      const dateStr = processedOn.replace(/^'/, '');
      const date = parse(dateStr, 'MMM d, yyyy, h:mm a', new Date());
      if (isNaN(date.getTime())) return row;
      
      const { shiftDate } = getShiftInfo(date);
      if (userDominantShiftByDate[shiftDate]?.[user]) {
        row[8] = userDominantShiftByDate[shiftDate][user];
      }
      return row;
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET}!A2:J${updatedRows.length + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: updatedRows },
    });

    console.log('User dominant shifts by date:', userDominantShiftByDate);

    res.json({
      message: `${rows.length} recent rows added to Google Sheet`,
      count: rows.length,
    });
  } catch (err) {
    console.error('Error in addToSheetsController:', err);
    res
      .status(500)
      .json({ error: 'Failed to add to Google Sheets', details: err.message });
  }
}
