import * as dotenv from 'dotenv';
dotenv.config();
// console.log('Loaded ES_ENDPOINT:', process.env.ES_ENDPOINT);

import AWS from 'aws-sdk';
import axios from 'axios';
import aws4 from 'aws4';

AWS.config.update({ region: process.env.AWS_REGION });

const esEndpoint = process.env.ES_ENDPOINT;

function getAWSSignedRequest(method, path, body = undefined, query = undefined) {
  const url = new URL(esEndpoint);
  const opts = {
    host: url.hostname,
    path,
    service: 'es',
    region: process.env.AWS_REGION,
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  };
  if (query) {
    opts.path += '?' + new URLSearchParams(query).toString();
  }
  aws4.sign(opts, {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  });
  return opts;
}

export async function searchTranscripts(env, fromDate, toDate) {
  const index = `${env}_sia_transcript_details`;
  const path = `/${index}/_search`;
  const queryBody = {
    query: {
      bool: {
        filter: [
          { range: { processed_on: { gte: fromDate, lte: toDate } } }
        ]
      }
    }
  };
  // Use GET with source param for ESHttpGet permission
  const query = {
    source: JSON.stringify(queryBody),
    source_content_type: 'application/json'
  };
  const opts = getAWSSignedRequest('GET', path, undefined, query);
  const url = `${esEndpoint}${path}?${new URLSearchParams(query).toString()}`;
  const response = await axios({
    method: 'get',
    url,
    headers: opts.headers
  });
  return response.data.hits.hits;
}
