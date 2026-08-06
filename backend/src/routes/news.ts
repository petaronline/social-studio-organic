/**
 * Social-media news — GET /organic/news → { items }.
 * A cached, best-effort merge of a few industry RSS feeds.
 */
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getNews } from '../services/news';

export const newsRouter = Router();

newsRouter.get('/', requireAuth, async (_req: Request, res: Response) => {
  const items = await getNews();
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.json({ items });
});
