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
  'Upload Date',
  'File Name',
  'Client Name',
  'Final Reviewer',
  'Final Validator',
  'Processed On',
  'Reviewer AHT',
  'Validator AHT',
  'Latest Status',
  'Shift Date',
  'Shift',
  'Institution Name',
  'Pages',
  'Confidence Score',
];

export async function addToSheetsController(req, res) {
  try {
    // Get fromDate and toDate from frontend 
    const { fromDate, toDate } = req.body;
    
    if (!fromDate || !toDate) {
      return res.status(400).json({ 
        error: 'Missing required fields: fromDate and toDate are required' 
      });
    }

    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);
    if (isNaN(fromDateObj.getTime()) || isNaN(toDateObj.getTime())) {
      return res.status(400).json({ 
        error: 'Invalid date format. Please provide valid ISO date strings' 
      });
    }

    // Validate date range
    if (fromDateObj > toDateObj) {
      return res.status(400).json({ 
        error: 'Invalid date range: fromDate cannot be later than toDate' 
      });
    }

    // console.log(`Processing date range: ${fromDate} to ${toDate}`);

    let hits;
    try {
      hits = await searchTranscripts('dev', fromDate, toDate);
      // console.log(`Found ${hits.length} hits from Elasticsearch`);
      if (hits.length > 0) {
        // console.log('Sample data structure:', JSON.stringify(hits[0]._source, null, 2));
      }
    } catch (error) {
      console.error('Error querying Elasticsearch:', error);
      return res.status(500).json({ 
        error: 'Failed to query data source', 
        details: error.message 
      });
    }

    // console.log(`Using ${hits.length} entries from Elasticsearch query`);

    // Helper function 
    function getShiftInfo(date) {
      // UTC to IST
      const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
      const hour = istDate.getUTCHours();
      const dayStart = 9;
      const dayEnd = 21;
      
      if (hour >= dayStart && hour < dayEnd) {
        return {
          shift: 'Day',
          shiftDate: date.toISOString().split('T')[0]
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
        shiftDate: date.toISOString().split('T')[0]
      };
    }

    const rows = hits
      .sort((a, b) => new Date(b._source.uploaded_date) - new Date(a._source.uploaded_date))
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
        const formattedProcessedOn = h._source.processed_on
          ? "'" + new Date(h._source.processed_on).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
          : '';

        let formattedShiftDate = '';
        if (h._source.processed_on) {
          try {
            const processedDate = new Date(h._source.processed_on);
            const { shiftDate } = getShiftInfo(processedDate);
            formattedShiftDate = "'" + new Date(shiftDate + 'T00:00:00.000Z').toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
          } catch (error) {
            console.warn('Error calculating shift date:', error);
          }
        }

        let calculatedShift = '';
        if (h._source.processed_on) {
          try {
            const processedDate = new Date(h._source.processed_on);
            const { shift } = getShiftInfo(processedDate);
            calculatedShift = shift;
          } catch (error) {
            console.warn('Error calculating shift:', error);
          }
        }

        return [
          formattedDate,
          h._source.original_filename || '',
          h._source.request?.agent|| '',
          h._source.final_reviewer || '',
          h._source.processed_by  || '',
          formattedProcessedOn,
          h._source.reviewer_aht || '',
          h._source.validator_aht || '',
          h._source.status        || '',
          formattedShiftDate,
          calculatedShift,
          h._source.institution_name || '',
          h._source.pages         || '',
          h._source.confidence_score || '',
        ];
      });

    if (!rows.length) {
      return res.status(404).json({ error: 'No results found to add to Google Sheets' });
    }

    let sheetsClient, sheets;
    try {
      sheetsClient = await auth.getClient();
      sheets = google.sheets({ version: 'v4', auth: sheetsClient });
    } catch (error) {
      console.error('Error authenticating with Google Sheets:', error);
      return res.status(500).json({ 
        error: 'Failed to authenticate with Google Sheets', 
        details: error.message 
      });
    }

    // Check if headers exist
    let data;
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!1:1`,
        majorDimension: 'ROWS',
      });
      data = response.data;
    } catch (error) {
      console.error('Error reading sheet headers:', error);
      return res.status(500).json({ 
        error: 'Failed to access Google Sheet. Check spreadsheet ID and permissions', 
        details: error.message 
      });
    }

    const headerExists =
      Array.isArray(data.values) &&
      data.values.length > 0 &&
      data.values[0].join() === HEADERS.join();

    const values = headerExists ? rows : [HEADERS, ...rows];

    // Append new rows
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });
    } catch (error) {
      console.error('Error appending rows to sheet:', error);
      return res.status(500).json({ 
        error: 'Failed to write data to Google Sheet', 
        details: error.message 
      });
    }

    let allRows;
    try {
      const allRowsResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!A2:N`,
      });
      allRows = allRowsResp.data.values || [];
    } catch (error) {
      console.error('Error reading all rows from sheet:', error);
      return res.status(500).json({ 
        error: 'Failed to read data from Google Sheet for shift calculation', 
        details: error.message 
      });
    }
    const userShiftMap = {};
    const processedDates = new Set();

    // First pass: collect all unique dates
    allRows.forEach(row => {
      const processedOn = row[5];
      if (!processedOn) return;
      try {
        const dateStr = processedOn.replace(/^'/, '');
        const date = parse(dateStr, 'MMM d, yyyy, h:mm a', new Date());
        if (isNaN(date.getTime())) return;
        
        const { shiftDate } = getShiftInfo(date);
        processedDates.add(shiftDate);
      } catch (error) {
        console.warn(`Error parsing date from row: ${processedOn}`, error);
      }
    });

    processedDates.forEach(dateStr => {
      allRows.forEach(row => {
        const user = row[4] || 'Unknown';
        const processedOn = row[5];
        if (!processedOn) return;
        
        try {
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
        } catch (error) {
          console.warn(`Error processing shift for row: ${processedOn}`, error);
        }
      });
    });

    // console.log('Shifts by date:', userShiftMap);

    const userDominantShiftByDate = {};
    Object.entries(userShiftMap).forEach(([date, users]) => {
      userDominantShiftByDate[date] = {};
      Object.entries(users).forEach(([user, counts]) => {
        userDominantShiftByDate[date][user] = counts.day >= counts.night ? 'Day' : 'Night';
      });
    });

    const updatedRows = allRows.map(row => {
      const user = row[4] || '';
      const processedOn = row[5];
      if (!processedOn) return row;
      
      try {
        const dateStr = processedOn.replace(/^'/, '');
        const date = parse(dateStr, 'MMM d, yyyy, h:mm a', new Date());
        if (isNaN(date.getTime())) return row;
        
        const { shiftDate } = getShiftInfo(date);
        if (userDominantShiftByDate[shiftDate]?.[user]) {
          row[10] = userDominantShiftByDate[shiftDate][user];
        }
      } catch (error) {
        console.warn(`Error updating shift for row: ${processedOn}`, error);
      }
      return row;
    });

    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET}!A2:N${updatedRows.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: updatedRows },
      });
    } catch (error) {
      console.error('Error updating sheet with shift data:', error);
      return res.status(500).json({ 
        error: 'Failed to update Google Sheet with shift information', 
        details: error.message 
      });
    }

    // console.log('User dominant shifts by date:', userDominantShiftByDate);

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
