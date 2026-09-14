process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
fetch('https://127.0.0.1:1900/', { 
  method: 'PROPFIND', 
  headers: { 
    'Authorization': 'Basic ' + Buffer.from('maurodipa:password123').toString('base64') 
  } 
})
.then(res => console.log('STATUS:', res.status))
.catch(err => console.log('ERROR:', err.message));
