const https = require('https');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const IMG = {
  'cat-mandhi':       { id: '1565299624946-b28f40a0ae38', crop: 'center' },
  'cat-biriyani':     { id: '1551024601-bec78aea704b', crop: 'center' },
  'cat-meals':        { id: '1540189549336-e6e99c3679fe', crop: 'center' },
  'cat-rice':         { id: '1516684732162-798a0062be99', crop: 'center' },
  'cat-porotta':      { id: '1509440159596-0249088772ff', crop: 'center' },
  'cat-appam':        { id: '1476124369491-e7addf5db371', crop: 'center' },
  'cat-dosa':         { id: '1565958011703-44f9829ba187', crop: 'center' },
  'cat-idli':         { id: '1558961363-fa8fdf82db35', crop: 'center' },
  'cat-idiyappam':    { id: '1504674900247-0877df9cc836', crop: 'center' },
  'cat-chapathi':     { id: '1569718212165-3a8278d5f624', crop: 'center' },
  'cat-curries':      { id: '1555126634-323283e090fa', crop: 'center' },
  'cat-chinese':      { id: '1414235077428-338989a2e8c0', crop: 'center' },
  'cat-fried-rice':   { id: '1498837167922-ddd27525d352', crop: 'center' },
  'cat-noodles':      { id: '1476224203421-9ac39bcb3327', crop: 'center' },
  'cat-shawarma':     { id: '1509440159596-0249088772ff', crop: 'entropy' },
  'cat-burgers':      { id: '1565958011703-44f9829ba187', crop: 'entropy' },
  'cat-pizza':        { id: '1565299624946-b28f40a0ae38', crop: 'entropy' },
  'cat-sandwiches':   { id: '1550507992-eb63ffee0847', crop: 'center' },
  'cat-snacks':       { id: '1601050690597-df0568f70950', crop: 'center' },
  'cat-cakes':        { id: '1578985545062-69928b1d9587', crop: 'center' },
  'cat-ice-cream':    { id: '1498837167922-ddd27525d352', crop: 'entropy' },
  'cat-juice':        { id: '1495474472287-4d71bcdd2085', crop: 'center' },
  'cat-mojitos':      { id: '1476124369491-e7addf5db371', crop: 'entropy' },
  'cat-milkshakes':   { id: '1551024601-bec78aea704b', crop: 'entropy' },
  'cat-cool-drinks':  { id: '1495474472287-4d71bcdd2085', crop: 'entropy' },
  'cat-tea-coffee':   { id: '1455619452474-d2be8b1e70cd', crop: 'center' },
  'cat-desserts':     { id: '1488477181946-6428a0291777', crop: 'center' },
};

const CROPS = ['center', 'entropy', 'top', 'bottom', 'left', 'right', 'faces'];

function pickImage(keyPrefix, seed) {
  const ids = [
    '1565299624946-b28f40a0ae38','1578985545062-69928b1d9587','1495474472287-4d71bcdd2085',
    '1558961363-fa8fdf82db35','1509440159596-0249088772ff','1601050690597-df0568f70950',
    '1540189549336-e6e99c3679fe','1455619452474-d2be8b1e70cd','1516684732162-798a0062be99',
    '1555126634-323283e090fa','1569718212165-3a8278d5f624','1550507992-eb63ffee0847',
    '1519708227418-c8fd9a32b7a2','1504674900247-0877df9cc836','1484723091739-30a097e8f929',
    '1476124369491-e7addf5db371','1488477181946-6428a0291777','1498837167922-ddd27525d352',
    '1414235077428-338989a2e8c0','1565958011703-44f9829ba187','1476224203421-9ac39bcb3327',
    '1551024601-bec78aea704b','1490645935967-10de6ba17061','1546069901-ba9599a7e63c',
    '1484723091739-30a097e8f929','1519708227418-c8fd9a32b7a2','1504674900247-0877df9cc836',
    '1550507992-eb63ffee0847','1569718212165-3a8278d5f624','1555126634-323283e090fa',
  ];
  const idx = seed % ids.length;
  const crop = CROPS[Math.floor(seed / ids.length) % CROPS.length];
  return { id: ids[idx], crop, url: `https://images.unsplash.com/photo-${ids[idx]}?w=600&h=600&fit=crop&crop=${crop}` };
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { timeout: 15000 }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return downloadImage(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(dest);
        if (stats.size < 500) {
          fs.unlinkSync(dest);
          reject(new Error(`File too small (${stats.size}B)`));
        } else {
          resolve();
        }
      });
    });
    req.on('error', (err) => { file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(err); });
    req.setTimeout(15000, () => { req.destroy(); file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(new Error('Timeout')); });
  });
}

