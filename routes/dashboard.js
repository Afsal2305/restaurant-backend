const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateAdmin } = require('../middleware/auth');

router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const [totalEarnings] = await pool.query(
      'SELECT COALESCE(SUM(total), 0) as total FROM payments WHERE status = ?',
      ['paid']
    );
    const [parcelEarnings] = await pool.query(
      "SELECT COALESCE(SUM(total), 0) as total FROM parcel_bills WHERE payment_status = 'paid'"
    );
    const [totalOrders] = await pool.query('SELECT COUNT(*) as count FROM orders');
    const [activeOrders] = await pool.query("SELECT COUNT(*) as count FROM orders WHERE status = 'active'");
    const [completedOrders] = await pool.query("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'");
    const [totalTables] = await pool.query('SELECT COUNT(*) as count FROM tables_');
    const [openTables] = await pool.query("SELECT COUNT(*) as count FROM tables_ WHERE status = 'open'");
    const [readyToPayTables] = await pool.query("SELECT COUNT(*) as count FROM tables_ WHERE status = 'ready_to_pay'");
    const [totalWaiters] = await pool.query('SELECT COUNT(*) as count FROM waiters');
    const [totalMenuItems] = await pool.query('SELECT COUNT(*) as count FROM menu_items');

    res.json({
      total_earnings: parseFloat(totalEarnings[0].total) + parseFloat(parcelEarnings[0].total),
      table_earnings: parseFloat(totalEarnings[0].total),
      parcel_earnings: parseFloat(parcelEarnings[0].total),
      total_orders: totalOrders[0].count,
      active_orders: activeOrders[0].count,
      completed_orders: completedOrders[0].count,
      total_tables: totalTables[0].count,
      open_tables: openTables[0].count,
      ready_to_pay_tables: readyToPayTables[0].count,
      total_waiters: totalWaiters[0].count,
      total_menu_items: totalMenuItems[0].count
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/revenue/daily', authenticateAdmin, async (req, res) => {
  try {
    const [tableRevenue] = await pool.query(
      `SELECT DATE(created_at) as date, SUM(total) as total 
       FROM payments WHERE status = 'paid' 
       GROUP BY DATE(created_at) 
       ORDER BY date DESC LIMIT 30`
    );
    const [parcelRevenue] = await pool.query(
      `SELECT DATE(created_at) as date, SUM(total) as total 
       FROM parcel_bills WHERE payment_status = 'paid' 
       GROUP BY DATE(created_at) 
       ORDER BY date DESC LIMIT 30`
    );
    const revenueMap = {};
    for (const row of tableRevenue) {
      const dateStr = new Date(row.date).toISOString().split('T')[0];
      revenueMap[dateStr] = { date: dateStr, table: parseFloat(row.total), parcel: 0 };
    }
    for (const row of parcelRevenue) {
      const dateStr = new Date(row.date).toISOString().split('T')[0];
      if (revenueMap[dateStr]) {
        revenueMap[dateStr].parcel = parseFloat(row.total);
      } else {
        revenueMap[dateStr] = { date: dateStr, table: 0, parcel: parseFloat(row.total) };
      }
    }
    const result = Object.values(revenueMap).sort((a, b) => a.date.localeCompare(b.date));
    res.json(result);
  } catch (error) {
    console.error('Daily revenue error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/revenue/monthly', authenticateAdmin, async (req, res) => {
  try {
    const [tableRevenue] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, SUM(total) as total 
       FROM payments WHERE status = 'paid' 
       GROUP BY DATE_FORMAT(created_at, '%Y-%m') 
       ORDER BY month DESC LIMIT 12`
    );
    const [parcelRevenue] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, SUM(total) as total 
       FROM parcel_bills WHERE payment_status = 'paid' 
       GROUP BY DATE_FORMAT(created_at, '%Y-%m') 
       ORDER BY month DESC LIMIT 12`
    );
    const revenueMap = {};
    for (const row of tableRevenue) {
      revenueMap[row.month] = { month: row.month, table: parseFloat(row.total), parcel: 0 };
    }
    for (const row of parcelRevenue) {
      if (revenueMap[row.month]) {
        revenueMap[row.month].parcel = parseFloat(row.total);
      } else {
        revenueMap[row.month] = { month: row.month, table: 0, parcel: parseFloat(row.total) };
      }
    }
    const result = Object.values(revenueMap).sort((a, b) => a.month.localeCompare(b.month));
    res.json(result);
  } catch (error) {
    console.error('Monthly revenue error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/revenue/daily-trend', authenticateAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.range) || 30;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    const startDate = new Date(yyyy, now.getMonth(), now.getDate());
    startDate.setDate(startDate.getDate() - days + 1);
    const sy = startDate.getFullYear();
    const sm = String(startDate.getMonth() + 1).padStart(2, '0');
    const sd = String(startDate.getDate()).padStart(2, '0');
    const startStr = `${sy}-${sm}-${sd}`;

    const [tablePayments] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date,
              COALESCE(SUM(total), 0) as total_revenue,
              COUNT(*) as order_count
       FROM payments
       WHERE status = 'paid' AND DATE_FORMAT(created_at, '%Y-%m-%d') >= ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
       ORDER BY date ASC`,
      [startStr]
    );

    const [parcelPayments] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date,
              COALESCE(SUM(total), 0) as total_revenue,
              COUNT(*) as order_count
       FROM parcel_bills
       WHERE payment_status = 'paid' AND DATE_FORMAT(created_at, '%Y-%m-%d') >= ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
       ORDER BY date ASC`,
      [startStr]
    );

    const revenueMap = {};
    for (const row of tablePayments) {
      revenueMap[row.date] = {
        date: row.date,
        total_revenue: parseFloat(row.total_revenue),
        order_count: parseInt(row.order_count),
      };
    }
    for (const row of parcelPayments) {
      if (revenueMap[row.date]) {
        revenueMap[row.date].total_revenue += parseFloat(row.total_revenue);
        revenueMap[row.date].order_count += parseInt(row.order_count);
      } else {
        revenueMap[row.date] = {
          date: row.date,
          total_revenue: parseFloat(row.total_revenue),
          order_count: parseInt(row.order_count),
        };
      }
    }

    const result = [];
    const cursor = new Date(startDate);
    const endDate = new Date(yyyy, now.getMonth(), now.getDate());
    while (cursor <= endDate) {
      const cy = cursor.getFullYear();
      const cm = String(cursor.getMonth() + 1).padStart(2, '0');
      const cd = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${cy}-${cm}-${cd}`;
      if (revenueMap[dateStr]) {
        const d = revenueMap[dateStr];
        result.push({
          date: d.date,
          total_revenue: d.total_revenue,
          order_count: d.order_count,
          avg_order_value: d.order_count > 0 ? parseFloat((d.total_revenue / d.order_count).toFixed(2)) : 0,
        });
      } else {
        result.push({
          date: dateStr,
          total_revenue: 0,
          order_count: 0,
          avg_order_value: 0,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    res.json(result);
  } catch (error) {
    console.error('Daily revenue trend error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/top-items', authenticateAdmin, async (req, res) => {
  try {
    const { period, limit } = req.query;
    const itemLimit = parseInt(limit) || 10;

    let dateFilter = '';
    if (period === 'today') {
      dateFilter = 'AND o.created_at >= CURDATE()';
    } else if (period === 'week') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    } else if (period === 'month') {
      dateFilter = 'AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
    }

    const [rows] = await pool.query(
      `SELECT m.id, m.name, m.image, SUM(oi.quantity) as total_quantity, 
              SUM(oi.quantity * oi.price) as total_revenue 
       FROM order_items oi 
       INNER JOIN menu_items m ON oi.menu_item_id = m.id 
       INNER JOIN orders o ON oi.order_id = o.id 
       WHERE o.status = 'completed' ${dateFilter}
       GROUP BY oi.menu_item_id, m.id, m.name, m.image 
       ORDER BY total_quantity DESC LIMIT ?`,
      [itemLimit]
    );

    const items = rows.map(row => ({
      ...row,
      total_quantity: parseInt(row.total_quantity),
      total_revenue: parseFloat(row.total_revenue),
      image: row.image || null
    }));

    res.json(items);
  } catch (error) {
    console.error('Top items error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
