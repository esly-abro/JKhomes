/**
 * Google Apps Script - Property & Site Visit Sync Handler
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1FWMTLGGPV8MfhsMpz7L8FDpeL8YVUQtAed0HKBlZFtw/edit
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire script
 * 4. Save the project (Ctrl+S or Cmd+S)
 * 5. Click "Deploy" > "New deployment"
 * 6. Select "Web app" as the type
 * 7. Set "Execute as" to "Me"
 * 8. Set "Who has access" to "Anyone"
 * 9. Click "Deploy"
 * 10. Authorize the app when prompted
 * 11. Copy the Web app URL and add it to your .env file as GOOGLE_APPS_SCRIPT_URL
 * 
 * Example .env entry:
 * GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
 */

const PROPERTIES_SHEET = 'Properties';
const SITE_VISITS_SHEET = 'ScheduledVisits';

/**
 * Handle POST requests from the backend
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    let result;
    
    switch (action) {
      // Property actions
      case 'upsertProperty':
        result = upsertProperty(data.propertyId, data.data, data.headers);
        break;
      case 'syncAllProperties':
        result = syncAllProperties(data.headers, data.data);
        break;
      case 'deleteProperty':
        result = deleteProperty(data.propertyId);
        break;
      
      // Site Visit actions
      case 'upsertSiteVisit':
        result = upsertSiteVisit(data.visitId, data.data, data.headers);
        break;
      case 'syncAllSiteVisits':
        result = syncAllSiteVisits(data.headers, data.data);
        break;
      case 'deleteSiteVisit':
        result = deleteSiteVisit(data.visitId);
        break;
      
      // Status
      case 'getStatus':
        result = getStatus();
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle GET requests (for testing)
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'JK Construction Property & Site Visit Sync Service',
    timestamp: new Date().toISOString(),
    sheets: [PROPERTIES_SHEET, SITE_VISITS_SHEET]
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get or create a sheet by name
 */
function getSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  return sheet;
}

/**
 * Initialize sheet with headers if needed
 */
function initializeHeaders(sheet, headers) {
  const lastColumn = sheet.getLastColumn();
  
  if (lastColumn === 0 || sheet.getRange(1, 1).getValue() !== headers[0]) {
    // Set headers
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4a90d9');
    headerRange.setFontColor('#ffffff');
    headerRange.setWrap(true);
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    // Auto-resize columns
    for (let i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
  }
}

/**
 * Find row by ID in first column
 */
function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) { // Start from 1 to skip header
    if (data[i][0] === id) {
      return i + 1; // Sheet rows are 1-indexed
    }
  }
  
  return -1; // Not found
}

// =====================================================
// PROPERTY FUNCTIONS
// =====================================================

/**
 * Upsert (insert or update) a property
 */
function upsertProperty(propertyId, rowData, headers) {
  const sheet = getSheet(PROPERTIES_SHEET);
  initializeHeaders(sheet, headers);
  
  const existingRow = findRowById(sheet, propertyId);
  
  if (existingRow > 0) {
    // Update existing row
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    return { success: true, action: 'updated', row: existingRow };
  } else {
    // Insert new row
    sheet.appendRow(rowData);
    const newRow = sheet.getLastRow();
    return { success: true, action: 'inserted', row: newRow };
  }
}

/**
 * Sync all properties (full refresh)
 */
function syncAllProperties(headers, allData) {
  const sheet = getSheet(PROPERTIES_SHEET);
  
  // Clear existing data (keep headers)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  // Initialize headers
  initializeHeaders(sheet, headers);
  
  // Insert all data
  if (allData && allData.length > 0) {
    sheet.getRange(2, 1, allData.length, allData[0].length).setValues(allData);
  }
  
  // Apply conditional formatting for status
  applyPropertyStatusFormatting(sheet, headers);
  
  return { 
    success: true, 
    action: 'full_sync', 
    count: allData ? allData.length : 0 
  };
}

/**
 * Delete a property by ID
 */
function deleteProperty(propertyId) {
  const sheet = getSheet(PROPERTIES_SHEET);
  const row = findRowById(sheet, propertyId);
  
  if (row > 0) {
    sheet.deleteRow(row);
    return { success: true, action: 'deleted', propertyId: propertyId };
  }
  
  return { success: false, error: 'Property not found', propertyId: propertyId };
}

// =====================================================
// SITE VISIT FUNCTIONS
// =====================================================

