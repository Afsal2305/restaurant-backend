const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateAdmin } = require('../middleware/auth');

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM printer_config ORDER BY is_default DESC, name ASC');
    res.json(rows);
  } catch (error) {
    console.error('Get printers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { name, printer_type, connection_type, ip_address, port, is_default, auto_print_kot, auto_print_bill } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Printer name is required' });
    }
    if (is_default) {
      await pool.query('UPDATE printer_config SET is_default = 0');
    }
    const [result] = await pool.query(
      'INSERT INTO printer_config (name, printer_type, connection_type, ip_address, port, is_default, auto_print_kot, auto_print_bill) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, printer_type || 'thermal_80', connection_type || 'usb', ip_address || null, port || 9100, is_default ? 1 : 0, auto_print_kot ? 1 : 0, auto_print_bill ? 1 : 0]
    );
    res.status(201).json({ message: 'Printer added successfully', id: result.insertId });
  } catch (error) {
    console.error('Add printer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name, printer_type, connection_type, ip_address, port, is_default, auto_print_kot, auto_print_bill, is_active } = req.body;
    const [existing] = await pool.query('SELECT * FROM printer_config WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Printer not found' });
    }
    if (is_default) {
      await pool.query('UPDATE printer_config SET is_default = 0');
    }
    await pool.query(
      'UPDATE printer_config SET name = ?, printer_type = ?, connection_type = ?, ip_address = ?, port = ?, is_default = ?, auto_print_kot = ?, auto_print_bill = ?, is_active = ? WHERE id = ?',
      [
        name || existing[0].name,
        printer_type || existing[0].printer_type,
        connection_type || existing[0].connection_type,
        ip_address !== undefined ? ip_address : existing[0].ip_address,
        port || existing[0].port,
        is_default !== undefined ? (is_default ? 1 : 0) : existing[0].is_default,
        auto_print_kot !== undefined ? (auto_print_kot ? 1 : 0) : existing[0].auto_print_kot,
        auto_print_bill !== undefined ? (auto_print_bill ? 1 : 0) : existing[0].auto_print_bill,
        is_active !== undefined ? (is_active ? 1 : 0) : existing[0].is_active,
        req.params.id
      ]
    );
    res.json({ message: 'Printer updated successfully' });
  } catch (error) {
    console.error('Update printer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM printer_config WHERE id = ?', [req.params.id]);
    res.json({ message: 'Printer deleted successfully' });
  } catch (error) {
    console.error('Delete printer error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

const net = require('net');

router.post('/:id/test', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM printer_config WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Printer not found' });
    }

    const printer = rows[0];

    if (printer.connection_type === 'network' && printer.ip_address) {
      const testData = Buffer.from([
        0x1B, 0x40, // Initialize printer
        0x1B, 0x61, 0x01, // Center align
        ...Buffer.from('=== TEST PRINT ===\n', 'ascii'),
        ...Buffer.from('Printer: ' + printer.name + '\n', 'ascii'),
        ...Buffer.from('Connection OK\n', 'ascii'),
        0x1B, 0x61, 0x00, // Left align
        ...Buffer.from('Date: ' + new Date().toLocaleString() + '\n\n', 'ascii'),
        0x1B, 0x64, 0x03, // Feed 3 lines
        0x1B, 0x6D, // Cut paper
      ]);

      const socket = new net.Socket();
      socket.setTimeout(5000);

      await new Promise((resolve, reject) => {
        socket.connect(printer.port || 9100, printer.ip_address, () => {
          socket.write(testData, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        socket.on('error', (err) => {
          socket.destroy();
          reject(err);
        });
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('Connection timed out'));
        });
      });

      socket.destroy();
      res.json({ message: 'Test print sent successfully to ' + printer.ip_address + ':' + (printer.port || 9100), printer });
    } else {
      res.json({ message: 'Test print queued (connection type: ' + (printer.connection_type || 'usb') + '). Network printers require ip_address configured.', printer: rows[0] });
    }
  } catch (error) {
    console.error('Test print error:', error);
    res.status(500).json({ error: 'Failed to connect to printer: ' + error.message });
  }
});

module.exports = router;
