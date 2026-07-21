const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({
    host: 'localhost', user: 'root', password: 'Afsal@9082',
    database: 'hotel_management', waitForConnections: true
  });
  const [orders] = await pool.query("SELECT o.id, o.table_id, o.total, o.order_type, o.status, o.created_at FROM orders o WHERE o.status = 'completed' ORDER BY o.id");
  console.log('All completed orders:', JSON.stringify(orders, null, 2));

  const [payments] = await pool.query("SELECT id, order_id, status, total, type, created_at FROM payments WHERE order_id IS NOT NULL AND order_id IN (SELECT id FROM orders WHERE status = 'completed') ORDER BY order_id");
  console.log('Payments for completed orders:', JSON.stringify(payments, null, 2));

  const [noPay] = await pool.query("SELECT id FROM orders WHERE status = 'completed' AND id NOT IN (SELECT DISTINCT order_id FROM payments WHERE order_id IS NOT NULL)");
  console.log('Completed orders with NO payment record at all:', JSON.stringify(noPay, null, 2));

  await pool.end();
})();
