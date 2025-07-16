import express from 'express';
import { searchController } from '../controllers/search.controller.js';
import { addToSheetsController } from '../controllers/addToSheets.controller.js';

const router = express.Router();

router.route('/search').get(searchController);
router.route('/addToSheets').get(addToSheetsController);

export default router;
