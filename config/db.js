const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
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

    await connection.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT,
        category VARCHAR(50) DEFAULT 'general',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS menu_item_variants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        menu_item_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        price_adjustment DECIMAL(10,2) DEFAULT 0.00,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS menu_item_addons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        menu_item_id INT NOT NULL,
        name VARCHAR(200) NOT NULL,
        price DECIMAL(10,2) DEFAULT 0.00,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS kot (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT DEFAULT NULL,
        kot_number VARCHAR(50) NOT NULL,
        table_id INT DEFAULT NULL,
        table_number VARCHAR(50) DEFAULT NULL,
        waiter_id INT DEFAULT NULL,
        waiter_name VARCHAR(200) DEFAULT NULL,
        order_type VARCHAR(50) DEFAULT 'dine_in',
        status ENUM('pending', 'preparing', 'ready', 'served') DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
        FOREIGN KEY (table_id) REFERENCES tables_(id) ON DELETE SET NULL,
        FOREIGN KEY (waiter_id) REFERENCES waiters(id) ON DELETE SET NULL
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS kot_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kot_id INT NOT NULL,
        menu_item_id INT DEFAULT NULL,
        item_name VARCHAR(200) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        price DECIMAL(10,2) DEFAULT 0.00,
        notes TEXT,
        variant_name VARCHAR(100) DEFAULT NULL,
        addon_names TEXT,
        FOREIGN KEY (kot_id) REFERENCES kot(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS printer_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        printer_type ENUM('thermal_58', 'thermal_80', 'a4') DEFAULT 'thermal_80',
        connection_type ENUM('usb', 'network', 'bluetooth') DEFAULT 'usb',
        ip_address VARCHAR(100) DEFAULT NULL,
        port INT DEFAULT 9100,
        is_default TINYINT(1) DEFAULT 0,
        auto_print_kot TINYINT(1) DEFAULT 0,
        auto_print_bill TINYINT(1) DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Check migration version to avoid running ALTER TABLEs on every startup
    let migrationVersion = 0;
    try {
      const [versionRows] = await connection.query(
        "SELECT setting_value FROM settings WHERE setting_key = 'migration_version'"
      );
      if (versionRows.length > 0) migrationVersion = parseInt(versionRows[0].setting_value) || 0;
    } catch (e) {}

    if (migrationVersion < 2) {
      try { await connection.query("ALTER TABLE waiters ADD COLUMN role ENUM('waiter', 'chef') DEFAULT 'waiter' AFTER image"); } catch (e) {}
      try { await connection.query("ALTER TABLE waiters ADD COLUMN chef_code VARCHAR(50) DEFAULT NULL AFTER role"); } catch (e) {}
      try { await connection.query("ALTER TABLE waiters ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER chef_code"); } catch (e) {}
      try { await connection.query("UPDATE waiters SET role = 'waiter' WHERE role IS NULL"); } catch (e) {}
      try { await connection.query("ALTER TABLE kot ADD COLUMN assigned_chef_name VARCHAR(200) DEFAULT NULL AFTER waiter_name"); } catch (e) {}
      try { await connection.query("ALTER TABLE kot ADD COLUMN assigned_chef_code VARCHAR(50) DEFAULT NULL AFTER assigned_chef_name"); } catch (e) {}
      try { await connection.query("ALTER TABLE kot ADD COLUMN assigned_time DATETIME DEFAULT NULL AFTER assigned_chef_code"); } catch (e) {}
      try { await connection.query("ALTER TABLE kot ADD COLUMN assigned_chef_username VARCHAR(100) DEFAULT NULL AFTER assigned_chef_name"); } catch (e) {}
      try {
        await connection.query(
          "INSERT INTO settings (setting_key, setting_value, category) VALUES ('migration_version', '2', 'system') ON DUPLICATE KEY UPDATE setting_value = '2'"
        );
      } catch (e) {}
    }

    if (migrationVersion < 1) {
      try { await connection.query('ALTER TABLE menu_items ADD COLUMN tax_id INT DEFAULT NULL AFTER category_id'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN subtotal DECIMAL(10,2) DEFAULT 0.00 AFTER status'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN tax_amount DECIMAL(10,2) DEFAULT 0.00 AFTER subtotal'); } catch (e) {}
      try { await connection.query('ALTER TABLE order_items ADD COLUMN tax_percentage DECIMAL(5,2) DEFAULT 0.00 AFTER price'); } catch (e) {}
      try { await connection.query('ALTER TABLE order_items ADD UNIQUE INDEX idx_order_menu (order_id, menu_item_id)'); } catch (e) {}
      try { await connection.query('DELETE dupe FROM order_items dupe INNER JOIN (SELECT MIN(id) as keep_id FROM order_items GROUP BY order_id, menu_item_id HAVING COUNT(*) > 1) kept ON dupe.order_id = kept.order_id AND dupe.menu_item_id = kept.menu_item_id WHERE dupe.id > kept.keep_id'); } catch (e) {}
      try { await connection.query('ALTER TABLE menu_items ADD COLUMN is_vegetarian TINYINT(1) DEFAULT 0 AFTER tax_id'); } catch (e) {}
      try { await connection.query('ALTER TABLE menu_items ADD COLUMN is_available TINYINT(1) DEFAULT 1 AFTER is_vegetarian'); } catch (e) {}
      try { await connection.query('ALTER TABLE menu_items ADD COLUMN food_type ENUM(\'veg\', \'non_veg\', \'egg\') DEFAULT \'veg\' AFTER is_available'); } catch (e) {}
      try { await connection.query('ALTER TABLE menu_items ADD COLUMN stock_status ENUM(\'in_stock\', \'out_of_stock\') DEFAULT \'in_stock\' AFTER food_type'); } catch (e) {}
      try { await connection.query('ALTER TABLE tables_ ADD COLUMN reservation_name VARCHAR(200) DEFAULT NULL AFTER status'); } catch (e) {}
      try { await connection.query('ALTER TABLE tables_ ADD COLUMN reservation_time DATETIME DEFAULT NULL AFTER reservation_name'); } catch (e) {}
      try { await connection.query('ALTER TABLE tables_ ADD COLUMN merged_with VARCHAR(200) DEFAULT NULL AFTER reservation_time'); } catch (e) {}
      try { await connection.query('ALTER TABLE tables_ MODIFY COLUMN status ENUM(\'open\', \'occupied\', \'ready_to_pay\', \'closed\', \'reserved\', \'cleaning\') DEFAULT \'open\''); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN order_type ENUM(\'dine_in\', \'parcel\', \'take_away\', \'delivery\') DEFAULT \'dine_in\' AFTER waiter_id'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN customer_name VARCHAR(200) DEFAULT NULL AFTER order_type'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN customer_phone VARCHAR(20) DEFAULT NULL AFTER customer_name'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN customer_address TEXT DEFAULT NULL AFTER customer_phone'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN delivery_charge DECIMAL(10,2) DEFAULT 0.00 AFTER total'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN packing_charge DECIMAL(10,2) DEFAULT 0.00 AFTER delivery_charge'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN parcel_charge DECIMAL(10,2) DEFAULT 0.00 AFTER packing_charge'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) DEFAULT 0.00 AFTER parcel_charge'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN discount_type ENUM(\'percentage\', \'fixed\') DEFAULT \'fixed\' AFTER discount'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN round_off DECIMAL(10,2) DEFAULT 0.00 AFTER discount_type'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN kot_status ENUM(\'pending\', \'partial\', \'sent\', \'completed\') DEFAULT \'pending\' AFTER round_off'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN instructions TEXT DEFAULT NULL AFTER kot_status'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN delivery_boy VARCHAR(200) DEFAULT NULL AFTER instructions'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN expected_delivery_time DATETIME DEFAULT NULL AFTER delivery_boy'); } catch (e) {}
      try { await connection.query('ALTER TABLE orders ADD COLUMN hold TINYINT(1) DEFAULT 0 AFTER expected_delivery_time'); } catch (e) {}
      try { await connection.query('ALTER TABLE order_items ADD COLUMN notes TEXT DEFAULT NULL AFTER tax_percentage'); } catch (e) {}
      try { await connection.query('ALTER TABLE order_items ADD COLUMN variant_name VARCHAR(100) DEFAULT NULL AFTER notes'); } catch (e) {}
      try { await connection.query('ALTER TABLE order_items ADD COLUMN addon_names TEXT DEFAULT NULL AFTER variant_name'); } catch (e) {}
      try { await connection.query('ALTER TABLE payments ADD COLUMN payment_method ENUM(\'cash\', \'upi\', \'card\', \'split\', \'voucher\', \'multiple\') DEFAULT \'split\' AFTER type'); } catch (e) {}
      try { await connection.query('ALTER TABLE payments ADD COLUMN cash_amount DECIMAL(10,2) DEFAULT 0.00 AFTER payment_method'); } catch (e) {}
      try { await connection.query('ALTER TABLE payments ADD COLUMN upi_amount DECIMAL(10,2) DEFAULT 0.00 AFTER cash_amount'); } catch (e) {}
      try { await connection.query('ALTER TABLE payments ADD COLUMN card_amount DECIMAL(10,2) DEFAULT 0.00 AFTER upi_amount'); } catch (e) {}
      try { await connection.query('ALTER TABLE payments ADD COLUMN voucher_amount DECIMAL(10,2) DEFAULT 0.00 AFTER card_amount'); } catch (e) {}
      try { await connection.query('ALTER TABLE payments ADD COLUMN gift_voucher_code VARCHAR(100) DEFAULT NULL AFTER voucher_amount'); } catch (e) {}
      try { await connection.query('ALTER TABLE payments ADD COLUMN bill_number VARCHAR(50) DEFAULT NULL AFTER gift_voucher_code'); } catch (e) {}
      try { await connection.query('ALTER TABLE parcel_bills ADD COLUMN customer_phone VARCHAR(20) DEFAULT NULL AFTER customer_name'); } catch (e) {}
      try { await connection.query('ALTER TABLE parcel_bills ADD COLUMN customer_address TEXT DEFAULT NULL AFTER customer_phone'); } catch (e) {}
      try { await connection.query('ALTER TABLE parcel_bills ADD COLUMN parcel_charge DECIMAL(10,2) DEFAULT 0.00 AFTER total'); } catch (e) {}
      try { await connection.query('ALTER TABLE parcel_bills ADD COLUMN delivery_charge DECIMAL(10,2) DEFAULT 0.00 AFTER parcel_charge'); } catch (e) {}
      try { await connection.query('ALTER TABLE parcel_bills ADD COLUMN packing_charge DECIMAL(10,2) DEFAULT 0.00 AFTER delivery_charge'); } catch (e) {}
      try { await connection.query('ALTER TABLE parcel_bills ADD COLUMN discount DECIMAL(10,2) DEFAULT 0.00 AFTER packing_charge'); } catch (e) {}
      try { await connection.query('ALTER TABLE parcel_bills ADD COLUMN round_off DECIMAL(10,2) DEFAULT 0.00 AFTER discount'); } catch (e) {}

      try {
        await connection.query(
          "INSERT INTO settings (setting_key, setting_value, category) VALUES ('migration_version', '1', 'system') ON DUPLICATE KEY UPDATE setting_value = '1'"
        );
      } catch (e) {}
    }

    // Insert default settings
    const defaultSettings = [
      ['restaurant_name', 'My Restaurant', 'restaurant'],
      ['restaurant_address', '', 'restaurant'],
      ['restaurant_phone', '', 'restaurant'],
      ['restaurant_email', '', 'restaurant'],
      ['restaurant_website', '', 'restaurant'],
      ['restaurant_gst', '', 'restaurant'],
      ['restaurant_fssai', '', 'restaurant'],
      ['invoice_footer', 'Thank you, visit again!', 'restaurant'],
      ['thank_you_message', 'Thank You!', 'restaurant'],
      ['currency', 'INR', 'restaurant'],
      ['timezone', 'Asia/Kolkata', 'restaurant'],
      ['enable_gst', 'false', 'billing'],
      ['enable_service_charge', 'false', 'billing'],
      ['enable_round_off', 'false', 'billing'],
      ['enable_discount', 'false', 'billing'],
      ['auto_bill_number', 'true', 'billing'],
      ['auto_kot_number', 'true', 'billing'],
      ['print_duplicate_bills', 'false', 'billing'],
      ['auto_print_bill', 'false', 'billing'],
      ['auto_print_kot', 'false', 'billing'],
      ['bill_size', 'thermal_80', 'billing'],
      ['allow_hold_orders', 'true', 'order'],
      ['allow_table_merge', 'true', 'order'],
      ['allow_table_split', 'true', 'order'],
      ['allow_edit_after_kot', 'false', 'order'],
      ['allow_bill_cancellation', 'true', 'order'],
      ['allow_refund', 'true', 'order'],
      ['auto_release_table', 'true', 'order'],
      ['delivery_charges', '0', 'order'],
      ['packing_charges', '0', 'order'],
      ['auto_print_kot_kitchen', 'false', 'kitchen'],
      ['print_item_notes', 'true', 'kitchen'],
      ['kitchen_notification_sound', 'true', 'kitchen'],
      ['enable_customer_details', 'false', 'order'],
      ['enable_table_reservation', 'true', 'order'],
      ['enable_inventory', 'false', 'inventory'],
      ['enable_kitchen_notifications', 'true', 'kitchen'],
      ['enable_sound_alerts', 'true', 'general'],
      ['enable_backup_reminder', 'true', 'backup'],
      ['theme', 'light', 'appearance'],
      ['accent_color', '#111827', 'appearance'],
      ['font_size', '14', 'appearance'],
      ['compact_mode', 'false', 'appearance'],
    ];

    for (const [key, value, category] of defaultSettings) {
      try {
        await connection.query(
          'INSERT IGNORE INTO settings (setting_key, setting_value, category) VALUES (?, ?, ?)',
          [key, value, category]
        );
      } catch (e) {}
    }

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
