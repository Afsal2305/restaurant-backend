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

module.exports = router;
