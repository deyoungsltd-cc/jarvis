import { Router, Request, Response, NextFunction } from 'express';
import { toolService } from '../services/toolService.js';
import { badRequest } from '../utils/errors.js';

const router = Router();

/** GET /tools — list all tools */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tools = await toolService.list();
    res.json(tools.map(t => ({
      ...t,
      inputSchema: t.inputSchema ? JSON.parse(t.inputSchema) : null,
      outputSchema: t.outputSchema ? JSON.parse(t.outputSchema) : null,
    })));
  } catch (err) { next(err); }
});

/** GET /tools/:name — get a tool */
router.get('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const tool = await toolService.getByName(req.params.name, requestId);
    res.json({
      ...tool,
      inputSchema: tool.inputSchema ? JSON.parse(tool.inputSchema) : null,
      outputSchema: tool.outputSchema ? JSON.parse(tool.outputSchema) : null,
    });
  } catch (err) { next(err); }
});

/** POST /tools — register a tool */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const { name, description } = req.body;
    if (!name || typeof name !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'Tool name is required', requestId);
    }
    if (!description || typeof description !== 'string') {
      throw badRequest('VALIDATION_ERROR', 'Tool description is required', requestId);
    }
    const tool = await toolService.create(req.body, requestId);
    res.status(201).json({
      ...tool,
      inputSchema: tool.inputSchema ? JSON.parse(tool.inputSchema) : null,
      outputSchema: tool.outputSchema ? JSON.parse(tool.outputSchema) : null,
    });
  } catch (err) { next(err); }
});

/** PATCH /tools/:name — update a tool */
router.patch('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    const tool = await toolService.update(req.params.name, req.body, requestId);
    res.json({
      ...tool,
      inputSchema: tool.inputSchema ? JSON.parse(tool.inputSchema) : null,
      outputSchema: tool.outputSchema ? JSON.parse(tool.outputSchema) : null,
    });
  } catch (err) { next(err); }
});

/** DELETE /tools/:name — remove a tool */
router.delete('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestId = (req as Record<string, unknown>).requestId as string;
    await toolService.remove(req.params.name, requestId);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