function svgImage(name, text, bgColor, size = 200) {
  const colors = {
    red: '#ef4444', blue: '#3b82f6', green: '#10b981', amber: '#f59e0b',
    purple: '#8b5cf6', pink: '#ec4899', orange: '#f97316', teal: '#14b8a6',
    brown: '#8B4513', gold: '#FFD700', coral: '#FF7F50', tomato: '#FF6347',
    lime: '#84cc16', fuchsia: '#d946ef', cyan: '#06b6d4'
  };
  const bg = colors[bgColor] || bgColor || '#8b5cf6';
  const lines = text.split('\n');
  const ft = size > 150 ? 20 : 14;
  const yStart = size / 2 - (lines.length * 18) / 2;
  const textElements = lines.map((line, i) =>
    `<text x="${size/2}" y="${yStart + i * 24}" font-family="Arial,sans-serif" font-size="${ft}" font-weight="bold" fill="white" text-anchor="middle">${line}</text>`
  ).join('\n    ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="white" stop-opacity="0.25"/><stop offset="100%" stop-color="white" stop-opacity="0.05"/></linearGradient></defs><rect width="${size}" height="${size}" fill="${bg}" rx="16"/><circle cx="${size/2}" cy="${size/3}" r="${size/3}" fill="url(#g)"/><rect x="${size*0.15}" y="${size*0.65}" width="${size*0.7}" height="${size*0.25}" rx="${size*0.04}" fill="white" opacity="0.1"/>${textElements}</svg>`;
  fs.writeFileSync(path.join(uploadsDir, name + '.svg'), svg);
  return '/uploads/' + name + '.svg';
}

async function ensureImage(imageKey, seed, displayText, bgColor) {
  const localPath = path.join(uploadsDir, imageKey + '.jpg');
  if (fs.existsSync(localPath)) {
    return '/uploads/' + imageKey + '.jpg';
  }

  const catImg = IMG[imageKey];
  if (catImg) {
    const url = `https://images.unsplash.com/photo-${catImg.id}?w=600&h=600&fit=crop&crop=${catImg.crop}`;
    try {
      console.log(`  Downloading ${imageKey}.jpg...`);
      await downloadImage(url, localPath);
      return '/uploads/' + imageKey + '.jpg';
    } catch (e) {
      console.log(`  Retry ${imageKey} with different crop...`);
    }
  }

  const img = pickImage(imageKey, seed);
  try {
    console.log(`  Downloading ${imageKey}.jpg...`);
    await downloadImage(img.url, localPath);
    return '/uploads/' + imageKey + '.jpg';
  } catch (e) {
    console.log(`  Image failed for ${imageKey}, using fallback`);
  }

  const svgPath = path.join(uploadsDir, imageKey + '.svg');
  if (!fs.existsSync(svgPath)) {
    svgImage(imageKey, displayText, bgColor);
  }
  return '/uploads/' + imageKey + '.svg';
}

const categories = [
  { name: 'Mandhi',     key: 'cat-mandhi',     text: 'Mandhi',     color: 'amber' },
  { name: 'Biriyani',   key: 'cat-biriyani',   text: 'Biriyani',   color: 'orange' },
  { name: 'Meals',      key: 'cat-meals',      text: 'Meals',      color: 'green' },
  { name: 'Rice',       key: 'cat-rice',       text: 'Rice',       color: 'teal' },
  { name: 'Porotta',    key: 'cat-porotta',    text: 'Porotta',    color: 'brown' },
  { name: 'Appam',      key: 'cat-appam',      text: 'Appam',      color: 'cyan' },
  { name: 'Dosa',       key: 'cat-dosa',       text: 'Dosa',       color: 'gold' },
  { name: 'Idli',       key: 'cat-idli',       text: 'Idli',       color: 'lime' },
  { name: 'Idiyappam',  key: 'cat-idiyappam',  text: 'Idiyappam',  color: 'purple' },
  { name: 'Chapathi',   key: 'cat-chapathi',   text: 'Chapathi',   color: 'brown' },
  { name: 'Curries',    key: 'cat-curries',    text: 'Curries',    color: 'red' },
  { name: 'Chinese',    key: 'cat-chinese',    text: 'Chinese',    color: 'tomato' },
  { name: 'Fried Rice', key: 'cat-fried-rice', text: 'Fried\nRice', color: 'orange' },
  { name: 'Noodles',    key: 'cat-noodles',    text: 'Noodles',    color: 'coral' },
  { name: 'Shawarma',   key: 'cat-shawarma',   text: 'Shawarma',   color: 'amber' },
  { name: 'Burgers',    key: 'cat-burgers',    text: 'Burgers',    color: 'brown' },
  { name: 'Pizza',      key: 'cat-pizza',      text: 'Pizza',      color: 'tomato' },
  { name: 'Sandwiches', key: 'cat-sandwiches', text: 'Sandwiches', color: 'gold' },
  { name: 'Snacks',     key: 'cat-snacks',     text: 'Snacks',     color: 'coral' },
  { name: 'Cakes & Pastries', key: 'cat-cakes', text: 'Cakes &\nPastries', color: 'pink' },
  { name: 'Ice Cream',  key: 'cat-ice-cream',  text: 'Ice\nCream',  color: 'fuchsia' },
  { name: 'Fresh Juice', key: 'cat-juice',     text: 'Fresh\nJuice', color: 'lime' },
  { name: 'Mojitos',    key: 'cat-mojitos',    text: 'Mojitos',    color: 'cyan' },
  { name: 'Milk Shakes', key: 'cat-milkshakes', text: 'Milk\nShakes', color: 'purple' },
  { name: 'Cool Drinks', key: 'cat-cool-drinks', text: 'Cool\nDrinks', color: 'red' },
  { name: 'Tea & Coffee', key: 'cat-tea-coffee', text: 'Tea &\nCoffee', color: 'brown' },
  { name: 'Desserts',   key: 'cat-desserts',   text: 'Desserts',   color: 'pink' },
];

const items = [
  { n: 'Chicken Mandhi',     p: 350, c: 'Mandhi',     f: 'non_veg', v: 0 },
  { n: 'Beef Mandhi',        p: 380, c: 'Mandhi',     f: 'non_veg', v: 0 },
  { n: 'Mutton Mandhi',      p: 550, c: 'Mandhi',     f: 'non_veg', v: 0 },
  { n: 'Fish Mandhi',        p: 400, c: 'Mandhi',     f: 'non_veg', v: 0 },
  { n: 'Prawns Mandhi',      p: 450, c: 'Mandhi',     f: 'non_veg', v: 0 },
  { n: 'Alfaham Mandhi',     p: 380, c: 'Mandhi',     f: 'non_veg', v: 0 },
  { n: 'Peri Peri Mandhi',   p: 360, c: 'Mandhi',     f: 'non_veg', v: 0 },
  { n: 'Kuzhi Mandhi',       p: 650, c: 'Mandhi',     f: 'non_veg', v: 0 },
  { n: 'Chicken Biriyani',   p: 220, c: 'Biriyani',   f: 'non_veg', v: 0 },
  { n: 'Beef Biriyani',      p: 240, c: 'Biriyani',   f: 'non_veg', v: 0 },
  { n: 'Mutton Biriyani',    p: 350, c: 'Biriyani',   f: 'non_veg', v: 0 },
  { n: 'Fish Biriyani',      p: 280, c: 'Biriyani',   f: 'non_veg', v: 0 },
  { n: 'Prawns Biriyani',    p: 320, c: 'Biriyani',   f: 'non_veg', v: 0 },
  { n: 'Egg Biriyani',       p: 160, c: 'Biriyani',   f: 'egg',     v: 0 },
  { n: 'Veg Biriyani',       p: 180, c: 'Biriyani',   f: 'veg',     v: 1 },
  { n: 'Kuzhi Biriyani',     p: 450, c: 'Biriyani',   f: 'non_veg', v: 0 },
  { n: 'Hyderabadi Chicken Biriyani', p: 280, c: 'Biriyani', f: 'non_veg', v: 0 },
  { n: 'Malabar Chicken Biriyani',    p: 250, c: 'Biriyani', f: 'non_veg', v: 0 },
  { n: 'Kerala Meals',       p: 180, c: 'Meals',      f: 'veg',     v: 1 },
  { n: 'Veg Meals',          p: 140, c: 'Meals',      f: 'veg',     v: 1 },
  { n: 'Fish Meals',         p: 220, c: 'Meals',      f: 'non_veg', v: 0 },
  { n: 'Chicken Meals',      p: 240, c: 'Meals',      f: 'non_veg', v: 0 },
  { n: 'Beef Meals',         p: 250, c: 'Meals',      f: 'non_veg', v: 0 },
  { n: 'Special Meals',      p: 280, c: 'Meals',      f: 'non_veg', v: 0 },
  { n: 'Plain Rice',         p: 45,  c: 'Rice',       f: 'veg',     v: 1 },
  { n: 'Ghee Rice',          p: 120, c: 'Rice',       f: 'veg',     v: 1 },
  { n: 'Jeera Rice',         p: 130, c: 'Rice',       f: 'veg',     v: 1 },
  { n: 'Fried Rice',         p: 150, c: 'Rice',       f: 'veg',     v: 1 },
  { n: 'Lemon Rice',         p: 100, c: 'Rice',       f: 'veg',     v: 1 },
  { n: 'Curd Rice',          p: 90,  c: 'Rice',       f: 'veg',     v: 1 },
  { n: 'Kerala Porotta',     p: 18,  c: 'Porotta',    f: 'veg',     v: 1 },
  { n: 'Coin Porotta',       p: 25,  c: 'Porotta',    f: 'veg',     v: 1 },
  { n: 'Wheat Porotta',      p: 22,  c: 'Porotta',    f: 'veg',     v: 1 },
  { n: 'Appam',              p: 22,  c: 'Appam',      f: 'veg',     v: 1 },
  { n: 'Palappam',           p: 25,  c: 'Appam',      f: 'veg',     v: 1 },
  { n: 'Vellayappam',        p: 30,  c: 'Appam',      f: 'veg',     v: 1 },
  { n: 'Plain Dosa',         p: 50,  c: 'Dosa',       f: 'veg',     v: 1 },
  { n: 'Masala Dosa',        p: 80,  c: 'Dosa',       f: 'veg',     v: 1 },
  { n: 'Ghee Roast',         p: 120, c: 'Dosa',       f: 'veg',     v: 1 },
  { n: 'Paper Roast',        p: 140, c: 'Dosa',       f: 'veg',     v: 1 },
  { n: 'Onion Dosa',         p: 90,  c: 'Dosa',       f: 'veg',     v: 1 },
  { n: 'Cheese Dosa',        p: 160, c: 'Dosa',       f: 'veg',     v: 1 },
  { n: 'Egg Dosa',           p: 100, c: 'Dosa',       f: 'egg',     v: 0 },
  { n: 'Idli',               p: 40,  c: 'Idli',       f: 'veg',     v: 1 },
  { n: 'Mini Idli',          p: 50,  c: 'Idli',       f: 'veg',     v: 1 },
  { n: 'Ghee Idli',          p: 70,  c: 'Idli',       f: 'veg',     v: 1 },
  { n: 'Sambar Idli',        p: 60,  c: 'Idli',       f: 'veg',     v: 1 },
  { n: 'Idiyappam',          p: 30,  c: 'Idiyappam',  f: 'veg',     v: 1 },
  { n: 'String Hoppers',     p: 35,  c: 'Idiyappam',  f: 'veg',     v: 1 },
  { n: 'Chapathi',           p: 22,  c: 'Chapathi',   f: 'veg',     v: 1 },
  { n: 'Butter Chapathi',    p: 30,  c: 'Chapathi',   f: 'veg',     v: 1 },
  { n: 'Wheat Chapathi',     p: 25,  c: 'Chapathi',   f: 'veg',     v: 1 },
  { n: 'Chicken Curry',      p: 220, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Chicken Roast',      p: 260, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Chicken Fry',        p: 240, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Chicken Pepper Fry', p: 280, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Butter Chicken',     p: 320, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Chilli Chicken',     p: 260, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Dragon Chicken',     p: 280, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Chicken 65',         p: 250, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Beef Curry',         p: 240, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Beef Roast',         p: 280, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Beef Fry',           p: 260, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Beef Pepper Fry',    p: 300, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Beef Ularthiyathu',  p: 320, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Mutton Curry',       p: 320, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Mutton Roast',       p: 360, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Mutton Fry',         p: 340, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Mutton Pepper Fry',  p: 380, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Fish Curry',         p: 220, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Fish Fry',           p: 200, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Fish Roast',         p: 250, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Fish Molee',         p: 280, c: 'Curries',    f: 'non_veg', v: 0 },
  { n: 'Egg Curry',          p: 120, c: 'Curries',    f: 'egg',     v: 0 },
  { n: 'Egg Roast',          p: 140, c: 'Curries',    f: 'egg',     v: 0 },
  { n: 'Omelette',           p: 60,  c: 'Curries',    f: 'egg',     v: 0 },
  { n: 'Vegetable Stew',     p: 180, c: 'Curries',    f: 'veg',     v: 1 },
  { n: 'Mixed Vegetable Curry', p: 160, c: 'Curries', f: 'veg',     v: 1 },
  { n: 'Paneer Butter Masala',  p: 250, c: 'Curries', f: 'veg',     v: 1 },
  { n: 'Dal Fry',            p: 140, c: 'Curries',    f: 'veg',     v: 1 },
  { n: 'Chicken Manchurian',  p: 250, c: 'Chinese',    f: 'non_veg', v: 0 },
  { n: 'Gobi Manchurian',    p: 180, c: 'Chinese',    f: 'veg',     v: 1 },
  { n: 'Chicken Lollipop',   p: 300, c: 'Chinese',    f: 'non_veg', v: 0 },
  { n: 'Chicken Fried Rice', p: 220, c: 'Fried Rice', f: 'non_veg', v: 0 },
  { n: 'Beef Fried Rice',    p: 240, c: 'Fried Rice', f: 'non_veg', v: 0 },
  { n: 'Egg Fried Rice',     p: 180, c: 'Fried Rice', f: 'egg',     v: 0 },
  { n: 'Veg Fried Rice',     p: 160, c: 'Fried Rice', f: 'veg',     v: 1 },
  { n: 'Mixed Fried Rice',   p: 280, c: 'Fried Rice', f: 'non_veg', v: 0 },
  { n: 'Schezwan Fried Rice', p: 250, c: 'Fried Rice', f: 'non_veg', v: 0 },
  { n: 'Chicken Noodles',    p: 200, c: 'Noodles',    f: 'non_veg', v: 0 },
  { n: 'Egg Noodles',        p: 170, c: 'Noodles',    f: 'egg',     v: 0 },
  { n: 'Mixed Noodles',      p: 260, c: 'Noodles',    f: 'non_veg', v: 0 },
  { n: 'Veg Noodles',        p: 150, c: 'Noodles',    f: 'veg',     v: 1 },
  { n: 'Schezwan Noodles',   p: 220, c: 'Noodles',    f: 'non_veg', v: 0 },
  { n: 'Chicken Shawarma',   p: 120, c: 'Shawarma',   f: 'non_veg', v: 0 },
  { n: 'Beef Shawarma',      p: 140, c: 'Shawarma',   f: 'non_veg', v: 0 },
  { n: 'Mexican Shawarma',   p: 160, c: 'Shawarma',   f: 'non_veg', v: 0 },
  { n: 'Plate Shawarma',     p: 220, c: 'Shawarma',   f: 'non_veg', v: 0 },
  { n: 'Jumbo Shawarma',     p: 250, c: 'Shawarma',   f: 'non_veg', v: 0 },
  { n: 'Arabic Shawarma',    p: 130, c: 'Shawarma',   f: 'non_veg', v: 0 },
  { n: 'Chicken Burger',     p: 120, c: 'Burgers',    f: 'non_veg', v: 0 },
  { n: 'Beef Burger',        p: 140, c: 'Burgers',    f: 'non_veg', v: 0 },
  { n: 'Cheese Burger',      p: 150, c: 'Burgers',    f: 'non_veg', v: 0 },
  { n: 'Zinger Burger',      p: 180, c: 'Burgers',    f: 'non_veg', v: 0 },
  { n: 'Double Patty Burger', p: 250, c: 'Burgers',   f: 'non_veg', v: 0 },
  { n: 'Veg Burger',         p: 100, c: 'Burgers',    f: 'veg',     v: 1 },
  { n: 'Margherita Pizza',   p: 280, c: 'Pizza',      f: 'veg',     v: 1 },
  { n: 'Chicken Pizza',      p: 350, c: 'Pizza',      f: 'non_veg', v: 0 },
  { n: 'Pepperoni Pizza',    p: 380, c: 'Pizza',      f: 'non_veg', v: 0 },
  { n: 'BBQ Chicken Pizza',  p: 420, c: 'Pizza',      f: 'non_veg', v: 0 },
  { n: 'Cheese Burst Pizza', p: 450, c: 'Pizza',      f: 'veg',     v: 1 },
  { n: 'Veg Supreme Pizza',  p: 320, c: 'Pizza',      f: 'veg',     v: 1 },
  { n: 'Chicken Sandwich',   p: 150, c: 'Sandwiches', f: 'non_veg', v: 0 },
  { n: 'Club Sandwich',      p: 180, c: 'Sandwiches', f: 'non_veg', v: 0 },
  { n: 'Veg Sandwich',       p: 100, c: 'Sandwiches', f: 'veg',     v: 1 },
  { n: 'Cheese Sandwich',    p: 120, c: 'Sandwiches', f: 'veg',     v: 1 },
  { n: 'Egg Sandwich',       p: 110, c: 'Sandwiches', f: 'egg',     v: 0 },
  { n: 'Samosa',             p: 15,  c: 'Snacks',     f: 'veg',     v: 1 },
  { n: 'Uzhunnu Vada',       p: 12,  c: 'Snacks',     f: 'veg',     v: 1 },
  { n: 'Parippu Vada',       p: 12,  c: 'Snacks',     f: 'veg',     v: 1 },
  { n: 'Pazham Pori',        p: 20,  c: 'Snacks',     f: 'veg',     v: 1 },
  { n: 'Unnakkaya',          p: 25,  c: 'Snacks',     f: 'veg',     v: 1 },
  { n: 'Chicken Cutlet',     p: 60,  c: 'Snacks',     f: 'non_veg', v: 0 },
  { n: 'Veg Cutlet',         p: 40,  c: 'Snacks',     f: 'veg',     v: 1 },
  { n: 'Egg Puff',           p: 30,  c: 'Snacks',     f: 'egg',     v: 0 },
  { n: 'Chicken Puff',       p: 40,  c: 'Snacks',     f: 'non_veg', v: 0 },
  { n: 'Banana Chips',       p: 30,  c: 'Snacks',     f: 'veg',     v: 1 },
  { n: 'Black Forest Cake',  p: 400, c: 'Cakes & Pastries',  f: 'veg', v: 1 },
  { n: 'White Forest Cake',  p: 420, c: 'Cakes & Pastries',  f: 'veg', v: 1 },
  { n: 'Chocolate Cake',     p: 380, c: 'Cakes & Pastries',  f: 'veg', v: 1 },
  { n: 'Red Velvet Cake',    p: 450, c: 'Cakes & Pastries',  f: 'veg', v: 1 },
  { n: 'Vanilla Pastry',     p: 60,  c: 'Cakes & Pastries',  f: 'veg', v: 1 },
  { n: 'Fruit Pastry',       p: 70,  c: 'Cakes & Pastries',  f: 'veg', v: 1 },
  { n: 'Brownie',            p: 120, c: 'Cakes & Pastries',  f: 'veg', v: 1 },
  { n: 'Cup Cake',           p: 80,  c: 'Cakes & Pastries',  f: 'veg', v: 1 },
  { n: 'Vanilla',            p: 60,  c: 'Ice Cream',   f: 'veg',  v: 1 },
  { n: 'Chocolate',          p: 70,  c: 'Ice Cream',   f: 'veg',  v: 1 },
  { n: 'Strawberry',         p: 70,  c: 'Ice Cream',   f: 'veg',  v: 1 },
  { n: 'Mango',              p: 70,  c: 'Ice Cream',   f: 'veg',  v: 1 },
  { n: 'Butterscotch',       p: 80,  c: 'Ice Cream',   f: 'veg',  v: 1 },
  { n: 'Black Currant',      p: 80,  c: 'Ice Cream',   f: 'veg',  v: 1 },
  { n: 'Tender Coconut',     p: 90,  c: 'Ice Cream',   f: 'veg',  v: 1 },
  { n: 'Ice Cream Sundae',   p: 160, c: 'Ice Cream',   f: 'veg',  v: 1 },
  { n: 'Orange Juice',       p: 80,  c: 'Fresh Juice', f: 'veg',  v: 1 },
  { n: 'Watermelon Juice',   p: 60,  c: 'Fresh Juice', f: 'veg',  v: 1 },
  { n: 'Pineapple Juice',    p: 70,  c: 'Fresh Juice', f: 'veg',  v: 1 },
  { n: 'Mango Juice',        p: 90,  c: 'Fresh Juice', f: 'veg',  v: 1 },
  { n: 'Grape Juice',        p: 80,  c: 'Fresh Juice', f: 'veg',  v: 1 },
  { n: 'Lime Juice',         p: 50,  c: 'Fresh Juice', f: 'veg',  v: 1 },
  { n: 'Pomegranate Juice',  p: 120, c: 'Fresh Juice', f: 'veg',  v: 1 },
  { n: 'Mixed Fruit Juice',  p: 100, c: 'Fresh Juice', f: 'veg',  v: 1 },
  { n: 'Classic Mojito',     p: 120, c: 'Mojitos',     f: 'veg',  v: 1 },
  { n: 'Mint Mojito',        p: 130, c: 'Mojitos',     f: 'veg',  v: 1 },
  { n: 'Blue Mojito',        p: 140, c: 'Mojitos',     f: 'veg',  v: 1 },
  { n: 'Green Apple Mojito', p: 140, c: 'Mojitos',     f: 'veg',  v: 1 },
  { n: 'Watermelon Mojito',  p: 150, c: 'Mojitos',     f: 'veg',  v: 1 },
  { n: 'Kiwi Mojito',        p: 150, c: 'Mojitos',     f: 'veg',  v: 1 },
  { n: 'Passion Fruit Mojito', p: 160, c: 'Mojitos',   f: 'veg',  v: 1 },
  { n: 'Oreo Shake',         p: 180, c: 'Milk Shakes', f: 'veg',  v: 1 },
  { n: 'KitKat Shake',       p: 200, c: 'Milk Shakes', f: 'veg',  v: 1 },
  { n: 'Chocolate Shake',    p: 150, c: 'Milk Shakes', f: 'veg',  v: 1 },
  { n: 'Vanilla Shake',      p: 140, c: 'Milk Shakes', f: 'veg',  v: 1 },
  { n: 'Strawberry Shake',   p: 160, c: 'Milk Shakes', f: 'veg',  v: 1 },
  { n: 'Mango Shake',        p: 160, c: 'Milk Shakes', f: 'veg',  v: 1 },
  { n: 'Dry Fruit Shake',    p: 220, c: 'Milk Shakes', f: 'veg',  v: 1 },
  { n: 'Pista Shake',        p: 180, c: 'Milk Shakes', f: 'veg',  v: 1 },
  { n: 'Nutella Shake',      p: 220, c: 'Milk Shakes', f: 'veg',  v: 1 },
  { n: 'Ferrero Rocher Shake', p: 250, c: 'Milk Shakes', f: 'veg', v: 1 },
  { n: 'Coca-Cola',          p: 35,  c: 'Cool Drinks', f: 'veg',  v: 1 },
  { n: 'Pepsi',              p: 35,  c: 'Cool Drinks', f: 'veg',  v: 1 },
  { n: 'Sprite',             p: 35,  c: 'Cool Drinks', f: 'veg',  v: 1 },
  { n: 'Fanta',              p: 35,  c: 'Cool Drinks', f: 'veg',  v: 1 },
  { n: '7UP',                p: 35,  c: 'Cool Drinks', f: 'veg',  v: 1 },
  { n: 'Limca',              p: 30,  c: 'Cool Drinks', f: 'veg',  v: 1 },
  { n: 'Soda',               p: 20,  c: 'Cool Drinks', f: 'veg',  v: 1 },
  { n: 'Mineral Water',      p: 25,  c: 'Cool Drinks', f: 'veg',  v: 1 },
  { n: 'Tea',                p: 15,  c: 'Tea & Coffee', f: 'veg', v: 1 },
  { n: 'Black Tea',          p: 15,  c: 'Tea & Coffee', f: 'veg', v: 1 },
  { n: 'Lemon Tea',          p: 20,  c: 'Tea & Coffee', f: 'veg', v: 1 },
  { n: 'Green Tea',          p: 25,  c: 'Tea & Coffee', f: 'veg', v: 1 },
  { n: 'Coffee',             p: 25,  c: 'Tea & Coffee', f: 'veg', v: 1 },
  { n: 'Black Coffee',       p: 20,  c: 'Tea & Coffee', f: 'veg', v: 1 },
  { n: 'Cold Coffee',        p: 60,  c: 'Tea & Coffee', f: 'veg', v: 1 },
  { n: 'Boost',              p: 30,  c: 'Tea & Coffee', f: 'veg', v: 1 },
  { n: 'Horlicks',           p: 35,  c: 'Tea & Coffee', f: 'veg', v: 1 },
  { n: 'Gulab Jamun',        p: 60,  c: 'Desserts',    f: 'veg',  v: 1 },
  { n: 'Rasmalai',           p: 80,  c: 'Desserts',    f: 'veg',  v: 1 },
  { n: 'Caramel Pudding',    p: 100, c: 'Desserts',    f: 'veg',  v: 1 },
  { n: 'Elaneer Pudding',    p: 120, c: 'Desserts',    f: 'veg',  v: 1 },
  { n: 'Falooda',            p: 150, c: 'Desserts',    f: 'veg',  v: 1 },
  { n: 'Fruit Salad',        p: 100, c: 'Desserts',    f: 'veg',  v: 1 },
  { n: 'Payasam',            p: 80,  c: 'Desserts',    f: 'veg',  v: 1 },
];

async function seed() {
  const connection = await pool.getConnection();
  try {
    console.log('=== Kerala Restaurant POS - Full Database Seed ===\n');

    console.log('Clearing existing data...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('TRUNCATE TABLE kot_items');
    await connection.query('TRUNCATE TABLE kot');
    await connection.query('TRUNCATE TABLE order_items');
    await connection.query('TRUNCATE TABLE orders');
    await connection.query('TRUNCATE TABLE payments');
    await connection.query('TRUNCATE TABLE parcel_bills');
    await connection.query('TRUNCATE TABLE menu_item_addons');
    await connection.query('TRUNCATE TABLE menu_item_variants');
    await connection.query('TRUNCATE TABLE menu_items');
    await connection.query('TRUNCATE TABLE categories');
    await connection.query('TRUNCATE TABLE waiter_tables');
    await connection.query('TRUNCATE TABLE waiters');
    await connection.query('TRUNCATE TABLE tables_');
    await connection.query('TRUNCATE TABLE admins');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('Creating admin...');
    const adminHash = await bcrypt.hash('admin123', 10);
    await connection.query('INSERT INTO admins (id, username, password) VALUES (1, ?, ?)', ['admin', adminHash]);

    console.log('\nCreating tables...');
    for (let i = 1; i <= 10; i++) {
      const cap = [2, 4, 4, 6, 6, 2, 8, 4, 4, 6][i - 1];
      await connection.query('INSERT INTO tables_ (table_number, capacity, status) VALUES (?, ?, ?)', [i.toString(), cap, 'open']);
    }
    console.log('  10 tables created');

    console.log('\nCreating waiters...');
    const waiterPass = await bcrypt.hash('waiter123', 10);
    const waiterData = [
      ['Rahul Sharma', 'rahul', 'blue'], ['Priya Singh', 'priya', 'pink'],
      ['Amit Kumar', 'amit', 'green'], ['Sneha Patel', 'sneha', 'purple'],
      ['Vikram Raj', 'vikram', 'amber'], ['Ananya Nair', 'ananya', 'teal'],
    ];
    for (let i = 0; i < waiterData.length; i++) {
      const [name, uname, color] = waiterData[i];
      const imgKey = 'waiter-' + uname;
      svgImage(imgKey, name.replace(' ', '\n'), color);
      await connection.query('INSERT INTO waiters (id, name, username, password, image) VALUES (?, ?, ?, ?, ?)',
        [i + 1, name, uname, waiterPass, '/uploads/' + imgKey + '.svg']);
    }
    console.log('  6 waiters created');
    console.log('  Admin: admin / admin123');
    console.log('  Waiters: rahul / waiter123, etc.');

    console.log('\nAssigning tables to waiters...');
    const assigns = [[1,2],[3,4],[5,6],[7,8],[9],[10]];
    for (let i = 0; i < assigns.length; i++) {
      for (const t of assigns[i]) {
        await connection.query('INSERT INTO waiter_tables (waiter_id, table_id) VALUES (?, ?)', [i + 1, t]);
      }
    }

    console.log('\n=== Creating Categories (27) with Photos ===\n');
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      const imgPath = await ensureImage(cat.key, i, cat.text, cat.color);
      await connection.query('INSERT INTO categories (id, name, image) VALUES (?, ?, ?)', [i + 1, cat.name, imgPath]);
      console.log(`  [${i + 1}/27] ${cat.name}`);
    }

    console.log('\n=== Creating Menu Items (' + items.length + ') with Photos ===\n');
    const catMap = {};
    for (let i = 0; i < categories.length; i++) catMap[categories[i].name] = i + 1;

    let count = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const imageKey = 'm' + i;
      const imgPath = await ensureImage(imageKey, i + 100, item.n, 'gray');
      await connection.query(
        `INSERT INTO menu_items (name, price, image, category_id, is_vegetarian, is_available, food_type, stock_status)
         VALUES (?, ?, ?, ?, ?, 1, ?, 'in_stock')`,
        [item.n, item.p, imgPath, catMap[item.c], item.v, item.f]
      );
      count++;
      if (count % 30 === 0 || count === items.length) {
        console.log(`  [${count}/${items.length}] ${item.n}`);
      }
    }

    console.log('\n=== Seed Complete ===');
    console.log(`  Categories: ${categories.length}`);
    console.log(`  Menu Items: ${items.length}`);
    console.log(`  Tables: 10`);
    console.log(`  Waiters: ${waiterData.length}`);
    console.log('  Admin: admin / admin123');
    console.log('  Waiter: rahul / waiter123');

  } catch (error) {
    console.error('\nSeed error:', error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

seed();
