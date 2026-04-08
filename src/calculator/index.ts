import { Router, type Express } from 'express';
import { CalculatorService } from './calculator.service.js';

const calculatorService = new CalculatorService();

export const registerCalculatorModule = (app: Express) => {
  const router = Router();

  router.get('/eval', (req, res) => {
    const expression = String(req.query.q ?? '').trim();

    if (!expression) {
      res.status(400).json({
        error: {
          code: 'CALCULATION_QUERY_REQUIRED',
          message: 'Anna q parameetris avaldis.',
          details: null,
        },
      });
      return;
    }

    try {
      const result = calculatorService.evaluate(expression);
      res.json({
        status: 'ready',
        ...result,
      });
    } catch {
      res.status(400).json({
        error: {
          code: 'INVALID_EXPRESSION',
          message: 'Avaldis ei ole lubatud või on vigane.',
          details: null,
        },
      });
    }
  });

  app.use('/api/calculator', router);
};