/**
 * Upsert (insert or update) a site visit
 */
function upsertSiteVisit(visitId, rowData, headers) {
  const sheet = getSheet(SITE_VISITS_SHEET);
  initializeHeaders(sheet, headers);
  
  const existingRow = findRowById(sheet, visitId);
  
  if (existingRow > 0) {
    // Update existing row
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    return { success: true, action: 'updated', row: existingRow };
  } else {
    // Insert new row
    sheet.appendRow(rowData);
    const newRow = sheet.getLastRow();
    return { success: true, action: 'inserted', row: newRow };
  }
}

/**
 * Sync all site visits (full refresh)
 */
function syncAllSiteVisits(headers, allData) {
  const sheet = getSheet(SITE_VISITS_SHEET);
  
  // Clear existing data (keep headers)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  // Initialize headers
  initializeHeaders(sheet, headers);
  
  // Insert all data
  if (allData && allData.length > 0) {
    sheet.getRange(2, 1, allData.length, allData[0].length).setValues(allData);
  }
  
  // Apply conditional formatting for visit status
  applySiteVisitStatusFormatting(sheet, headers);
  
  return { 
    success: true, 
    action: 'full_sync', 
    count: allData ? allData.length : 0 
  };
}

/**
 * Delete a site visit by ID
 */
function deleteSiteVisit(visitId) {
  const sheet = getSheet(SITE_VISITS_SHEET);
  const row = findRowById(sheet, visitId);
  
  if (row > 0) {
    sheet.deleteRow(row);
    return { success: true, action: 'deleted', visitId: visitId };
  }
  
  return { success: false, error: 'Site visit not found', visitId: visitId };
}

// =====================================================
// STATUS AND FORMATTING
// =====================================================

/**
 * Get sync status
 */
function getStatus() {
  const propertiesSheet = getSheet(PROPERTIES_SHEET);
  const visitsSheet = getSheet(SITE_VISITS_SHEET);
  
  const propertiesCount = Math.max(0, propertiesSheet.getLastRow() - 1);
  const visitsCount = Math.max(0, visitsSheet.getLastRow() - 1);
  const lastUpdate = new Date().toISOString();
  
  return {
    success: true,
    configured: true,
    sheets: {
      properties: {
        name: PROPERTIES_SHEET,
        count: propertiesCount
      },
      siteVisits: {
        name: SITE_VISITS_SHEET,
        count: visitsCount
      }
    },
    totalProperties: propertiesCount,
    totalSiteVisits: visitsCount,
    lastUpdate: lastUpdate
  };
}

/**
 * Apply conditional formatting for property status
 */
function applyPropertyStatusFormatting(sheet, headers) {
  // Find Status column (index 4 = column E)
  const statusColIndex = headers.indexOf('Status') + 1;
  if (statusColIndex <= 0) return;
  
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const statusRange = sheet.getRange(2, statusColIndex, lastRow - 1, 1);
  
  // Clear existing rules for this range
  const rules = sheet.getConditionalFormatRules();
  const filteredRules = rules.filter(rule => {
    const ranges = rule.getRanges();
    return !ranges.some(r => r.getColumn() === statusColIndex);
  });
  
  // Available - Green
  const availableRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Available')
    .setBackground('#c6efce')
    .setFontColor('#006100')
    .setRanges([statusRange])
    .build();
  
  // Sold - Red
  const soldRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Sold')
    .setBackground('#ffc7ce')
    .setFontColor('#9c0006')
    .setRanges([statusRange])
    .build();
  
  // Reserved - Yellow
  const reservedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Reserved')
    .setBackground('#ffeb9c')
    .setFontColor('#9c6500')
    .setRanges([statusRange])
    .build();
  
  // Under Construction - Blue
  const constructionRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Under Construction')
    .setBackground('#c6d9f0')
    .setFontColor('#0070c0')
    .setRanges([statusRange])
    .build();
  
  filteredRules.push(availableRule, soldRule, reservedRule, constructionRule);
  sheet.setConditionalFormatRules(filteredRules);
}

/**
 * Apply conditional formatting for site visit status
 */
