const https = require('https');
https.get('https://api.daihoidangtoanquoc.vn/api/profiles/get/items?offset=0&limit=1', (res) => {
  console.log('Access-Control-Allow-Origin:', res.headers['access-control-allow-origin']);
});
