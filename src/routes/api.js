import { Router } from 'express';
import { chatRequestSchema, eventInputSchema, formatIssues } from '../validation.js';

/** Sends a 400 with field-level messages the UI can show next to inputs. */
function badRequest(res, error) {
  return res.status(400).json({ error: 'Invalid request', details: formatIssues(error) });
}

/**
 * JSON API routes.
 * @param {{planner: ReturnType<import('../services/planner.js').createPlanner>, aiEnabled: boolean, model: string}} deps
 */
export function createApiRouter({ planner, aiEnabled, model }) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', ai: aiEnabled, model: aiEnabled ? model : null });
  });

  router.post('/plan', async (req, res) => {
    const parsed = eventInputSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const plan = await planner.generatePlan(parsed.data);
    res.status(201).json({ plan });
  });

  router.post('/chat', async (req, res) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const { plan, message, history } = parsed.data;
    const result = await planner.refinePlan(plan, message, history);
    res.json(result);
  });

  return router;
}
