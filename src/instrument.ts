import * as Sentry from '@sentry/node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter, SimpleSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { diag, DiagConsoleLogger, DiagLogLevel, trace } from '@opentelemetry/api';
import {
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} from '@opentelemetry/sdk-metrics';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,
  skipOpenTelemetrySetup: true,
});

const otelEnabled = process.env.OTEL_ENABLED !== '0';
const otelConsole = process.env.OTEL_TO_CONSOLE !== '0';

if (otelEnabled && otelConsole) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

let otelShutdownStarted = false;

if (otelEnabled) {
  console.log('[OTEL] init start', {
    otelEnabled,
    otelConsole,
  });

  const spanExporter = otelConsole ? new ConsoleSpanExporter() : undefined;

  const sdk = new NodeSDK({
    sampler: new AlwaysOnSampler(),
    spanProcessors: spanExporter ? [new SimpleSpanProcessor(spanExporter)] : [],
    metricReaders: otelConsole
      ? [
          new PeriodicExportingMetricReader({
            exporter: new ConsoleMetricExporter(),
          }),
        ]
      : [],
    instrumentations: [getNodeAutoInstrumentations()],
  });

  console.log('[OTEL] sdk created');

  await sdk.start();

  console.log('[OTEL] sdk started');

  const startupTracer = trace.getTracer('jarvis-startup-check');
  const startupSpan = startupTracer.startSpan('jarvis.manual.startup.check');
  startupSpan.setAttribute('jarvis.check', 'startup');
  startupSpan.end();
  console.log('[OTEL] manual startup span ended');

  const shutdownOtel = async (signal: 'SIGTERM' | 'SIGINT') => {
    if (otelShutdownStarted) {
      console.log(`[OTEL] shutdown skipped ${signal} (already started)`);
      return;
    }
    otelShutdownStarted = true;
    try {
      await sdk.shutdown();
      console.log(`[OTEL] sdk shutdown ${signal}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('shutdown may only be called once per LoggerProvider') ||
        message.includes('shutdown may only be called once per MeterProvider')
      ) {
        console.log(`[OTEL] shutdown duplicate ignored ${signal}: ${message}`);
        return;
      }
      console.log(`[OTEL] sdk shutdown ${signal} failed`);
      void error;
    }
  };

  process.once('SIGTERM', () => {
    void shutdownOtel('SIGTERM');
  });

  process.once('SIGINT', () => {
    void shutdownOtel('SIGINT');
  });
} else {
  console.log('[OTEL] disabled by env');
}
