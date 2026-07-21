const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { authenticateAdmin } = require('../middleware/auth');
const upload = require('../config/upload');

router.post('/waiter', authenticateAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Image upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    const { name, username, password } = req.body;
    let { tableIds } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Name, username, and password are required' });
    }
    if (typeof tableIds === 'string') {
      try { tableIds = JSON.parse(tableIds); } catch { tableIds = []; }
    }
    const [existing] = await pool.query('SELECT * FROM waiters WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const image = req.file ? '/uploads/' + req.file.filename : null;
    const [result] = await pool.query(
      'INSERT INTO waiters (name, username, password, image) VALUES (?, ?, ?, ?)',
      [name, username, hashedPassword, image]
    );
    const waiterId = result.insertId;
    if (tableIds && Array.isArray(tableIds) && tableIds.length > 0) {
      for (const tableId of tableIds) {
        await pool.query('INSERT INTO waiter_tables (waiter_id, table_id) VALUES (?, ?)', [waiterId, tableId]);
      }
    }
    res.status(201).json({ message: 'Waiter created successfully', id: waiterId });
  } catch (error) {
    console.error('Create waiter error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/waiters', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, username, image, created_at FROM waiters ORDER BY created_at DESC');
    const waitersWithTables = await Promise.all(rows.map(async (waiter) => {
      const [tables] = await pool.query(
        `SELECT t.id, t.table_number FROM tables_ t INNER JOIN waiter_tables wt ON t.id = wt.table_id WHERE wt.waiter_id = ?`,
        [waiter.id]
      );
      return { ...waiter, assigned_tables: tables };
    }));
    res.json(waitersWithTables);
  } catch (error) {
    console.error('Get waiters error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/waiter/:id', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, username, image, created_at FROM waiters WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Waiter not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Get waiter error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/waiter/:id', authenticateAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Image upload failed' });
    next();
  });
}, async (req, res) => {
  try {
    const { name, username, password } = req.body;
    let { tableIds } = req.body;
    const waiterId = req.params.id;
    const [existing] = await pool.query('SELECT * FROM waiters WHERE id = ?', [waiterId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Waiter not found' });
    }
    let query = 'UPDATE waiters SET name = ?, username = ?';
    let params = [name || existing[0].name, username || existing[0].username];
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = ?';
      params.push(hashedPassword);
    }
    if (req.file) {
      query += ', image = ?';
      params.push('/uploads/' + req.file.filename);
    }
    query += ' WHERE id = ?';
    params.push(waiterId);
    await pool.query(query, params);
    if (tableIds) {
      if (typeof tableIds === 'string') {
        try { tableIds = JSON.parse(tableIds); } catch { tableIds = []; }
      }
      if (Array.isArray(tableIds)) {
        await pool.query('DELETE FROM waiter_tables WHERE waiter_id = ?', [waiterId]);
        for (const tableId of tableIds) {
          await pool.query('INSERT INTO waiter_tables (waiter_id, table_id) VALUES (?, ?)', [waiterId, tableId]);
        }
      }
    }
    res.json({ message: 'Waiter updated successfully' });
  } catch (error) {
    console.error('Update waiter error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/waiter/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM waiters WHERE id = ?', [req.params.id]);
    res.json({ message: 'Waiter deleted successfully' });
  } catch (error) {
    console.error('Delete waiter error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/waiter/:waiterId/tables', authenticateAdmin, async (req, res) => {
  try {
    const { tableIds } = req.body;
    const { waiterId } = req.params;
    if (!tableIds || !Array.isArray(tableIds) || tableIds.length === 0) {
      return res.status(400).json({ error: 'tableIds array is required' });
    }
    await pool.query('DELETE FROM waiter_tables WHERE waiter_id = ?', [waiterId]);
    for (const tableId of tableIds) {
      await pool.query('INSERT INTO waiter_tables (waiter_id, table_id) VALUES (?, ?)', [waiterId, tableId]);
    }
    res.json({ message: 'Tables assigned successfully' });
  } catch (error) {
    console.error('Assign tables error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/waiter/:waiterId/tables', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.* FROM tables_ t 
       INNER JOIN waiter_tables wt ON t.id = wt.table_id 
       WHERE wt.waiter_id = ?`,
      [req.params.waiterId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Get waiter tables error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== STAFF MANAGEMENT (Unified: waiters + chefs) ====================

router.get('/staff', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, username, role, chef_code, is_active, image, created_at FROM waiters ORDER BY created_at DESC'
    );
    const staffWithTables = await Promise.all(rows.map(async (staff) => {
      if (staff.role === 'waiter') {
        const [tables] = await pool.query(
          `SELECT t.id, t.table_number FROM tables_ t INNER JOIN waiter_tables wt ON t.id = wt.table_id WHERE wt.waiter_id = ?`,
          [staff.id]
        );
        return { ...staff, assigned_tables: tables };
      }
      return { ...staff, assigned_tables: [] };
    }));
    res.json(staffWithTables);
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/staff', authenticateAdmin, async (req, res) => {
  try {
    const { name, username, password, role, chef_code } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'Name, username, password, and role are required' });
    }
    if (!['waiter', 'chef'].includes(role)) {
      return res.status(400).json({ error: 'Role must be waiter or chef' });
    }
    if (role === 'chef' && !chef_code) {
      return res.status(400).json({ error: 'Chef code is required for chef role' });
    }
    const [existing] = await pool.query('SELECT * FROM waiters WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    if (role === 'chef') {
      const [existingCode] = await pool.query('SELECT * FROM waiters WHERE chef_code = ? AND role = ?', [chef_code, 'chef']);
      if (existingCode.length > 0) {
        return res.status(400).json({ error: 'Chef code already exists' });
      }
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO waiters (name, username, password, role, chef_code, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [name, username, hashedPassword, role, role === 'chef' ? chef_code : null]
    );
    res.status(201).json({ message: 'Staff created successfully', id: result.insertId });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/staff/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name, username, password, role, chef_code, is_active } = req.body;
    const staffId = req.params.id;
    const [existing] = await pool.query('SELECT * FROM waiters WHERE id = ?', [staffId]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Staff not found' });
    }
    if (role && !['waiter', 'chef'].includes(role)) {
      return res.status(400).json({ error: 'Role must be waiter or chef' });
    }
    if ((role === 'chef' || (!role && existing[0].role === 'chef')) && chef_code) {
      const [existingCode] = await pool.query(
        'SELECT * FROM waiters WHERE chef_code = ? AND role = ? AND id != ?',
        [chef_code, 'chef', staffId]
      );
      if (existingCode.length > 0) {
        return res.status(400).json({ error: 'Chef code already exists' });
      }
    }
    let query = 'UPDATE waiters SET name = ?, username = ?';
    let params = [name || existing[0].name, username || existing[0].username];
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = ?';
      params.push(hashedPassword);
    }
    if (role) {
      query += ', role = ?';
      params.push(role);
    }
    if (role === 'chef' || (!role && existing[0].role === 'chef')) {
      query += ', chef_code = ?';
      params.push(chef_code !== undefined ? chef_code : existing[0].chef_code);
    } else if (role === 'waiter') {
      query += ', chef_code = NULL';
    }
    if (is_active !== undefined) {
      query += ', is_active = ?';
      params.push(is_active ? 1 : 0);
    }
    query += ' WHERE id = ?';
    params.push(staffId);
    await pool.query(query, params);
    res.json({ message: 'Staff updated successfully' });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/staff/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM waiters WHERE id = ?', [req.params.id]);
    res.json({ message: 'Staff deleted successfully' });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/staff/:id/toggle-active', authenticateAdmin, async (req, res) => {
  try {
    const [staff] = await pool.query('SELECT is_active FROM waiters WHERE id = ?', [req.params.id]);
    if (staff.length === 0) {
      return res.status(404).json({ error: 'Staff not found' });
    }
    const newStatus = staff[0].is_active ? 0 : 1;
    await pool.query('UPDATE waiters SET is_active = ? WHERE id = ?', [newStatus, req.params.id]);
    res.json({ message: `Staff ${newStatus ? 'activated' : 'deactivated'} successfully`, is_active: !!newStatus });
  } catch (error) {
    console.error('Toggle staff active error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== CHEF VALIDATION ====================

router.post('/staff/validate-chef', authenticateAdmin, async (req, res) => {
  try {
    const { name, chef_code } = req.body;
    if (!name || !chef_code) {
      return res.status(400).json({ error: 'Chef name and code are required' });
    }
    const [rows] = await pool.query(
      "SELECT id, name, username, chef_code FROM waiters WHERE name = ? AND chef_code = ? AND role = 'chef' AND is_active = 1",
      [name, chef_code]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invalid chef credentials' });
    }
    res.json({ valid: true, chef: rows[0] });
  } catch (error) {
    console.error('Validate chef error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
