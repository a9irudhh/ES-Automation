import * as dotenv from 'dotenv';
dotenv.config();

import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import axios from 'axios';

const esEndpoint = process.env.ES_ENDPOINT;

async function getAWSSignedRequest(method, fullUrl, body = undefined) {
  const url = new URL(fullUrl);
  
  // Use environment variables directly for credentials
  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  };
  
  // Create signature v4 signer with proper SHA256 constructor
  const signer = new SignatureV4({
    credentials,
    region: process.env.AWS_REGION,
    service: 'es',
    sha256: Sha256,
  });

  const request = {
    method,
    hostname: url.hostname,
    path: url.pathname + url.search,
    protocol: url.protocol,
    headers: {
      'Content-Type': 'application/json',
      'host': url.hostname,
    },
  };

  if (body) {
    request.body = JSON.stringify(body);
  }

  const signedRequest = await signer.sign(request);
  return {
    url: fullUrl,
    headers: signedRequest.headers
  };
}

export async function searchTranscripts(env, fromDate, toDate, allowedAgents = null) {
  const index = `${env}_sia_transcript_details`;
  
  const filters = [
    { range: { processed_on: { gte: fromDate, lte: toDate } } }
  ];
  
  // Add agent filter if provided
  if (allowedAgents && allowedAgents.length > 0) {
    filters.push({
      terms: { "request.agent": allowedAgents }
    });
  }
  
  const queryBody = {
    query: {
      bool: {
        filter: filters
      }
    },
    _source: [
      "uploaded_date",
      "original_filename", 
      "request.agent",
      "final_reviewer",
      "processed_by",
      "processed_on",
      "reviewer_aht",
      "validator_aht", 
      "status",
      "institution_name",
      "pages",
      "confidence_score"
    ]
  };
  
  const fullUrl = `${esEndpoint}/${index}/_search`;
  
  try {
    const { url, headers } = await getAWSSignedRequest('GET', fullUrl, queryBody);
    
    const response = await axios({
      method: 'get',
      url,
      headers,
      data: queryBody
    });
    
    return response.data.hits.hits;
  } catch (error) {
    console.error('Elasticsearch request failed:', {
      url: fullUrl,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
    // Re-throw with more context
    if (error.response?.status === 403) {
      const awsError = error.response.data?.Message || error.response.data?.message || 'Access denied';
      throw new Error(`AWS Elasticsearch Access Denied: ${awsError}. Please check your AWS credentials and IAM permissions.`);
    }
    
    throw error;
  }
}

// Validate AWS credentials
export async function validateAWSCredentials() {
  const requiredVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_REGION'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required AWS environment variables: ${missingVars.join(', ')}`);
  }
  
  try {
    const testUrl = `${esEndpoint}/_cluster/health`;
    const { url, headers } = await getAWSSignedRequest('GET', testUrl);
    
    const response = await axios({
      method: 'get',
      url,
      headers,
      timeout: 10000
    });
    
    return { valid: true, status: response.status };
  } catch (error) {
    console.error('AWS credentials validation failed:', error.response?.data);
    return { 
      valid: false, 
      error: error.response?.data?.Message || error.message,
      status: error.response?.status
    };
  }
}
