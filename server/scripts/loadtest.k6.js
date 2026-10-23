// k6 load profile for the public marketplace. NOT executed in the build environment.
// Run:  k6 run -e BASE=http://localhost:4000 server/scripts/loadtest.k6.js   (seed ~10k listings first)
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  scenarios: { browse: { executor: 'ramping-vus', stages: [{ duration: '1m', target: 50 }, { duration: '3m', target: 50 }, { duration: '30s', target: 0 }] } },
  thresholds: { http_req_failed: ['rate<0.01'], 'http_req_duration{name:search}': ['p(95)<300'], 'http_req_duration{name:detail}': ['p(95)<250'] },
};
const BASE = __ENV.BASE || 'http://localhost:4000';
export default function () {
  const q = ['', 'transaction=rent', 'type=apartment&bedrooms=2', 'city=Mogadishu&sort=price_asc', 'q=garden'][Math.floor(Math.random() * 5)];
  const s = http.get(`${BASE}/api/v1/public/properties?limit=12&${q}`, { tags: { name: 'search' } });
  check(s, { 'search 200': (r) => r.status === 200 });
  const first = s.json('data.0.reference');
  if (first) check(http.get(`${BASE}/api/v1/public/properties/${first}`, { tags: { name: 'detail' } }), { 'detail 200': (r) => r.status === 200 });
  sleep(1);
}
