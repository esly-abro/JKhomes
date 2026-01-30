# Google Sheets Property Sync Setup Guide

## Overview
This guide explains how to set up automatic synchronization of property data and scheduled site visits to Google Sheets. The data will be used by the ElevenLabs AI agent to answer customer questions about properties and availability.

## Your Google Sheet
- **Spreadsheet URL**: https://docs.google.com/spreadsheets/d/1FWMTLGGPV8MfhsMpz7L8FDpeL8YVUQtAed0HKBlZFtw/edit
- **Sheets Created**: 
  - `Properties` - All property information
  - `ScheduledVisits` - All scheduled site visits

## Data That Will Be Synced

### Properties Sheet - Property Information
| Column | Description |
|--------|-------------|
| Property ID | Unique identifier |
| Name | Property name |
| Property Type | Villa, Apartment, Plot, Commercial, etc. |
| Location | Full address/area |
| Status | Available, Sold, Reserved, Under Construction |
| Price Min (INR) | Minimum price |
| Price Max (INR) | Maximum price |
| Size (sqft) | Property size |
| Bedrooms | Number of bedrooms |
| Bathrooms | Number of bathrooms |
| Description | Detailed description |
| Amenities | List of amenities |
| Assigned Agent | Agent name |
| Agent Phone | Agent contact number |
| Agent Email | Agent email |
| Interested Leads Count | Number of interested leads |

### Properties Sheet - Site Visit Availability (for AI Agent)
| Column | Description |
|--------|-------------|
| Site Visits Enabled | Yes/No |
| Available Days | Monday, Tuesday, etc. |
| Time Slots | Available time slots (e.g., 09:00-10:00, 10:00-11:00) |
| Slot Duration (mins) | Duration of each slot |
| Buffer Time (mins) | Time between visits |
| Max Visits Per Day | Maximum visits allowed |
| Advance Booking Days | How far ahead bookings are allowed |
| Min Advance Hours | Minimum hours before visit |
| Blocked Dates | Dates when visits are not available |
| Special Hours/Closures | Special operating hours or closures |

### ScheduledVisits Sheet - Booked Site Visits
| Column | Description |
|--------|-------------|
| Visit ID | Unique visit identifier |
| Property ID | Associated property |
| Property Name | Name of the property |
| Property Location | Location of the property |
| Lead Name | Customer name |
| Lead Phone | Customer phone |
| Scheduled Date | Visit date (e.g., Friday, January 24, 2026) |
| Time Slot | Visit time (e.g., 10:00 - 11:00) |
| Duration (mins) | Visit duration |
| Status | scheduled, completed, cancelled, no_show |
| Agent Name | Assigned agent |
| Notes | Visit notes |
| Created At | When visit was scheduled |
| Last Updated | Last sync time |

---

## Setup Instructions

### Step 1: Set Up Google Apps Script

1. **Open your Google Sheet**:
   - Go to https://docs.google.com/spreadsheets/d/1FWMTLGGPV8MfhsMpz7L8FDpeL8YVUQtAed0HKBlZFtw/edit

2. **Open Apps Script Editor**:
   - Click on **Extensions** > **Apps Script**
   - This opens a new tab with the Apps Script editor

3. **Copy the Script**:
   - Delete any existing code in the editor
   - Open the file `GOOGLE_APPS_SCRIPT.js` from your project
   - Copy ALL the code from that file
   - Paste it into the Apps Script editor

4. **Save the Project**:
   - Press `Ctrl+S` (Windows) or `Cmd+S` (Mac)
   - Name the project: "JK Construction Property Sync"

5. **Deploy as Web App**:
   - Click **Deploy** > **New deployment**
   - Click the gear icon ⚙️ and select **Web app**
   - Configure:
     - **Description**: "Property Sync v1"
     - **Execute as**: "Me"
     - **Who has access**: "Anyone"
   - Click **Deploy**

6. **Authorize the App**:
   - Click "Authorize access"
   - Select your Google account
   - Click "Advanced" > "Go to JK Construction Property Sync (unsafe)"
   - Click "Allow"

7. **Copy the Web App URL**:
   - After deployment, you'll see a URL like:
     ```
     https://script.google.com/macros/s/AKfycbx.../exec
     ```
   - Copy this URL

