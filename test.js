fetch('http://localhost:4000/api/segments/preview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer local-dev-token' },
  body: JSON.stringify({ status: ['INACTIVE'], minDaysInactive: 90, minTotalSpent: 0 })
}).then(res => res.text()).then(t => { console.log('RES:', t); process.exit(0); });
