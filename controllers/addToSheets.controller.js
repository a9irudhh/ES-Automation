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
    // Debug: Log the entire request object parts
    // console.log('Request query:', req.query);
    // console.log('Request body:', req.body);
    // console.log('Request method:', req.method);
    
    // Get fromDate and toDate from query parameters (GET request)
    const { fromDate, toDate } = req.query;
    // console.log(`Received request to add data from ${fromDate} to ${toDate}`);
    
    if (!fromDate || !toDate) {
      // console.log('Missing required parameters:', { fromDate, toDate });
      return res.status(400).json({ 
        error: 'Missing required fields: fromDate and toDate are required' 
      });
    }

    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);
    // console.log('Parsed dates:', {
    //   fromDate: fromDate,
    //   toDate: toDate,
    //   fromDateObj: fromDateObj.toISOString(),
    //   toDateObj: toDateObj.toISOString(),
    //   fromDateValid: !isNaN(fromDateObj.getTime()),
    //   toDateValid: !isNaN(toDateObj.getTime())
    // });
    
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
    // Define allowed agents
    const allowedAgents = ['sia-uttyler-prod', 'sia-msu-prod', 'sia-gvsu-prod'];
    // console.log('Allowed agents:', allowedAgents);
    
    let hits;
    const type = 'production';
    // console.log('Query type:', type);
    
    try {
      // console.log('Calling searchTranscripts with parameters:', {
      //   type,
      //   fromDate,
      //   toDate,
      //   allowedAgents
      // });
      
      // Pass allowed agents to the search function to filter at the database level
      hits = await searchTranscripts(type, fromDate, toDate, allowedAgents);
      // console.log(`Found ${hits.length} hits from Elasticsearch with allowed agents: ${allowedAgents.join(', ')}`);
      
      if (hits.length > 0) {
        // console.log('Sample data structure:', JSON.stringify(hits[0]._source, null, 2));
        
        // Log agents found in the data
        const agentsInData = hits.map(hit => hit._source.request?.agent).filter(Boolean);
        const uniqueAgents = [...new Set(agentsInData)];
        // console.log('Unique agents found in data:', uniqueAgents);
        // console.log('Total agents in results:', agentsInData.length);
        
        // Log date range in the data
        const dates = hits.map(hit => hit._source.uploaded_date || hit._source.processed_on).filter(Boolean);
        if (dates.length > 0) {
          const sortedDates = dates.sort();
          // console.log('Date range in results:');
          // console.log('  Earliest:', sortedDates[0]);
          // console.log('  Latest:', sortedDates[sortedDates.length - 1]);
        }
        
        // Count entries by agent
        const agentCounts = {};
        hits.forEach(hit => {
          const agent = hit._source.request?.agent || 'unknown';
          agentCounts[agent] = (agentCounts[agent] || 0) + 1;
        });
        // console.log('Entries count by agent:', agentCounts);
      } else {
        // console.log('No hits found. Checking if searchTranscripts returned empty results or if filtering is too restrictive');
      }
    } catch (error) {
      console.error('Error querying Elasticsearch:', error);
      return res.status(500).json({ 
        error: 'Failed to query data source', 
        details: error.message 
      });
    }

    // console.log(`Using ${hits.length} entries from Elasticsearch query`);

    // Log some additional details about the data before processing
    if (hits.length > 0) {
      // console.log('First entry details:');
      // console.log('  Agent:', hits[0]._source.request?.agent);
      // console.log('  Upload date:', hits[0]._source.uploaded_date);
      // console.log('  Processed on:', hits[0]._source.processed_on);
      // console.log('  Status:', hits[0]._source.status);
      // console.log('  Institution:', hits[0]._source.institution_name);
    }

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

    // Since we're now filtering at the database level, we can work directly with hits
    // console.log('Starting to process hits into rows...');
    
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

    // console.log(`Processed ${rows.length} rows from ${hits.length} hits`);
    
    if (rows.length > 0) {
      // console.log('Sample processed row:', rows[0]);
    }

    if (!rows.length) {
      return res.status(404).json({ 
        error: 'No results found with the specified criteria. Make sure the date range contains data from allowed agents (sia-uttyler-prod, sia-msu-prod, sia-gvsu-prod).' 
      });
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
    const values = [HEADERS, ...rows];

    // Append new rows
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: SHEET,
      });
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
      message: `${rows.length} rows added to Google Sheet`,
      count: rows.length
    });
  } catch (err) {
    console.error('Error in addToSheetsController:', err);
    res
      .status(500)
      .json({ error: 'Failed to add to Google Sheets', details: err.message });
  }
}
