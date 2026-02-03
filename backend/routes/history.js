const express = require("express");
const router = express.Router();
const SpeedTest = require("../models/SpeedTest");

/**
 * POST /api/history
 * Save a new speed test result
 */
router.post("/", async (req, res) => {
  try {
    const { download, upload, ping, location, isp } = req.body;

    const newTest = new SpeedTest({
      download,
      upload,
      ping,
      location,
      isp
    });

    await newTest.save();

    res.status(201).json({
      message: "Speed test saved successfully",
      data: newTest
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/history?limit=10
 * Get latest speed test history
 */
router.get("/", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const history = await SpeedTest.find()
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/history
 * Clear all history
 */
router.delete("/", async (req, res) => {
  try {
    await SpeedTest.deleteMany({});
    res.json({ message: "History cleared successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
