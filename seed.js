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
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Afsal@9082',
  database: process.env.DB_NAME || 'hotel_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const U = (id) => `https://images.unsplash.com/${id}?w=400&h=400&fit=crop`;

const REAL_IMAGES = {
  'cat-biscuits':    U('photo-1558961363-fa8fdf82db35'),
  'cat-sweets':      U('photo-1551024601-bec78aea704b'),
  'cat-cakes':       U('photo-1578985545062-69928b1d9587'),
  'cat-bread':       U('photo-1509440159596-0249088772ff'),
  'cat-namkeen':     U('photo-1601050690597-df0568f70950'),
  'cat-beverages':   U('photo-1495474472287-4d71bcdd2085'),
  'menu-butter-biscuit':  U('photo-1558961363-fa8fdf82db35'),
  'menu-choco-cookie':    U('photo-1558961363-fa8fdf82db35'),
  'menu-coconut-biscuit': U('photo-1558961363-fa8fdf82db35'),
  'menu-cream-cookie':    U('photo-1558961363-fa8fdf82db35'),
  'menu-gulab-jamun':  U('photo-1551024601-bec78aea704b'),
  'menu-rasgulla':     U('photo-1551024601-bec78aea704b'),
  'menu-jalebi':       U('photo-1551024601-bec78aea704b'),
  'menu-kaju-katli':   U('photo-1551024601-bec78aea704b'),
  'menu-black-forest':  U('photo-1578985545062-69928b1d9587'),
  'menu-vanilla-pastry':U('photo-1578985545062-69928b1d9587'),
  'menu-pineapple':     U('photo-1578985545062-69928b1d9587'),
  'menu-fruit-pastry':  U('photo-1578985545062-69928b1d9587'),
  'menu-wheat-bread':  U('photo-1509440159596-0249088772ff'),
  'menu-burger-bun':   U('photo-1509440159596-0249088772ff'),
  'menu-pav':          U('photo-1509440159596-0249088772ff'),
  'menu-garlic-bread': U('photo-1509440159596-0249088772ff'),
  'menu-mixture':      U('photo-1601050690597-df0568f70950'),
  'menu-bhujia':       U('photo-1601050690597-df0568f70950'),
  'menu-murukku':      U('photo-1601050690597-df0568f70950'),
  'menu-banana-chips': U('photo-1601050690597-df0568f70950'),
  'menu-tea':       U('photo-1495474472287-4d71bcdd2085'),
  'menu-coffee':    U('photo-1495474472287-4d71bcdd2085'),
  'menu-cold-drink':U('photo-1495474472287-4d71bcdd2085'),
  'menu-buttermilk':U('photo-1495474472287-4d71bcdd2085'),
  'menu-samosa':       U('photo-1601050690597-df0568f70950'),
  'menu-spring-roll':  U('photo-1601050690597-df0568f70950'),
  'menu-french-fries': U('photo-1601050690597-df0568f70950'),
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        return download(response.headers.location, dest).then(resolve).catch(reject);
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
    req.setTimeout(20000, () => { req.destroy(); file.close(); if (fs.existsSync(dest)) fs.unlinkSync(dest); reject(new Error('Timeout')); });
  });
}

function realImage(name) {
  const localPath = path.join(uploadsDir, name + '.jpg');
  if (REAL_IMAGES[name] && !fs.existsSync(localPath)) {
    try {
      console.log(`  Downloading ${name}.jpg...`);
      download(REAL_IMAGES[name], localPath);
    } catch (e) {
      console.log(`  Failed to download ${name}: ${e.message}`);
    }
  }
  if (fs.existsSync(localPath)) {
    return '/uploads/' + name + '.jpg';
  }
  return null;
}

