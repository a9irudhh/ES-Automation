import { searchTranscripts } from '../esClient.js';

export async function searchController(req, res) {
  const { env, fromDate, toDate } = req.query;
  if (!env || !fromDate || !toDate) {
    return res.status(400).json({ error: 'Missing query parameters: env, fromDate, toDate are required' });
  }

  try {
    const hits = await searchTranscripts(env, fromDate, toDate);
    const results = hits.map(hit => hit._source);
    return res.json({ count: results.length, results });
  } catch (err) {
    console.error('Error in searchController:', err);
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
}
