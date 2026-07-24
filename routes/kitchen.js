const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateKitchen } = require('../middleware/auth');

router.post('/generate-kot', authenticateKitchen, async (req, res) => {
  try {
    const { order_id, table_id, table_number, waiter_id, waiter_name, order_type, notes } = req.body;
    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }

    const [pendingItems] = await pool.query(
      `SELECT oi.id as order_item_id, oi.menu_item_id, m.name as item_name,
              oi.quantity, oi.price, oi.notes, oi.variant_name, oi.addon_names,
              oi.tax_percentage,
              (oi.quantity - GREATEST(oi.kot_sent_quantity, COALESCE(sent.total_sent, 0))) as pending_qty
       FROM order_items oi
       INNER JOIN menu_items m ON oi.menu_item_id = m.id
       LEFT JOIN (
         SELECT ki.menu_item_id, SUM(ki.quantity) as total_sent
         FROM kot k
         INNER JOIN kot_items ki ON k.id = ki.kot_id
         WHERE k.order_id = ?
         GROUP BY ki.menu_item_id
       ) sent ON oi.menu_item_id = sent.menu_item_id
       WHERE oi.order_id = ? AND oi.quantity > GREATEST(oi.kot_sent_quantity, COALESCE(sent.total_sent, 0))`,
      [order_id, order_id]
    );

    if (pendingItems.length === 0) {
      return res.status(400).json({ error: 'No new items to send to kitchen' });
    }

    const [kotResult] = await pool.query(
      'INSERT INTO kot (order_id, kot_number, table_id, table_number, waiter_id, waiter_name, order_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [order_id, `KOT-${Date.now()}`, table_id, table_number, waiter_id, waiter_name, order_type, notes || null]
    );
    const kotId = kotResult.insertId;

    for (const item of pendingItems) {
      await pool.query(
        'INSERT INTO kot_items (kot_id, menu_item_id, item_name, quantity, price, notes, variant_name, addon_names) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [kotId, item.menu_item_id, item.item_name, item.pending_qty, item.price, item.notes || null,
         item.variant_name || null, item.addon_names || null]
      );

      await pool.query(
        'UPDATE order_items SET kot_sent_quantity = quantity WHERE id = ?',
        [item.order_item_id]
      );
    }

    await pool.query("UPDATE orders SET kot_status = 'sent' WHERE id = ?", [order_id]);

    const [kot] = await pool.query('SELECT * FROM kot WHERE id = ?', [kotId]);
    const [kotItems] = await pool.query('SELECT * FROM kot_items WHERE kot_id = ?', [kotId]);

    res.status(201).json({ message: 'KOT generated successfully', kot: { ...kot[0], items: kotItems } });
  } catch (error) {
    console.error('Generate KOT error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `SELECT k.*, 
                  (SELECT COUNT(*) FROM kot_items ki WHERE ki.kot_id = k.id) as item_count 
                 FROM kot k`;
    let params = [];
    if (status === 'cancelled') {
      query += " WHERE k.status = 'cancelled'";
    } else if (status && status !== 'all') {
      query += ' WHERE k.status = ?';
      params.push(status);
    } else {
      query += " WHERE k.status != 'cancelled'";
    }
    query += ' ORDER BY k.created_at DESC';
    const [kots] = await pool.query(query, params);

    for (const kot of kots) {
      const [items] = await pool.query('SELECT * FROM kot_items WHERE kot_id = ?', [kot.id]);
      kot.items = items;
    }

    res.json(kots);
  } catch (error) {
    console.error('Get KOTs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const { status, chef_username, chef_code, chef_name, reason } = req.body;
    const validStatuses = ['pending', 'preparing', 'ready', 'served', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Determine auth method: JWT token or chef body credentials
    const authHeader = req.header('Authorization');
    let userRole = null;
    let isChefAuth = false;
    let authenticatedChef = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // JWT authentication
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(authHeader.replace('Bearer ', ''), process.env.JWT_SECRET);
        userRole = decoded.role;

        if (userRole === 'chef') {
          authenticatedChef = { name: decoded.name, username: decoded.username, chef_code: decoded.chef_code };
        }
      } catch (e) {
        return res.status(401).json({ error: 'Invalid token.' });
      }
    } else if (chef_username && chef_code) {
      // Chef body authentication — validate against staff table
      const [rows] = await pool.query(
        "SELECT id, name, username, chef_code FROM waiters WHERE username = ? AND chef_code = ? AND role = 'chef' AND is_active = 1",
        [chef_username, chef_code]
      );
      if (rows.length === 0) {
        return res.status(403).json({ error: 'Invalid chef credentials' });
      }
      authenticatedChef = rows[0];
      isChefAuth = true;
      userRole = 'chef';
    } else {
      // No authentication provided — return error
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [current] = await pool.query('SELECT * FROM kot WHERE id = ?', [req.params.id]);
    if (current.length === 0) return res.status(404).json({ error: 'KOT not found' });

    // Role-based permission checks
    if (status === 'cancelled') {
      if (!['pending', 'preparing'].includes(current[0].status)) {
        return res.status(400).json({ error: 'Can only cancel pending or preparing orders' });
      }
      if (userRole === 'waiter') {
        return res.status(403).json({ error: 'Waiters cannot cancel orders' });
      }
      const cancellerName = current[0].assigned_chef_name || authenticatedChef?.name || userRole || 'Admin';
      await pool.query(
        'UPDATE kot SET status = ?, cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ? WHERE id = ?',
        ['cancelled', cancellerName, reason || null, req.params.id]
      );
      if (current[0].order_id) {
        const [remaining] = await pool.query(
          "SELECT COUNT(*) as count FROM kot WHERE order_id = ? AND status IN ('pending', 'preparing', 'ready')",
          [current[0].order_id]
        );
        if (remaining[0].count === 0) {
          await pool.query(
            'UPDATE orders SET status = ?, cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ? WHERE id = ?',
            ['cancelled', cancellerName, reason || null, current[0].order_id]
          );
          if (current[0].table_id) {
            await pool.query("UPDATE tables_ SET status = 'open' WHERE id = ?", [current[0].table_id]);
          }
        }
      }
    } else {
      if (userRole === 'waiter') {
        if (status !== 'served') {
          return res.status(403).json({ error: 'Waiters can only serve ready orders' });
        }
        if (current[0].status !== 'ready') {
          return res.status(400).json({ error: 'Order must be ready before serving' });
        }
        await pool.query('UPDATE kot SET status = ? WHERE id = ?', [status, req.params.id]);
      }

      if (userRole === 'chef') {
        if (status === 'preparing') {
          if (current[0].status !== 'pending') {
            return res.status(400).json({ error: 'Order must be pending before preparing' });
          }
          const chefDisplayName = authenticatedChef.name || chef_name || authenticatedChef.username;
          await pool.query(
            'UPDATE kot SET status = ?, assigned_chef_name = ?, assigned_chef_username = ?, assigned_chef_code = ?, assigned_time = NOW() WHERE id = ?',
            [status, chefDisplayName, authenticatedChef.username, authenticatedChef.chef_code, req.params.id]
          );
        } else {
          if (current[0].assigned_chef_username && current[0].assigned_chef_username !== authenticatedChef.username) {
            return res.status(403).json({ error: 'Only the assigned chef can update this order' });
          }
          await pool.query('UPDATE kot SET status = ? WHERE id = ?', [status, req.params.id]);
        }
      }

      if (userRole === 'admin') {
        if (status === 'preparing' && authenticatedChef) {
          await pool.query(
            'UPDATE kot SET status = ?, assigned_chef_name = ?, assigned_chef_username = ?, assigned_chef_code = ?, assigned_time = NOW() WHERE id = ?',
            [status, authenticatedChef.name || authenticatedChef.username, authenticatedChef.username, authenticatedChef.chef_code, req.params.id]
          );
        } else {
          await pool.query('UPDATE kot SET status = ? WHERE id = ?', [status, req.params.id]);
        }
      }
    }

    const [kot] = await pool.query('SELECT * FROM kot WHERE id = ?', [req.params.id]);
    if (kot.length > 0 && kot[0].order_id && status === 'ready') {
      const [items] = await pool.query('SELECT * FROM kot_items WHERE kot_id = ?', [kot[0].id]);
      res.json({ message: 'KOT status updated', kot: { ...kot[0], items }, notify_billing: true });
    } else {
      res.json({ message: 'KOT status updated', kot: kot[0] || null });
    }
  } catch (error) {
    console.error('Update KOT status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/ready-for-billing', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT k.*, o.table_id, t.table_number as tbl_number,
              (SELECT COUNT(*) FROM kot_items ki WHERE ki.kot_id = k.id) as item_count
       FROM kot k
       LEFT JOIN orders o ON k.order_id = o.id
       LEFT JOIN tables_ t ON o.table_id = t.id
       WHERE k.status = 'ready'
       ORDER BY k.updated_at DESC`
    );
    for (const row of rows) {
      const [items] = await pool.query('SELECT * FROM kot_items WHERE kot_id = ?', [row.id]);
      row.items = items;
    }
    res.json(rows);
  } catch (error) {
    console.error('Get ready for billing error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [pending] = await pool.query("SELECT COUNT(*) as count FROM kot WHERE status = 'pending'");
    const [preparing] = await pool.query("SELECT COUNT(*) as count FROM kot WHERE status = 'preparing'");
    const [ready] = await pool.query("SELECT COUNT(*) as count FROM kot WHERE status = 'ready'");
    const [served] = await pool.query("SELECT COUNT(*) as count FROM kot WHERE status = 'served'");
    const [all] = await pool.query("SELECT COUNT(*) as count FROM kot WHERE status != 'cancelled'");
    res.json({
      all: all[0].count,
      pending: pending[0].count,
      preparing: preparing[0].count,
      ready: ready[0].count,
      served: served[0].count
    });
  } catch (error) {
    console.error('Get KOT stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
