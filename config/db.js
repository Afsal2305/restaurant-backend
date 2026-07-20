const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Afsal@9082',
  database: process.env.DB_NAME || 'hotel_management',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const createTables = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS waiters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        username VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        image VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tables_ (
        id INT AUTO_INCREMENT PRIMARY KEY,
        table_number VARCHAR(50) NOT NULL UNIQUE,
        capacity INT DEFAULT 4,
        status ENUM('open', 'ready_to_pay', 'closed') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS waiter_tables (
        id INT AUTO_INCREMENT PRIMARY KEY,
        waiter_id INT NOT NULL,
        table_id INT NOT NULL,
        FOREIGN KEY (waiter_id) REFERENCES waiters(id) ON DELETE CASCADE,
        FOREIGN KEY (table_id) REFERENCES tables_(id) ON DELETE CASCADE,
        UNIQUE KEY unique_waiter_table (waiter_id, table_id)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        image VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS taxes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        image VARCHAR(255) DEFAULT NULL,
        category_id INT DEFAULT NULL,
        tax_id INT DEFAULT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (tax_id) REFERENCES taxes(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try { await connection.query('ALTER TABLE menu_items ADD COLUMN tax_id INT DEFAULT NULL AFTER category_id'); } catch (e) {}
    try { await connection.query('ALTER TABLE orders ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0.00 AFTER status'); } catch (e) {}
    try { await connection.query('ALTER TABLE orders ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0.00 AFTER subtotal'); } catch (e) {}
    try { await connection.query('ALTER TABLE order_items ADD COLUMN tax_percentage DECIMAL(5,2) DEFAULT 0.00 AFTER price'); } catch (e) {}
    try { await connection.query('ALTER TABLE order_items ADD UNIQUE INDEX idx_order_menu (order_id, menu_item_id)'); } catch (e) {}
    try { await connection.query('DELETE dupe FROM order_items dupe INNER JOIN (SELECT MIN(id) as keep_id FROM order_items GROUP BY order_id, menu_item_id HAVING COUNT(*) > 1) kept ON dupe.order_id = kept.order_id AND dupe.menu_item_id = kept.menu_item_id WHERE dupe.id > kept.keep_id'); } catch (e) {}

    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        table_id INT NOT NULL,
        waiter_id INT NOT NULL,
        status ENUM('active', 'completed') DEFAULT 'active',
        subtotal DECIMAL(10,2) DEFAULT 0.00,
        tax_amount DECIMAL(10,2) DEFAULT 0.00,
        total DECIMAL(10,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (table_id) REFERENCES tables_(id) ON DELETE CASCADE,
        FOREIGN KEY (waiter_id) REFERENCES waiters(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        menu_item_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        price DECIMAL(10,2) NOT NULL,
        tax_percentage DECIMAL(5,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT DEFAULT NULL,
        table_id INT DEFAULT NULL,
        online_amount DECIMAL(10,2) DEFAULT 0.00,
        offline_amount DECIMAL(10,2) DEFAULT 0.00,
        total DECIMAL(10,2) DEFAULT 0.00,
        status ENUM('paid', 'unpaid') DEFAULT 'unpaid',
        type ENUM('table', 'parcel') DEFAULT 'table',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
        FOREIGN KEY (table_id) REFERENCES tables_(id) ON DELETE SET NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS parcel_bills (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_name VARCHAR(200) DEFAULT 'Walk-in Customer',
        items JSON DEFAULT NULL,
        total DECIMAL(10,2) DEFAULT 0.00,
        online_amount DECIMAL(10,2) DEFAULT 0.00,
        offline_amount DECIMAL(10,2) DEFAULT 0.00,
        payment_status ENUM('paid', 'unpaid') DEFAULT 'unpaid',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [rows] = await connection.query('SELECT * FROM admins WHERE username = ?', ['admin']);
    if (rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await connection.query('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', hashedPassword]);
      console.log('Default admin created: admin / admin123');
    }

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    connection.release();
  }
};

module.exports = { pool, createTables };
