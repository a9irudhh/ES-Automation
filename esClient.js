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

export async function searchTranscripts(env, fromDate, toDate) {
  const index = `${env}_sia_transcript_details`;
  const queryBody = {
    query: {
      bool: {
        filter: [
          { range: { processed_on: { gte: fromDate, lte: toDate } } }
        ]
      }
    }
  };
  
  const fullUrl = `${esEndpoint}/${index}/_search`;
  
  const { url, headers } = await getAWSSignedRequest('POST', fullUrl, queryBody);
  
  const response = await axios({
    method: 'post',
    url,
    headers,
    data: queryBody
  });
  
  return response.data.hits.hits;
}
