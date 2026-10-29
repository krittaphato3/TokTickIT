import { Router } from 'express';
import { requireAuthCoded } from '../controllers/actions.controller.js';
import {
  requesterDashboardHandler,
  staffDashboardHandler,
} from '../controllers/dashboard.controller.js';

export const dashboardRouter = Router();

dashboardRouter.get('/requester', requireAuthCoded, requesterDashboardHandler);
dashboardRouter.get('/staff', requireAuthCoded, staffDashboardHandler);