### Step 2: Configure Your Backend

1. **Update .env file**:
   - Open `app-backend/.env`
   - Find the line `GOOGLE_APPS_SCRIPT_URL=`
   - Paste your Web App URL:
     ```
     GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
     ```

2. **Restart the Backend**:
   ```bash
   cd app-backend
   npm start
   ```

### Step 3: Test the Integration

1. **Using the API** (requires authentication):
   ```bash
   # Sync all properties to Google Sheets
   POST /api/properties/sync-google-sheets
   
   # Check sync status
   GET /api/properties/sync-status
   ```

2. **Automatic Sync**:
   - Properties will automatically sync when:
     - A new property is created
     - A property is updated
     - A property is deleted
     - Interested lead count changes

---

## API Endpoints

### Properties Sync

#### Sync All Properties
```http
POST /api/properties/sync-google-sheets
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Synced 15 properties to Google Sheets",
  "result": {
    "success": true,
    "action": "full_sync",
    "count": 15
  }
}
```

#### Check Sync Status
```http
GET /api/properties/sync-status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "configured": true,
  "sheets": {
    "properties": { "name": "Properties", "count": 15 },
    "siteVisits": { "name": "ScheduledVisits", "count": 8 }
  },
  "totalProperties": 15,
  "totalSiteVisits": 8,
  "lastUpdate": "2026-01-23T10:30:00.000Z"
}
```

### Site Visits Sync

#### Sync All Site Visits
```http
POST /api/site-visits/sync-google-sheets
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Synced 8 site visits to Google Sheets",
  "result": {
    "success": true,
    "action": "full_sync",
    "count": 8
  }
}
```

---

## Automatic Sync Triggers

Data is automatically synced to Google Sheets when:

### Properties
- ✅ A new property is created
- ✅ A property is updated (name, location, price, status, etc.)
- ✅ A property is deleted
- ✅ Interested lead count changes

### Site Visits
- ✅ A new site visit is scheduled
- ✅ (Manual sync available for bulk updates)

---

## How the ElevenLabs Agent Uses This Data

The ElevenLabs AI agent can access this Google Sheet to answer customer questions like:

1. **Property Availability**:
   - "What properties are available in Whitefield?"
   - "Do you have any 3BHK villas under 1 crore?"

2. **Site Visit Scheduling**:
   - "When can I visit the villa in Sarjapur?"
   - "Are site visits available on weekends?"
   - "What time slots are open for property viewing?"

3. **Property Details**:
   - "What amenities does the Green Valley apartment have?"
   - "How big is the plot in Electronic City?"
   - "Who is the agent handling the Whitefield villa?"

4. **Pricing**:
   - "What is the price range for apartments in Koramangala?"
   - "Are there any properties under 50 lakhs?"

---

## Troubleshooting

### Sync Not Working

1. **Check if GOOGLE_APPS_SCRIPT_URL is set**:
   ```bash
   # In app-backend directory
   grep GOOGLE_APPS_SCRIPT_URL .env
   ```

2. **Verify the Web App is deployed**:
   - Go to your Apps Script project
   - Click **Deploy** > **Manage deployments**
   - Check if there's an active deployment

3. **Check backend logs**:
   - Look for `[GoogleSheets]` log entries
   - Error messages will show what's wrong

### Authorization Issues

1. **Re-authorize the app**:
   - In Apps Script, click **Deploy** > **Test deployments**
   - Click the URL to test
   - Re-authorize if prompted

2. **Check permissions**:
   - Make sure "Who has access" is set to "Anyone"

### Data Not Appearing

1. **Check the sheet name**:
   - Sheet must be named "Properties" (case-sensitive)

2. **Verify data in MongoDB**:
   - Use the API to list properties
   - Ensure properties exist in the database

---

## Security Notes

1. **Web App Access**: The Apps Script web app is set to "Anyone" for access, but it only accepts POST requests with specific actions.

2. **No Sensitive Data**: The sync only includes property information, not user credentials or sensitive business data.

3. **Read-Only for ElevenLabs**: Configure ElevenLabs to only read from the sheet, not write.

---

## Support

If you encounter issues:
1. Check the backend logs for error messages
2. Test the Apps Script using the built-in test function
3. Verify your Google Sheet permissions
