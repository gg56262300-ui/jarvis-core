import { Router, type Express } from 'express';
import { WeatherService } from './weather.service.js';

const weatherService = new WeatherService();

export const registerWeatherModule = (app: Express) => {
  const router = Router();

  router.get('/debug-geocoding', async (req, res) => {
    const place = String(req.query.place ?? '').trim();

    if (!place) {
      res.status(400).json({
        error: {
          code: 'PLACE_REQUIRED',
          message: 'Anna place parameeter.',
          details: null,
        },
      });
      return;
    }

    const result = await weatherService.debugGeocoding(place);
    res.json({
      status: 'ready',
      ...result,
    });
  });

  router.get('/current', async (req, res) => {
    const place = String(req.query.place ?? '').trim();

    if (!place) {
      res.status(400).json({
        error: {
          code: 'PLACE_REQUIRED',
          message: 'Anna place parameeter.',
          details: null,
        },
      });
      return;
    }

    try {
      const result = await weatherService.getWeather(place);
      res.json({
        status: 'ready',
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WEATHER_FAILED';

      res.status(message === 'PLACE_NOT_FOUND' ? 404 : 400).json({
        error: {
          code: message,
          message: 'Ilmapäring ebaõnnestus.',
          details: null,
        },
      });
    }
  });

  app.use('/api/weather', router);
};
