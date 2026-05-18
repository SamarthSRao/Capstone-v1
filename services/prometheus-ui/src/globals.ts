import jquery from 'jquery';
import moment from 'moment';

window.jQuery = jquery;
window.moment = moment;

// HybridTimeNet Mock Data Engine for Prometheus UI
// Aligned with document_pdf.pdf (Bayesian Ensemble + M/M/c scaling)
const originalFetch = window.fetch;
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlString = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // Intercept Prometheus API calls to return HybridTimeNet metrics
  if (urlString.includes('/api/v1/query_range')) {
    const urlParams = new URLSearchParams(urlString.split('?')[1]);
    const query = urlParams.get('query') || '';
    const start = parseInt(urlParams.get('start') || '0');
    const end = parseInt(urlParams.get('end') || '0');
    const step = parseInt(urlParams.get('step') || '15');

    console.log('Generating Research-Aligned Mock Data for Query:', query);

    const results = [];

    // Helper to generate metrics based on the PDF methodology
    const generateHtnMetrics = (timestamp: number) => {
      const base = 400 + Math.sin(timestamp / 600) * 120; // Periodic workload
      const seasonality = Math.sin(timestamp / 3600) * 50; // Daily/Hourly trend

      const lstm = base + seasonality + (Math.random() - 0.5) * 20;
      const prophet = base + seasonality;
      const xgboost = (Math.random() - 0.5) * 15;

      const ensemble_mean = (lstm + prophet) / 2 + xgboost;
      const uncertainty = 25 + Math.abs(Math.sin(timestamp / 300)) * 40; // Epistemic + Aleatoric
      const upper_bound = ensemble_mean + uncertainty;

      // M/M/c Scaling logic: c = ceil(upper_bound / capacity_per_node)
      const servers = Math.ceil(upper_bound / 45);

      return {
        lstm,
        prophet,
        xgboost,
        ensemble_mean,
        uncertainty,
        upper_bound,
        servers,
      };
    };

    const values: Record<string, any[][]> = {
      lstm: [],
      prophet: [],
      xgboost: [],
      mean: [],
      upper: [],
      servers: [],
      actual: [],
    };

    for (let t = start; t <= end; t += step) {
      const m = generateHtnMetrics(t);
      values.lstm.push([t, m.lstm.toFixed(2)]);
      values.prophet.push([t, m.prophet.toFixed(2)]);
      values.xgboost.push([t, m.xgboost.toFixed(2)]);
      values.mean.push([t, m.ensemble_mean.toFixed(2)]);
      values.upper.push([t, m.upper_bound.toFixed(2)]);
      values.servers.push([t, m.servers.toString()]);
      values.actual.push([t, (m.ensemble_mean + (Math.random() - 0.5) * 30).toFixed(2)]);
    }

    // Map query to results (Showing everything by default for demo)
    if (query.includes('hybridtimenet') || query === '') {
      results.push({
        metric: { __name__: 'hybridtimenet_ensemble_prediction', component: 'mean', instance: 'htn-cluster-01' },
        values: values.mean,
      });
      results.push({
        metric: { __name__: 'hybridtimenet_uncertainty_upper_bound', instance: 'htn-cluster-01' },
        values: values.upper,
      });
      results.push({
        metric: { __name__: 'hybridtimenet_workload_actual', instance: 'htn-cluster-01' },
        values: values.actual,
      });
      results.push({
        metric: { __name__: 'hybridtimenet_mmc_target_servers', instance: 'htn-cluster-01' },
        values: values.servers,
      });
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        data: {
          resultType: 'matrix',
          result: results,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Handle Metadata / Autocomplete calls
  if (urlString.includes('/api/v1/label/__name__/values')) {
    return new Response(
      JSON.stringify({
        status: 'success',
        data: [
          'hybridtimenet_ensemble_prediction',
          'hybridtimenet_uncertainty_upper_bound',
          'hybridtimenet_workload_actual',
          'hybridtimenet_mmc_target_servers',
          'hybridtimenet_lstm_probabilistic',
          'hybridtimenet_neural_prophet',
          'hybridtimenet_xgboost_residual',
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Fallback for build info
  if (urlString.includes('/api/v1/status/buildinfo')) {
    return new Response(
      JSON.stringify({
        status: 'success',
        data: { version: '2.51.0-HTN', revision: 'hybridtimenet', branch: 'main' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return originalFetch(input, init);
}) as any;
