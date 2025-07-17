# ES-Query - Data Export Dashboard

A Node.js application that queries Elasticsearch data and exports it to Google Sheets. This tool provides a web interface for users to export transcript data within specified date ranges.

## Features

- Web-based dashboard with user authentication
- Query Elasticsearch for transcript data
- Export data to Google Sheets
- Date range filtering
- Shift calculation (Day/Night shifts)
- Basic authentication for security

## Prerequisites

Before running this application, make sure you have:

- Node.js (version 14 or higher)
- AWS credentials with Elasticsearch access
- Google Cloud service account credentials
- Access to a Google Sheets document

## Installation

1. Clone or download the project files
2. Navigate to the project directory
3. Install dependencies:
   ```bash
   npm install
   ```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

### AWS Configuration
- `AWS_REGION` - Your AWS region (e.g., us-east-1)
- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- `AWS_SESSION_TOKEN` - AWS session token (if using temporary credentials)
- `ES_ENDPOINT` - Your Elasticsearch endpoint URL

### Google Sheets Configuration
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to your Google service account JSON file
- `SPREADSHEET_ID` - The ID of your Google Sheets document
- `SHEET_NAME` - The name of the sheet tab (e.g., Sheet1)

### Authentication
- `BASIC_AUTH_USERNAME` - Username for accessing the dashboard
- `BASIC_AUTH_PASSWORD` - Password for accessing the dashboard

### Server Configuration
- `PORT` - Port number for the server (optional, defaults to 3001)
- `BASE_URL` - Base URL for the application (used for deployment)

## Example .env File

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-here
AWS_SECRET_ACCESS_KEY=your-secret-key-here
AWS_SESSION_TOKEN=your-session-token-here
ES_ENDPOINT=https://your-elasticsearch-domain.us-east-1.es.amazonaws.com
GOOGLE_APPLICATION_CREDENTIALS=./your-service-account-file.json
SPREADSHEET_ID=your-google-sheets-id
SHEET_NAME=Sheet1
BASIC_AUTH_USERNAME=your-username
BASIC_AUTH_PASSWORD=your-password
BASE_URL=http://localhost
PORT=3001
```

## Google Cloud Setup

1. Create a Google Cloud project
2. Enable the Google Sheets API
3. Create a service account
4. Download the service account JSON file
5. Place the JSON file in your project directory
6. Share your Google Sheet with the service account email

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
node server.js
```

The application will start on the specified port (default: 3001) and can be accessed at `http://localhost:3001`

## Deployment to AWS EC2

When deploying to AWS EC2, follow these steps:

### 1. Prepare Your EC2 Instance
- Launch an EC2 instance with Node.js installed
- Configure security groups to allow HTTP/HTTPS traffic
- Set up a domain name or use the EC2 public DNS

### 2. Update Environment Variables
Update your `.env` file on the server:
```
BASE_URL=https://your-domain.com
PORT=80
```

Or set environment variables directly:
```bash
export BASE_URL=https://your-domain.com
export PORT=80
```

### 3. Install Dependencies
```bash
npm install --production
```

### 4. Start the Application
For production, consider using PM2 for process management:
```bash
npm install -g pm2
pm2 start server.js --name "es-query"
pm2 startup
pm2 save
```

## Usage

1. Open your web browser and navigate to the application URL
2. Log in using the credentials set in your environment variables
3. Select the date range for data export
4. Click "Export to Sheets" to transfer data to Google Sheets

## API Endpoints

- `GET /api/search` - Search for transcript data
- `POST /api/addToSheets` - Export data to Google Sheets
- `GET /api/test-auth` - Test authentication

## Security Notes

- Never commit your `.env` file to version control
- Use strong passwords for basic authentication
- Regularly rotate your AWS credentials
- Keep your Google service account JSON file secure
- Use HTTPS in production environments

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Check your username and password in the `.env` file
   - Ensure the credentials match what you're entering

2. **Google Sheets Access Denied**
   - Verify your service account JSON file path
   - Make sure the Google Sheet is shared with your service account email
   - Check that the Google Sheets API is enabled

3. **Elasticsearch Connection Issues**
   - Verify your AWS credentials are correct
   - Check that your Elasticsearch endpoint URL is accessible
   - Ensure your AWS session token is not expired

4. **No Data Found**
   - Check your date range selection
   - Verify the Elasticsearch index exists
   - Ensure your query parameters are correct

## File Structure

```
ES-Automation/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (create this)
├── esClient.js            # Elasticsearch client
├── controllers/           # Request handlers
│   ├── search.controller.js
│   └── addToSheets.controller.js
├── middleware/            # Authentication middleware
│   └── auth.js
├── routes/               # API routes
│   └── search.route.js
└── public/               # Static files
    └── index.html        # Web dashboard
```

## Support

If you encounter any issues:
1. Check the console logs for error messages
2. Verify all environment variables are set correctly
3. Ensure all required services (AWS, Google Sheets) are accessible
4. Check file permissions for the Google service account JSON file

## License

This project is licensed under the ISC License.
