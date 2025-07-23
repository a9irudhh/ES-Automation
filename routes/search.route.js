import express from 'express';
import { searchController } from '../controllers/search.controller.js';
import { addToSheetsController } from '../controllers/addToSheets.controller.js';

const router = express.Router();

router.route('/search').get(searchController);
router.route('/addToSheets').get(addToSheetsController);

// Test auth route for login validation
router.route('/test-auth').get((req, res) => {
  res.json({ message: 'Authentication successful' });
});

export default router;
