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

export async function searchTranscripts(env, fromDate, toDate, allowedAgents = null, agentField = "request.agent") {
  const index = `${env}_sia_transcript_details`;
  // console.log(`Searching index: ${index} from ${fromDate} to ${toDate} for agents:`, allowedAgents);
  
  const filters = [
    { range: { processed_on: { gte: fromDate, lte: toDate } } }
  ];
  
  // console.log('Base filter (date range):', JSON.stringify(filters[0], null, 2));
  
  // Add agent filter if provided
  if (allowedAgents && allowedAgents.length > 0) {
    // Try with .keyword suffix first for exact matching
    const keywordField = agentField + '.keyword';
    const agentFilter = {
      terms: { [keywordField]: allowedAgents }
    };
    filters.push(agentFilter);
    // console.log(`Added agent filter using field '${keywordField}':`, JSON.stringify(agentFilter, null, 2));
  } else {
    console.log('No agent filter applied - will search all agents');
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
    ],
    size: 1000  // Increase the default size limit
  };
  
  // console.log('Complete Elasticsearch query:', JSON.stringify(queryBody, null, 2));
  
  const fullUrl = `${esEndpoint}/${index}/_search`;
  
  try {
    const { url, headers } = await getAWSSignedRequest('GET', fullUrl, queryBody);
    
    const response = await axios({
      method: 'get',
      url,
      headers,
      data: queryBody
    });    
    // console.log(`Elasticsearch response status: ${response.status}`);
    // console.log(`Total hits found: ${response.data.hits.total?.value || response.data.hits.total}`);
    // console.log(`Hits returned: ${response.data.hits.hits.length}`);
    
    if (response.data.hits.hits.length > 0) {
      // console.log('Sample hit _source:', JSON.stringify(response.data.hits.hits[0]._source, null, 2));
      
      // Log all unique agents in the results
      const agentsInResults = response.data.hits.hits
        .map(hit => hit._source.request?.agent)
        .filter(Boolean);
      const uniqueAgentsInResults = [...new Set(agentsInResults)];
      // console.log('Unique agents in results:', uniqueAgentsInResults);
    }
    
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

export async function countTranscriptsByAgent(env, fromDate, toDate, agents = null) {
  const index = `${env}_sia_transcript_details`;
  console.log(`Counting entries in index: ${index} from ${fromDate} to ${toDate} for agents:`, agents);
  
  const filters = [
    { range: { processed_on: { gte: fromDate, lte: toDate } } }
  ];
  
  // Add agent filter if provided
  if (agents && agents.length > 0) {
    filters.push({
      terms: { "request.agent": agents }
    });
  }
  
  const queryBody = {
    query: {
      bool: {
        filter: filters
      }
    },
    aggs: {
      agents: {
        terms: {
          field: "request.agent",
          size: 100
        }
      }
    },
    size: 0  // We only want the aggregation, not the actual documents
  };
  
  console.log('Count query:', JSON.stringify(queryBody, null, 2));
  
  const fullUrl = `${esEndpoint}/${index}/_search`;
  
  try {
    const { url, headers } = await getAWSSignedRequest('GET', fullUrl, queryBody);
    
    const response = await axios({
      method: 'get',
      url,
      headers,
      data: queryBody
    });

    console.log(`Count response status: ${response.status}`);
    console.log(`Total matching documents: ${response.data.hits.total?.value || response.data.hits.total}`);
    
    const agentBuckets = response.data.aggregations?.agents?.buckets || [];
    const agentCounts = {};
    
    agentBuckets.forEach(bucket => {
      agentCounts[bucket.key] = bucket.doc_count;
    });
    
    console.log('Agent counts from aggregation:', agentCounts);
    
    return {
      total: response.data.hits.total?.value || response.data.hits.total,
      agentCounts: agentCounts
    };
    
  } catch (error) {
    console.error('Elasticsearch count request failed:', {
      url: fullUrl,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
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
