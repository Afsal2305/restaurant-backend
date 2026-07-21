const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateAdmin } = require('../middleware/auth');

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM settings';
    let params = [];
    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }
    query += ' ORDER BY category, setting_key';
    const [rows] = await pool.query(query, params);
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.category]) grouped[row.category] = {};
      grouped[row.category][row.setting_key] = row.setting_value;
    }
    res.json({ settings: rows, grouped });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:key', authenticateAdmin, async (req, res) => {
  try {
    const { setting_value } = req.body;
    const [existing] = await pool.query('SELECT * FROM settings WHERE setting_key = ?', [req.params.key]);
    if (existing.length > 0) {
      await pool.query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [String(setting_value), req.params.key]);
    } else {
      await pool.query('INSERT INTO settings (setting_key, setting_value, category) VALUES (?, ?, ?)',
        [req.params.key, String(setting_value), req.body.category || 'general']);
    }
    res.json({ message: 'Setting updated', key: req.params.key, value: setting_value });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/', authenticateAdmin, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }
    for (const [key, value] of Object.entries(settings)) {
      const [existing] = await pool.query('SELECT * FROM settings WHERE setting_key = ?', [key]);
      if (existing.length > 0) {
        await pool.query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [String(value), key]);
      } else {
        await pool.query('INSERT INTO settings (setting_key, setting_value, category) VALUES (?, ?, ?)',
          [key, String(value), 'general']);
      }
    }
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Bulk update settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:key', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM settings WHERE setting_key = ?', [req.params.key]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Get setting error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