function svgImage(name, text, bgColor, size = 200) {
  const colors = {
    red: '#ef4444', blue: '#3b82f6', green: '#10b981', amber: '#f59e0b',
    purple: '#8b5cf6', pink: '#ec4899', indigo: '#6366f1', teal: '#14b8a6',
    cyan: '#06b6d4', orange: '#f97316', rose: '#f43f5e', lime: '#84cc16',
    emerald: '#10b981', violet: '#8b5cf6', fuchsia: '#d946ef', sky: '#0ea5e9',
    brown: '#8B4513'
  };
  const bg = colors[bgColor] || bgColor || '#8b5cf6';
  const lines = text.split('\n');
  const fs = size > 150 ? 20 : 14;
  const yStart = size / 2 - (lines.length * 18) / 2;
  const textElements = lines.map((line, i) =>
    `<text x="${size/2}" y="${yStart + i * 24}" font-family="Arial,sans-serif" font-size="${fs}" font-weight="bold" fill="white" text-anchor="middle">${line}</text>`
  ).join('\n    ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="white" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="white" stop-opacity="0.05"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="${bg}" rx="16"/>
  <circle cx="${size/2}" cy="${size/3}" r="${size/3}" fill="url(#g)"/>
  <rect x="${size*0.15}" y="${size*0.65}" width="${size*0.7}" height="${size*0.25}" rx="${size*0.04}" fill="white" opacity="0.1"/>
  ${textElements}
</svg>`;
  fs.writeFileSync(path.join(uploadsDir, name + '.svg'), svg);
  return '/uploads/' + name + '.svg';
}

async function seed() {
  const connection = await pool.getConnection();
  try {
    console.log('Clearing existing data...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('TRUNCATE TABLE order_items');
    await connection.query('TRUNCATE TABLE orders');
    await connection.query('TRUNCATE TABLE payments');
    await connection.query('TRUNCATE TABLE parcel_bills');
    await connection.query('TRUNCATE TABLE waiter_tables');
    await connection.query('TRUNCATE TABLE menu_items');
    await connection.query('TRUNCATE TABLE categories');
    await connection.query('TRUNCATE TABLE waiters');
    await connection.query('TRUNCATE TABLE tables_');
    await connection.query('TRUNCATE TABLE admins');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('Creating default admin...');
    const adminHash = await bcrypt.hash('admin123', 10);
    await connection.query('INSERT INTO admins (id, username, password) VALUES (1, ?, ?)', ['admin', adminHash]);

    console.log('Creating tables...');
    const tables = [
      [1, 2], [2, 4], [3, 4], [4, 6], [5, 2], [6, 8]
    ];
    for (const [id, num, cap] of tables.map(([n, c], i) => [i + 1, n, c])) {
      await connection.query(
        'INSERT INTO tables_ (id, table_number, capacity, status) VALUES (?, ?, ?, ?)',
        [id, num.toString(), cap, 'open']
      );
    }

    console.log('Creating waiter images...');
    const waiterImages = [
      svgImage('waiter-rahul', 'Rahul\nSharma', 'blue'),
      svgImage('waiter-priya', 'Priya\nSingh', 'pink'),
      svgImage('waiter-amit', 'Amit\nKumar', 'green'),
      svgImage('waiter-sneha', 'Sneha\nPatel', 'purple'),
    ];

    console.log('Creating waiters...');
    const waiterPass = await bcrypt.hash('waiter123', 10);
    const waiterData = [
      [1, 'Rahul Sharma', 'rahul', waiterPass, waiterImages[0]],
      [2, 'Priya Singh', 'priya', waiterPass, waiterImages[1]],
      [3, 'Amit Kumar', 'amit', waiterPass, waiterImages[2]],
      [4, 'Sneha Patel', 'sneha', waiterPass, waiterImages[3]],
    ];
    for (const [id, name, username, password, image] of waiterData) {
      await connection.query(
        'INSERT INTO waiters (id, name, username, password, image) VALUES (?, ?, ?, ?, ?)',
        [id, name, username, password, image]
      );
    }

    console.log('Assigning tables to waiters...');
    const assignments = [[1], [2, 3], [4, 5], [6]];
    for (let i = 0; i < assignments.length; i++) {
      const waiterId = i + 1;
      for (const tableIdx of assignments[i]) {
        await connection.query(
          'INSERT INTO waiter_tables (waiter_id, table_id) VALUES (?, ?)',
          [waiterId, tableIdx]
        );
      }
    }

    console.log('Downloading category images...');
    const catNames = ['cat-biscuits','cat-sweets','cat-cakes','cat-bread','cat-namkeen','cat-beverages'];
    for (const n of catNames) realImage(n);
    const catImages = catNames.map(n => `/uploads/${n}.jpg`);

    console.log('Creating categories...');
    const catNamesDisplay = [
      'Biscuits & Cookies', 'Sweets & Desserts', 'Cakes & Pastries',
      'Bread & Buns', 'Namkeen & Snacks', 'Beverages'
    ];
    for (let i = 0; i < catNamesDisplay.length; i++) {
      await connection.query(
        'INSERT INTO categories (id, name, image) VALUES (?, ?, ?)',
        [i + 1, catNamesDisplay[i], catImages[i]]
      );
    }

    console.log('Downloading menu item images...');
    const menuImgNames = [
      'menu-butter-biscuit','menu-choco-cookie','menu-coconut-biscuit','menu-cream-cookie',
      'menu-gulab-jamun','menu-rasgulla','menu-jalebi','menu-kaju-katli',
      'menu-black-forest','menu-vanilla-pastry','menu-pineapple','menu-fruit-pastry',
      'menu-wheat-bread','menu-burger-bun','menu-pav','menu-garlic-bread',
      'menu-mixture','menu-bhujia','menu-murukku','menu-banana-chips',
      'menu-tea','menu-coffee','menu-cold-drink','menu-buttermilk',
      'menu-samosa','menu-spring-roll','menu-french-fries'
    ];
    for (const n of menuImgNames) realImage(n);
    const keyToName = {
      'menu-butter-biscuit':'Butter Biscuits','menu-choco-cookie':'Chocolate Cookies',
      'menu-coconut-biscuit':'Coconut Biscuits','menu-cream-cookie':'Cream Cookies',
      'menu-gulab-jamun':'Gulab Jamun','menu-rasgulla':'Rasgulla','menu-jalebi':'Jalebi','menu-kaju-katli':'Kaju Katli',
      'menu-black-forest':'Black Forest Cake','menu-vanilla-pastry':'Vanilla Pastry',
      'menu-pineapple':'Pineapple Cake','menu-fruit-pastry':'Fruit Pastry',
      'menu-wheat-bread':'Wheat Bread','menu-burger-bun':'Burger Bun','menu-pav':'Pav / Bun','menu-garlic-bread':'Garlic Bread',
      'menu-mixture':'Mixture','menu-bhujia':'Bhujia','menu-murukku':'Murukku','menu-banana-chips':'Banana Chips',
      'menu-tea':'Tea','menu-coffee':'Coffee','menu-cold-drink':'Cold Drink','menu-buttermilk':'Buttermilk',
      'menu-samosa':'Samosa','menu-spring-roll':'Spring Roll','menu-french-fries':'French Fries'
    };
    const menuImgs = {};
    for (const [key, displayName] of Object.entries(keyToName)) {
      menuImgs[displayName] = `/uploads/${key}.jpg`;
    }

    console.log('Creating menu items...');
    const menuData = [
      [1, 'Butter Biscuits', 40], [1, 'Chocolate Cookies', 60], [1, 'Coconut Biscuits', 50], [1, 'Cream Cookies', 70],
      [2, 'Gulab Jamun', 120], [2, 'Rasgulla', 100], [2, 'Jalebi', 80], [2, 'Kaju Katli', 250],
      [3, 'Black Forest Cake', 400], [3, 'Vanilla Pastry', 60], [3, 'Pineapple Cake', 350], [3, 'Fruit Pastry', 70],
      [4, 'Wheat Bread', 40], [4, 'Burger Bun', 10], [4, 'Pav / Bun', 8], [4, 'Garlic Bread', 60],
      [5, 'Mixture', 80], [5, 'Bhujia', 70], [5, 'Murukku', 90], [5, 'Banana Chips', 100],
      [6, 'Tea', 20], [6, 'Coffee', 30], [6, 'Cold Drink', 40], [6, 'Buttermilk', 25],
    ];
    for (const [catId, name, price] of menuData) {
      await connection.query(
        'INSERT INTO menu_items (name, price, image, category_id) VALUES (?, ?, ?, ?)',
        [name, price, menuImgs[name], catId]
      );
    }

    console.log('Creating uncategorized menu items...');
    const uncatData = [
      ['Samosa', 15], ['Spring Roll', 25], ['French Fries', 80]
    ];
    for (const [name, price] of uncatData) {
      await connection.query(
        'INSERT INTO menu_items (name, price, image, category_id) VALUES (?, ?, ?, NULL)',
        [name, price, menuImgs[name]]
      );
    }

    console.log('\n=== Seed completed successfully! ===');
    console.log('Admin: admin / admin123');
    console.log('Waiters: rahul / waiter123, priya / waiter123, amit / waiter123, sneha / waiter123');
    console.log('6 tables, 4 waiters, 6 categories, 27 menu items created.');

  } catch (error) {
    console.error('Seed error:', error);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

seed();
