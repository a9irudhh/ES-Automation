import * as dotenv from 'dotenv';
dotenv.config();
console.log('Loaded ES_ENDPOINT:', process.env.ES_ENDPOINT);

import AWS from 'aws-sdk';
import axios from 'axios';
import aws4 from 'aws4';

AWS.config.update({ region: process.env.AWS_REGION });

const esEndpoint = process.env.ES_ENDPOINT;

function getAWSSignedRequest(method, path, body = undefined) {
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
  const body = {
    query: {
      bool: {
        filter: [
          { range: { uploaded_date: { gte: fromDate, lte: toDate } } }
        ]
      }
    }
  };
  const opts = getAWSSignedRequest('POST', path, body);
  const url = `${esEndpoint}${path}`;
  const response = await axios({
    method: 'post',
    url,
    headers: opts.headers,
    data: body,
    params: {},
    transformRequest: [(data, headers) => {
      return JSON.stringify(data);
    }]
  });
  return response.data.hits.hits;
}