function applySiteVisitStatusFormatting(sheet, headers) {
  // Find Status column
  const statusColIndex = headers.indexOf('Status') + 1;
  if (statusColIndex <= 0) return;
  
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const statusRange = sheet.getRange(2, statusColIndex, lastRow - 1, 1);
  
  // Clear existing rules for this range
  const rules = sheet.getConditionalFormatRules();
  const filteredRules = rules.filter(rule => {
    const ranges = rule.getRanges();
    return !ranges.some(r => r.getColumn() === statusColIndex);
  });
  
  // Scheduled - Blue
  const scheduledRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('scheduled')
    .setBackground('#c6d9f0')
    .setFontColor('#0070c0')
    .setRanges([statusRange])
    .build();
  
  // Completed - Green
  const completedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('completed')
    .setBackground('#c6efce')
    .setFontColor('#006100')
    .setRanges([statusRange])
    .build();
  
  // Cancelled - Red
  const cancelledRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('cancelled')
    .setBackground('#ffc7ce')
    .setFontColor('#9c0006')
    .setRanges([statusRange])
    .build();
  
  // No Show - Yellow
  const noShowRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('no_show')
    .setBackground('#ffeb9c')
    .setFontColor('#9c6500')
    .setRanges([statusRange])
    .build();
  
  filteredRules.push(scheduledRule, completedRule, cancelledRule, noShowRule);
  sheet.setConditionalFormatRules(filteredRules);
}

/**
 * Test function - can be run manually from Apps Script editor
 */
function testSync() {
  // Test Properties
  const testPropertyHeaders = [
    'Property ID', 'Name', 'Category', 'Location', 'Status',
    'Price Min (INR)', 'Price Max (INR)', 'Size (sqft)', 'Bedrooms', 'Bathrooms',
    'Description', 'Amenities', 'Assigned Agent', 'Agent Phone', 'Agent Email',
    'Interested Leads Count', 'Site Visits Enabled', 'Available Days', 'Time Slots',
    'Slot Duration (mins)', 'Buffer Time (mins)', 'Max Visits Per Day',
    'Advance Booking Days', 'Min Advance Hours', 'Blocked Dates', 'Special Hours/Closures',
    'Created At', 'Updated At', 'Last Synced'
  ];
  
  const testPropertyData = [
    [
      'test-property-123', 'Sample Villa', 'Villa', 'Whitefield, Bangalore', 'Available',
      '5000000', '6000000', '2500', '3', '3',
      'Beautiful villa with garden', 'Swimming Pool, Gym, Garden', 'John Agent', '+91 9876543210', 'john@example.com',
      '5', 'Yes', 'Monday, Tuesday, Wednesday, Thursday, Friday, Saturday', '09:00-10:00, 10:00-11:00, 14:00-15:00',
      '60', '30', '8', '30', '2', 'None', 'None',
      new Date().toLocaleString(), new Date().toLocaleString(), new Date().toLocaleString()
    ]
  ];
  
  const propResult = syncAllProperties(testPropertyHeaders, testPropertyData);
  Logger.log('Properties sync result: ' + JSON.stringify(propResult));
  
  // Test Site Visits
  const testVisitHeaders = [
    'Visit ID', 'Property ID', 'Property Name', 'Property Location',
    'Lead Name', 'Lead Phone', 'Scheduled Date', 'Time Slot',
    'Duration (mins)', 'Status', 'Agent Name', 'Notes',
    'Created At', 'Last Updated'
  ];
  
  const testVisitData = [
    [
      'test-visit-123', 'test-property-123', 'Sample Villa', 'Whitefield, Bangalore',
      'Test Lead', '+91 9876543210', 'Friday, January 24, 2026', '10:00 - 11:00',
      '60', 'scheduled', 'John Agent', 'First site visit for this lead',
      new Date().toLocaleString(), new Date().toLocaleString()
    ]
  ];
  
  const visitResult = syncAllSiteVisits(testVisitHeaders, testVisitData);
  Logger.log('Site visits sync result: ' + JSON.stringify(visitResult));
  
  // Get status
  const status = getStatus();
  Logger.log('Status: ' + JSON.stringify(status));
}

/**
 * Create a menu for manual operations
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('JK Construction')
    .addItem('Run Test Sync', 'testSync')
    .addItem('Get Status', 'showStatus')
    .addToUi();
}

/**
 * Show status in alert
 */
function showStatus() {
  const status = getStatus();
  SpreadsheetApp.getUi().alert(
    'Sync Status',
    'Properties: ' + status.totalProperties + '\n' +
    'Site Visits: ' + status.totalSiteVisits + '\n' +
    'Last Update: ' + status.lastUpdate,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
