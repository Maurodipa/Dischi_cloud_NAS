const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const scripts = html.match(/<script>([\s\S]*?)<\/script>/g);
if (scripts) {
  fs.writeFileSync('temp.js', scripts.map(s => s.replace(/<\/?script>/g, '')).join('\n'));
} else {
  console.log("no scripts found");
}
