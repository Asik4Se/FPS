// node build.js  ->  public/index.html (single file game)
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'src');
const head = fs.readFileSync(path.join(src, '00_head.html'), 'utf8');
const js = fs.readdirSync(src).filter(f => f.endsWith('.js')).sort().map(f => fs.readFileSync(path.join(src, f), 'utf8') + '\n').join('');
fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'public', 'index.html'), head + '<script>\n' + js + '</script>\n</body>\n</html>\n');
console.log('built public/index.html', (head.length + js.length) + ' bytes');
